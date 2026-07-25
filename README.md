<p align="center">
  <img src="assets/banner.svg" alt="Convo — real-time group chat" width="100%">
</p>

# Group Chat Application

A group chat backend built with **NestJS**, **PostgreSQL** and **Prisma**. The project is
developed in five architectural phases, each on its own branch, each building on the last:

```
REST APIs → Polling → WebSockets → Background Jobs (AI) → Distributed Systems
```

This branch (`feature/rest-chat`) is **Phase 1**: the complete app over REST only — custom
JWT auth, Google sign-in, groups, membership, and paginated message history. New messages
appear on refresh (real-time arrives in Phase 3).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | NestJS 11 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Validation | class-validator + class-transformer |
| Auth | JWT (access) + opaque rotating refresh tokens; argon2id; Google ID-token verification |

---

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres and Redis)

---

## Repository layout

This is a monorepo. The NestJS API lives in `backend/`; the Next.js frontend (added in
Phase 2) lives in `frontend/`. Shared dev infrastructure (`docker-compose.yml`) sits at the
root. Run backend commands from `backend/`.

## Setup

```bash
# 1. Start local services (Postgres + Redis) — from the repo root
docker compose up -d

# 2. Backend
cd backend
npm install

# 3. Create your env file and fill it in (inside backend/)
cp .env.example .env
#    - generate two different JWT secrets, e.g.:  openssl rand -base64 48
#    - set GOOGLE_CLIENT_ID to your Google Cloud OAuth client id (for /auth/google)
#    - DATABASE_URL must use port 55432 (the port docker-compose publishes)

# 4. Apply migrations (creates the schema)
npx prisma migrate dev

# 5. Run the API
npm run start:dev
```

> **Port note:** `docker-compose.yml` publishes Postgres on the port in `POSTGRES_PORT`
> (default in this repo: `55432`, chosen to avoid colliding with any native Postgres already on
> 5432/5433). `DATABASE_URL` must use the same port. Inspect the DB with `npm run prisma:studio`
> — it reads `DATABASE_URL`, so it always connects to the right server.

---

## Commands

All backend commands run from `backend/` (except `docker compose`, which runs from the root).

```bash
npm run start:dev       # API with watch reload
npm run start:prod      # build + run compiled output
npm run build           # compile
npm run lint            # eslint --fix
npm run test:e2e        # end-to-end tests (needs Postgres running)
npm run prisma:studio   # browse the database
npm run prisma:migrate  # prisma migrate dev
```

---

## Environment variables

See `.env.example` for the full list. Configuration is **validated at startup** — the app
refuses to boot on a missing or malformed value rather than failing later on a request.

