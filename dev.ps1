<#
.SYNOPSIS
  Bring the whole Group Chat Application up with one command.

.DESCRIPTION
  Starts, in order:
    1. Docker services (Postgres + Redis), then waits until both actually ACCEPT CONNECTIONS
    2. Pending Prisma migrations
    3. A backend build  -- the four workers run from dist/, so this must finish first
    4. API + 4 workers + frontend, together, with colour-coded prefixed output

  Steps 1-3 run SEQUENTIALLY on purpose. This machine has ~8 GB RAM and a tsc build
  alongside a Next build is enough to make one of them fail; see -SkipBuild if you
  know dist/ is already current.

  Readiness is a TCP probe, not `docker ps` or `docker inspect`. Under memory pressure the
  Docker CLI on this machine can take minutes to answer or wedge completely while the
  containers themselves are perfectly healthy -- so the script tests the thing the app
  actually needs (can I open a socket?) rather than asking Docker how it feels.

  Ctrl-C stops the API, workers and frontend together. Docker is left running --
  use -Down to stop it, or `docker compose down`.

.EXAMPLE
  .\dev.ps1                 # full start
  .\dev.ps1 -SkipBuild      # dist/ is already current, skip the ~30s build
  .\dev.ps1 -NoWorkers      # chat only; AI summaries will not be generated
  .\dev.ps1 -Clean          # wipe .next and dist first, after a force-killed run
  .\dev.ps1 -Prod           # compiled API instead of watch mode; lower memory
  .\dev.ps1 -Down           # stop Docker and exit
#>
[CmdletBinding()]
param(
  # Skip the backend build. Safe when dist/ is newer than every backend/src file.
  [switch]$SkipBuild,
  # Skip `prisma migrate deploy`. Useful when the schema is known to be applied.
  [switch]$SkipMigrate,
  # Do not start the four BullMQ workers. Chat still works; AI summaries do not.
  [switch]$NoWorkers,
  # Run the compiled API (start:prod) instead of watch mode. Lower memory, no reload.
  [switch]$Prod,
  # Stop the Docker services and exit without starting anything.
  [switch]$Down,
  # Delete frontend/.next and backend/dist before starting. Use this after force-killing a
  # previous run: a hard-killed `next dev` can leave .next in a state where every page 404s
  # while the server itself still answers, which looks like the app is broken rather than
  # the cache. Costs a cold rebuild.
  [switch]$Clean,
  # Published Postgres port. Matches POSTGRES_PORT in docker-compose.yml.
  [int]$PostgresPort = 55432,
  # Published Redis port.
  [int]$RedisPort = 6379,
  # Web (frontend) instances to run ALONE, with no API/Docker/workers. Each port is one Next.js
  # instance served from a single `next build` via `next start`; e.g. -WebPorts 3000..3005 runs
  # six frontends. Dev mode is not used here: Next.js forbids two dev servers in the same project.
  # The frontend's BACKEND_ORIGIN / NEXT_PUBLIC_SOCKET_URL must name a running backend for data.
  [int[]]$WebPorts = @()
)

$ErrorActionPreference = 'Stop'
# Every path below is relative to the repo root, which keeps the space in
# "Group Chat Application" out of the commands handed to concurrently.
Set-Location -Path $PSScriptRoot

function Write-Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Write-Ok($text)       { Write-Host "    $text"    -ForegroundColor Green }
function Write-Warn2($text)    { Write-Host "    $text"    -ForegroundColor Yellow }
function Write-Fail($text)     { Write-Host "    $text"    -ForegroundColor Red }

# A direct socket test. Instant, and independent of the Docker CLI -- which is the whole
# point: a wedged `docker ps` says nothing about whether Postgres is reachable.
function Test-TcpPort {
  param([int]$Port, [int]$TimeoutMs = 1500)
  $client = New-Object Net.Sockets.TcpClient
  try {
    $connected = $client.ConnectAsync('127.0.0.1', $Port).Wait($TimeoutMs)
    return $connected -and $client.Connected
  } catch { return $false } finally { $client.Dispose() }
}

# Runs a native command but gives up after $TimeoutSec rather than hanging the script.
# Returns $true on a clean exit, $false on failure OR timeout.
function Invoke-WithTimeout {
  param([string]$Exe, [string[]]$Args, [int]$TimeoutSec = 180)
  # Set-Location inside the job: Start-Job runs in $HOME on Windows PowerShell 5.1, where
  # `docker compose` would then not find docker-compose.yml and fail as if the CLI were wedged.
  $job = Start-Job -ScriptBlock {
    param($e, $a, $cwd)
    Set-Location $cwd
    & $e @a 2>&1 | Out-String
    $LASTEXITCODE
  } -ArgumentList $Exe, $Args, $PSScriptRoot
  if (Wait-Job $job -Timeout $TimeoutSec) {
    $out = Receive-Job $job
    Remove-Job $job -Force
    return ($out[-1] -eq 0)
  }
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  return $false
}