| Variable | Purpose |
|---|---|
| `PORT`, `NODE_ENV` | App |
| `DATABASE_URL` | Postgres connection (port must match `POSTGRES_PORT`) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **Different** secrets for access vs refresh signing |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Token lifetimes (e.g. `15m`, `7d`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client id; the audience a Google ID token must carry |

---

## API

All responses share one envelope:

```json
{ "success": true, "data": { }, "message": "…", "meta": { } }
```
```json
{ "success": false, "error": { "code": "…", "message": "…", "details": [ ] } }
```

### Auth (public)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password, name }` | Returns user + access + refresh |
| POST | `/auth/login` | `{ email, password }` | Generic 401 on any failure |
| POST | `/auth/refresh` | `{ refreshToken }` | Rotates the token; reuse revokes the family |
| POST | `/auth/logout` | `{ refreshToken }` | **Requires** access token; revokes the session |
| POST | `/auth/google` | `{ idToken }` | Verifies Google's ID token, issues our JWT |

### Groups & messages (require `Authorization: Bearer <access token>`)

| Method | Path | Notes |
|---|---|---|
| POST | `/groups` | Create a group; creator becomes OWNER |
| GET | `/groups` | Groups the caller belongs to |
| GET | `/groups/:id` | Group detail + members — **members only** |
| POST | `/groups/:id/join` | Join a group (see model below) |
| POST | `/groups/:id/messages` | Post a message — **members only** |
| GET | `/groups/:id/messages?limit=&cursor=` | History, newest first — **members only** |

### Join model

**Open join.** Any authenticated user holding a group's id may join via `POST /groups/:id/join`.
Group ids are unguessable UUIDv7 values, so the id acts as a weak capability token — you share
it out of band. A production alternative (invite tokens with expiry) is the natural next step;
it is intentionally out of scope for Phase 1.

### Pagination

Message history uses **keyset (cursor) pagination**. Request `?limit=20`; the response's
`meta.nextCursor` is an opaque token — pass it back as `?cursor=…` for the next (older) page.
`meta.hasMore` is `false` on the last page. Keyset is used over OFFSET because it stays correct
when new messages arrive between page requests and is O(log n) at any depth.

---

## Authentication model

- **Access token** — short-lived JWT, verified by signature (no DB hit). Sent as
  `Authorization: Bearer <token>`.
- **Refresh token** — long-lived opaque string; only its SHA-256 hash is stored. Rotated on
  every use. Presenting an already-used token (replay) revokes the whole token family.
- Every route is protected by default (global guard); auth routes opt out with `@Public()`.
- **Google**: the frontend obtains a Google ID token and posts it to `/auth/google`; the backend
  verifies signature, audience, issuer and `email_verified`, then issues its own JWT. Google's
  token is never used as a session credential.

---

## AI daily summaries (Phase 4 → distributed in Phase 5)

Every `SUMMARY_INTERVAL_MS` (default 24h), a scheduler finds groups with activity in the last
`SUMMARY_WINDOW_MS` and fans out one summary pipeline per active group — one pipeline per group,
so a Gemini failure/retry in one group can never block another. Each pipeline fetches that
window's messages, summarizes them with **Gemini** (via the Vercel AI SDK), and posts the result
back as a normal message (`type: AI_SUMMARY`, `senderId: null`) through the same `MessagesService`
path chat messages already use — so it broadcasts live to clients with **zero new transport code**
on the persistence side.

### Phase 5 architecture — distributed queues, workers, and Flows

Phase 4 ran everything in-process inside the main API. Phase 5 splits it into **4 standalone
worker processes**, each draining its own BullMQ queue:

| Queue | Worker script | Job(s) it drains |
|---|---|---|
| `scheduler-queue` | `worker:scheduler` | the repeatable tick → finds active groups, builds one Flow per group |
| `ai-queue` | `worker:ai` | `generate-ai-summary` (pure Gemini — the ai-worker needs no DB access) |
| `summary-queue` | `worker:summary` | `fetch-messages`, `save-summary`, and the `group-summary` parent |
| `notification-queue` | `worker:notification` | `publish-summary` (broadcast the persisted row) |

Each active group gets **one BullMQ Flow** (`FlowProducer`) — a `group-summary` parent whose child
chain is the four stages. A parent completes only after **all** its children succeed; children run
first and each parent reads its child's result via `job.getChildrenValues()`. Concretely:

```
group-summary            (parent, summary-queue — completes only after all children)
└── publish-summary      (notification-queue)
    └── save-summary     (summary-queue)
        └── generate-ai-summary (ai-queue)
            └── fetch-messages  (summary-queue, leaf — runs FIRST)
```

`fetch-messages` runs first (leaf): it reads the window's messages and owns the exists/empty skips.
`generate` calls Gemini on the fetched transcript, `save` persists the `AI_SUMMARY` row, and
`publish` broadcasts it — so persist-then-broadcast ordering falls out of the Flow shape for free,
and the `group-summary` parent reports completion once the whole chain is done. A permanent failure
at any stage (`failParentOnFailure`) fails the whole flow cleanly instead of leaving parents stuck
in waiting-children. (It is a nested chain rather than four flat siblings because the stages are
strictly sequential — flat siblings would run in parallel.)

Because `publish` now runs in a **different process** than the main API (which still holds the
Socket.IO connections), it can't call `server.emit()` directly. It broadcasts instead via
**`@socket.io/redis-emitter`**, which publishes onto the same Redis pub/sub channel the main app's
Phase 3 **`@socket.io/redis-adapter`** subscribes to — so the broadcast crosses process boundaries
over Redis and reaches connected clients exactly like any other socket event.

### Running the workers

```bash
npm run worker:scheduler      # scheduler-queue
npm run worker:ai              # ai-queue (Gemini calls)
npm run worker:summary         # summary-queue (fetch-messages, save-summary, group-summary)
npm run worker:notification    # notification-queue (broadcast)
npm run workers:all            # all four, concurrently, in one terminal (dev convenience)
```

The main API process (`npm run start:dev`) no longer runs any summary stage itself — all four
worker processes must be running for summaries to be generated and broadcast.

### Get a free key

1. Get a free key at https://aistudio.google.com/apikey (Google AI Studio — the free Generative
   Language API tier used by `@ai-sdk/google`, **not** paid Vertex AI).