# ---------------------------------------------------------------- -Down
if ($Down) {
  Write-Step 'stop' 'Stopping Docker services'
  if (Invoke-WithTimeout 'docker' @('compose', 'down') 180) {
    Write-Ok 'Postgres and Redis stopped.'
  } else {
    Write-Fail 'docker compose down did not finish in 180s -- the Docker CLI may be wedged.'
    Write-Warn2 'Restart Docker Desktop if this persists.'
    exit 1
  }
  exit 0
}

# ------------------------------------------------------------- preflight
Write-Step 1 'Preflight'

# Each of these is a thing someone hits on a fresh clone, and each has a fix worth naming.
if (-not (Test-Path 'backend/.env')) {
  Write-Fail 'backend/.env is missing. Copy backend/.env.example and fill it in.'; exit 1
}
if (-not (Test-Path 'frontend/.env.local')) {
  Write-Fail 'frontend/.env.local is missing. Copy frontend/.env.example.'; exit 1
}
if (-not (Test-Path 'backend/node_modules')) {
  Write-Fail 'backend dependencies missing. Run: npm --prefix backend install'; exit 1
}
if (-not (Test-Path 'frontend/node_modules')) {
  Write-Fail 'frontend dependencies missing. Run: npm --prefix frontend install'; exit 1
}
Write-Ok 'Env files and dependencies present.'

if ($Clean) {
  foreach ($dir in 'frontend/.next', 'backend/dist') {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir; Write-Ok "removed $dir" }
  }
}

# Port 3000/3001 already bound almost always means a previous run is still alive.
# Reporting it here beats an EADDRINUSE stack trace 40 seconds into the script.
# Abort rather than warn: step 5's wait-for-port guard passes off the OLD API otherwise.
$blocked = @()
foreach ($p in 3000, 3001) {
  $busy = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
  if ($busy) {
    $ownerPid = $busy[0].OwningProcess
    $procName = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
    Write-Fail "port $p is already in use by $procName (PID $ownerPid)."
    $blocked += $ownerPid
  }
}
if ($blocked.Count -gt 0) {
  Write-Warn2 'A previous run is still alive. Ctrl-C it in its own terminal, or force it down with:'
  Write-Warn2 "  Stop-Process -Id $($blocked -join ',') -Force"
  Write-Warn2 'Its parent `concurrently` will then bring the rest of that run down with it.'
  exit 1
}
Write-Ok 'Ports 3000 and 3001 are free.'

# ------------------------------------------------------ web-only farm (-WebPorts)
if ($WebPorts.Count -gt 0) {
  Write-Step 'fn' 'Web-only farm (no API, no Docker, no workers)'

  # Every instance reads the same frontend/.env. Each port must be free before we start.
  $blocked = @()
  foreach ($p in $WebPorts | Sort-Object -Unique) {
    $ErrorActionPreference = 'SilentlyContinue'
    $busy = Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue
    $ErrorActionPreference = 'Stop'
    if ($busy) {
      $ownerPid = $busy[0].OwningProcess
      $procName = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
      Write-Fail "port $p is already in use by $procName (PID $ownerPid)."
      $blocked += $ownerPid
    }
  }
  if ($blocked.Count -gt 0) {
    Write-Warn2 "Aborting: free those ports first, e.g. Stop-Process -Id $($blocked -join ',') -Force"
    exit 1
  }
  Write-Ok "Ports $($WebPorts -join ', ') are free."

  $names  = (($WebPorts | ForEach-Object { "web$_" }) -join ',')
  $colors = (($WebPorts | ForEach-Object { 'green' }) -join ',')

  # Build once, serve N times. Next.js dev mode refuses to run a second dev server in the same
  # project (a per-directory lock), so the farm serves the compiled build via `next start` - one
  # listener per port with no lock. Takes ~30-60s the first time.
  Write-Host '    Building the frontend once (a fresh build is needed for `next start`)...' -ForegroundColor Gray
  npm --prefix frontend run build
  if ($LASTEXITCODE -ne 0) { Write-Fail 'Frontend build failed.'; exit 1 }
  $commands = @($WebPorts | ForEach-Object {
    "npm --prefix frontend run start:p -- -p $_"
  })

  Write-Host ''
  foreach ($p in $WebPorts) {
    Write-Host "  Frontend  http://localhost:$p" -ForegroundColor Gray
  }
  Write-Host ''
  Write-Host '  Ctrl-C stops them all. No Docker, API or workers are started by this mode.' -ForegroundColor Gray
  Write-Host ''
  Write-Host '  The app still calls a backend named by frontend/.env (BACKEND_ORIGIN /' -ForegroundColor Gray
  Write-Host '  NEXT_PUBLIC_SOCKET_URL) - run that separately or data requests will fail.' -ForegroundColor Gray
  Write-Host ''

  & '.\backend\node_modules\.bin\concurrently.cmd' `
    --names $names `
    --prefix-colors $colors `
    --kill-others-on-fail `
    $commands
  exit 0
}

# ---------------------------------------------------------------- docker
Write-Step 2 'Postgres and Redis'

$pgUp = Test-TcpPort $PostgresPort
$redisUp = Test-TcpPort $RedisPort

if ($pgUp -and $redisUp) {
  # Fast path. Nothing to start, and no reason to touch the Docker CLI at all.
  Write-Ok "Already reachable (Postgres $PostgresPort, Redis $RedisPort)."
} else {
  Write-Host "    Starting containers (Postgres up: $pgUp, Redis up: $redisUp)..." -ForegroundColor Gray
  # Bounded, because `docker compose` inherits whatever state the CLI is in.
  if (-not (Invoke-WithTimeout 'docker' @('compose', 'up', '-d') 240)) {
    Write-Fail 'docker compose up -d failed or timed out after 240s.'
    Write-Warn2 'Is Docker Desktop running? If it is, it may be wedged -- restart it.'
    exit 1
  }

  # Poll the sockets, not the healthcheck: Postgres briefly listens before it is ready, and
  # `docker inspect` is exactly the call that stalls when the CLI is unwell.
  $deadline = (Get-Date).AddSeconds(90)
  while ($true) {
    if ((Test-TcpPort $PostgresPort) -and (Test-TcpPort $RedisPort)) { break }
    if ((Get-Date) -gt $deadline) {
      Write-Fail 'Postgres/Redis did not start accepting connections within 90s.'
      exit 1
    }
    Start-Sleep -Seconds 2
  }
  Write-Ok "Reachable (Postgres $PostgresPort, Redis $RedisPort)."
}

# ------------------------------------------------------------- migrations
if (-not $SkipMigrate) {
  Write-Step 3 'Applying database migrations'
  Push-Location backend
  try {
    # `migrate deploy`, not `migrate dev`: deploy only applies pending migrations and
    # never prompts or offers to reset the database, which is what you want unattended.
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy failed' }
  } finally { Pop-Location }
  Write-Ok 'Schema up to date.'
} else {
  Write-Step 3 'Skipping migrations (-SkipMigrate)'
}

# ------------------------------------------------------------------ build
# Only -Prod needs an explicit build: `start:prod` runs `node dist/main` and compiles nothing.
# In the default watch mode the API's own `nest start --watch` produces dist/, so building here
# first would be wasted work -- and worse, watch DELETES dist/ on startup (nest-cli.json sets
# deleteOutDir: true), so a build done now is thrown away seconds later. The workers are held
# back until the API is listening instead; see step 5.
if ($Prod -and -not $SkipBuild) {
  Write-Step 4 'Building backend (-Prod runs from dist/)'
  Write-Warn2 'Runs alone -- a parallel build is what OOMs this machine.'
  npm --prefix backend run build
  if ($LASTEXITCODE -ne 0) { Write-Fail 'Build failed.'; exit 1 }
  Write-Ok 'dist/ is current.'
} elseif ($Prod) {
  Write-Step 4 'Skipping build (-SkipBuild)'
  if (-not (Test-Path 'backend/dist/main.js')) {
    Write-Warn2 'backend/dist/main.js is missing -- start:prod will fail.'
  }
} else {
  Write-Step 4 'No separate build needed (watch mode compiles dist/ itself)'
}

# ------------------------------------------------------------------ serve
Write-Step 5 'Starting API, workers and frontend'

$apiScript = if ($Prod) { 'start:prod' } else { 'start:dev' }

# Feature flags (backend/.env) decide which services the runner starts. IS_WORKER_ENABLED is the
# master switch for the four workers; each SERVICE_*_ENABLED restricts one service. -NoWorkers
# still forces every worker off. Values are read loosely here (the backend itself validates them
# strictly at boot via env.validation.ts).
function Get-BackendEnvBool {
  param([string]$Key, [bool]$Default = $true)
  $line = Get-Content 'backend\.env' -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) { return $Default }
  $val = $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"').Trim("'")
  switch ($val.ToLowerInvariant()) {
    'true'  { return $true }
    'false' { return $false }
    default { return $Default }
  }
}