2. Set it as `GOOGLE_GENERATIVE_AI_API_KEY` in `backend/.env`.
3. Everything else below has a working default — no other setup required.

### Env vars

| Variable | Purpose | Default |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Free AI Studio API key | — (required) |
| `GEMINI_MODEL` | Gemini model id | `gemini-2.0-flash` |
| `SUMMARY_INTERVAL_MS` | How often the scheduler tick fires | `86400000` (24h) |
| `SUMMARY_WINDOW_MS` | How far back each summary looks | `86400000` (24h) |
| `SCHEDULER_WORKER_CONCURRENCY` | Concurrent jobs, `worker:scheduler` | `1` |
| `AI_WORKER_CONCURRENCY` | Concurrent jobs, `worker:ai` (paired with the Gemini rate limiter below) | `10` |
| `SUMMARY_WORKER_CONCURRENCY` | Concurrent jobs, `worker:summary` | `5` |
| `NOTIFICATION_WORKER_CONCURRENCY` | Concurrent jobs, `worker:notification` | `3` |

### Running it

The scheduler runs in its **own worker process** (`worker:scheduler`) — there is no in-process
scheduling in this phase; all four worker processes above must be running (see
[Running the workers](#running-the-workers)). The scheduler worker registers a repeatable BullMQ
job on boot (`onApplicationBootstrap`) and fires every `SUMMARY_INTERVAL_MS`.

To demo without waiting a full day, either:
- set `SUMMARY_INTERVAL_MS=60000` (1 minute) in `.env` and restart `worker:scheduler`, **or**
- `POST /summaries/run` (requires `Authorization: Bearer <access token>`, served by the main API)
  enqueues the same scheduler job immediately — `202 { "data": { "enqueued": true } }`.

Send a few messages in a group, wait for the next tick (or trigger it manually), and an
`AI_SUMMARY` message appears in that group's chat live, via the same `new_message` socket
broadcast as any other message. A group with no new messages in the window, or one already
summarized for the current window, is skipped.

### Demo — run the whole pipeline end to end

Prerequisites: `docker compose up -d` (Postgres + Redis), a real `GOOGLE_GENERATIVE_AI_API_KEY` in
`backend/.env` (see [Get a free key](#get-a-free-key)), and a build — the workers run from `dist/`,
so run `npm run build` first. Have the frontend open (or any socket client joined to a group) so you
can watch the Daily Summary card arrive live.

**Full run — API + all four workers.** One terminal for the API, plus one per worker (or collapse
the four workers into a single terminal with `workers:all`):

```bash
# terminal 1 — the API (serves REST + holds the Socket.IO connections)
cd backend && npm run start:prod           # or start:dev

# terminals 2-5 — the four stage workers, each its own process
npm run worker:scheduler
npm run worker:ai
npm run worker:summary
npm run worker:notification
# …or all four in one terminal:
npm run workers:all
```

Then seed a group and trigger a run instead of waiting 24h:

```bash
# 1. sign in and copy the access token (.data.accessToken)
curl -s -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'

# 2. send a few messages in a group (via the UI or POST /groups/:id/messages) so the
#    window has something to summarize

# 3. trigger the pipeline now
curl -X POST http://localhost:3000/summaries/run -H "Authorization: Bearer <ACCESS_TOKEN>"
#    → 202 { "data": { "enqueued": true } }
```

The scheduler worker fans out one Flow for the active group; `worker:ai` → `worker:summary` →
`worker:notification` drain it in order, and the `AI_SUMMARY` card appears in that group's chat
live. (Or set `SUMMARY_INTERVAL_MS=60000` in `.env`, restart `worker:scheduler`, and just wait a
minute.)

**Durable hand-off demo (memory-light — one worker at a time).** Every job and its parent/child
dependency state lives in **Redis**, not in a worker's memory, so you can run the stages one at a
time and watch each queue drain — the clearest way to *show* the pipeline is genuinely distributed,
and it keeps only 1–2 Node processes alive at once (handy on a small machine):

```bash
# API already running; a group already has recent messages.
npm run worker:scheduler         # leave running, then POST /summaries/run → it builds the Flow.
                                 # generate/save/publish jobs now sit in their Redis queues, waiting.
npm run worker:ai                # drains generate-ai-summary (Gemini); the save job now waits → Ctrl-C
npm run worker:summary           # drains save-summary (row persisted); the publish job now waits → Ctrl-C
npm run worker:notification      # drains publish-summary → connected clients get the Daily Summary card
```

Each stage's job waits in its queue until the worker that drains it is started, so the summary still
completes in the correct order even though the four workers were never alive at the same time — that
durability is the whole point of pushing the work through Redis-backed queues.

### A note on the Flow shape

The queues (`scheduler-queue`/`summary-queue`/`ai-queue`/`notification-queue`), the workers, the
four child stages (`fetch-messages`, `generate-ai-summary`, `save-summary`, `publish-summary`), the
`group-summary` parent, and the concurrency defaults all follow the assignment.

One implementation detail worth knowing: the parent's children are arranged as a **nested chain**
rather than four flat siblings, because the stages are strictly sequential — each reads the previous
stage's output via `getChildrenValues()`. Four flat children under one parent would run in
**parallel**, which a `fetch → generate → save → publish` pipeline cannot do. The `group-summary`
parent still completes only after the whole chain succeeds, and `failParentOnFailure` bubbles any
stage failure up so the flow fails cleanly. The transcript is passed `fetch → generate` as the job's
return value, so the ai-worker needs no database access at all.

---

## Project structure

```
backend/                 # NestJS API
  src/
    config/              # env loading + startup validation
    common/              # filters, interceptors, guards, decorators, pipes, DTOs, utils
    prisma/              # PrismaService + module
    auth/                # register/login/refresh/logout/google, JWT strategy, token rotation
    users/               # user persistence + serialization entity
    groups/              # groups + membership + join
    messages/            # message create + cursor-paginated history
    summary/             # Phase 4/5: summary service + per-stage BullMQ processors/Flow
    ai/                  # Phase 4: Gemini wrapper (Vercel AI SDK), vendor isolated
    workers/             # Phase 5: standalone worker entry points (one per queue)
  prisma/
    schema.prisma        # data model
    migrations/          # versioned schema changes
frontend/                # Next.js app (Phase 2)
docker-compose.yml       # shared dev services (Postgres, Redis)
```

---

## Testing

```bash
docker compose up -d      # Postgres must be running
npm run test:e2e
```

End-to-end tests cover the full auth flows (including refresh rotation and reuse detection),
Google sign-in (with only Google's token verification stubbed), the membership authorization
boundary, and cursor pagination.