$apiEnabled   = Get-BackendEnvBool 'SERVICE_API_ENABLED'
$webEnabled   = Get-BackendEnvBool 'SERVICE_WEB_ENABLED'
$workerMaster = Get-BackendEnvBool 'IS_WORKER_ENABLED'
if ($NoWorkers) { $workerMaster = $false }
$svcFlags = @{
  scheduler    = Get-BackendEnvBool 'SERVICE_SCHEDULER_ENABLED'
  ai           = Get-BackendEnvBool 'SERVICE_AI_ENABLED'
  summary      = Get-BackendEnvBool 'SERVICE_SUMMARY_ENABLED'
  notification = Get-BackendEnvBool 'SERVICE_NOTIFICATION_ENABLED'
}
$runWorkers = $workerMaster -and (($svcFlags.Values | Where-Object { $_ } | Measure-Object).Count -gt 0)

# One row per worker: (flag id, concurrently name, host port, npm script, label, log colour).
# Both modes below build their command list from this table, so a disabled worker is simply absent.
$workerTable = @(
  @{ id='scheduler';    name='sch'; port=3002; script='worker:scheduler';    label='Scheduler   '; color='blue' }
  @{ id='ai';           name='ai';  port=3003; script='worker:ai';           label='AI          '; color='yellow' }
  @{ id='summary';      name='sum'; port=3004; script='worker:summary';      label='Summary     '; color='magenta' }
  @{ id='notification'; name='not'; port=3005; script='worker:notification'; label='Notification'; color='red' }
)

# A worker runs from dist/, which watch mode deletes and rebuilds on API start — so each worker
# waits for the API's port to open as proof the compile finished. If the API is disabled there is
# nothing to gate on, and dist/ must already exist (built on a previous run; we build if missing).
if ($runWorkers -and -not $apiEnabled -and -not (Test-Path 'backend/dist/main.js')) {
  Write-Host '    SERVICE_API_ENABLED=false but dist/ is missing - building backend for the workers...' -ForegroundColor Yellow
  npm --prefix backend run build
  if ($LASTEXITCODE -ne 0) { Write-Fail 'Backend build failed.'; exit 1 }
}
$workerGate = if ($apiEnabled) { 'node scripts/wait-for-port.js 3000 180 && ' } else { '' }

# Colors: api=cyan, web=green, plus the per-worker colour in $workerTable.
$entries = @()
if ($apiEnabled) {
  $entries += @{ name='api'; color='cyan';  cmd="npm --prefix backend run $apiScript" }
}
foreach ($w in $workerTable) {
  if ($workerMaster -and $svcFlags[$w.id]) {
    $entries += @{ name=$w.name; color=$w.color; cmd=("$workerGate" + "npm --prefix backend run $($w.script)") }
  }
}
if ($webEnabled) {
  $entries += @{ name='web'; color='green'; cmd='npm --prefix frontend run dev' }
}

if ($entries.Count -eq 0) {
  Write-Fail 'Every service is disabled by the SERVICE_*_ENABLED flags - nothing to start.'
  exit 1
}

$names    = ($entries | ForEach-Object { $_.name }) -join ','
$colors   = ($entries | ForEach-Object { $_.color }) -join ','
$commands = @($entries | ForEach-Object { $_.cmd })

Write-Host ''
if ($apiEnabled) { Write-Host '  API          http://localhost:3000' -ForegroundColor Gray }
if ($webEnabled) { Write-Host '  Frontend     http://localhost:3001' -ForegroundColor Gray }
foreach ($w in $workerTable) {
  if ($workerMaster -and $svcFlags[$w.id]) {
    Write-Host "  $($w.label) http://localhost:$($w.port)  (worker process - no HTTP)" -ForegroundColor Gray
  }
}
if ($apiEnabled) { Write-Host '  Health       http://localhost:3000/health/ready' -ForegroundColor Gray }
$disabled = @()
if (-not $apiEnabled) { $disabled += 'API (3000)' }
if (-not $webEnabled) { $disabled += 'frontend (3001)' }
foreach ($w in $workerTable) {
  if (-not ($workerMaster -and $svcFlags[$w.id])) { $disabled += "$($w.label.Trim()) worker (300$($w.port - 3000))" }
}
if ($disabled.Count -gt 0) {
  Write-Host "  Skipped by feature flags: $($disabled -join ', ')" -ForegroundColor Yellow
}
Write-Host ''
Write-Host '  Ctrl-C stops all of the above. Docker keeps running (.\dev.ps1 -Down to stop it).' -ForegroundColor Gray
Write-Host ''

# Called by its explicit path rather than npx, so resolution cannot pick up something else.
# --kill-others-on-fail: if the API dies, do not leave the frontend running against nothing.
& '.\backend\node_modules\.bin\concurrently.cmd' `
  --names $names `
  --prefix-colors $colors `
  --kill-others-on-fail `
  $commands
