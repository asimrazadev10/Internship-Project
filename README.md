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

| Queue | Worker script | Stage |
|---|---|---|
| `summary-scheduler` | `worker:scheduler` | finds active groups, fans out one Flow per group |
| `summary-generate` | `worker:ai` | fetches messages + calls Gemini (skip logic lives here) |
| `summary-save` | `worker:summary` | persists the `AI_SUMMARY` row |
| `summary-publish` | `worker:notification` | broadcasts the persisted row to clients |

Each active group gets **one BullMQ Flow** (`FlowProducer`), not four independent jobs. A Flow's
root is the *last* stage to run; children run first and each parent reads its result via
`job.getChildrenValues()`. Concretely:

```
publish-summary (root, summary-publish queue)
└── save-summary (summary-save queue)
    └── generate-ai-summary (leaf, summary-generate queue)
```

`generate` runs first (leaf), `save` reads its return value and persists, `publish` reads save's
result and broadcasts — so persist-then-broadcast ordering falls out of the Flow shape for free.
A permanent failure at any stage (`failParentOnFailure`) fails the whole flow cleanly instead of
leaving parents stuck in waiting-children.

Because `publish` now runs in a **different process** than the main API (which still holds the
Socket.IO connections), it can't call `server.emit()` directly. It broadcasts instead via
**`@socket.io/redis-emitter`**, which publishes onto the same Redis pub/sub channel the main app's
Phase 3 **`@socket.io/redis-adapter`** subscribes to — so the broadcast crosses process boundaries
over Redis and reaches connected clients exactly like any other socket event.

### Running the workers

```bash
npm run worker:scheduler      # summary-scheduler queue
npm run worker:ai              # summary-generate queue (Gemini calls)
npm run worker:summary         # summary-save queue
npm run worker:notification    # summary-publish queue
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
| `AI_WORKER_CONCURRENCY` | Concurrent jobs, `worker:ai` (paired with the Gemini rate limiter below) | `2` |
| `SUMMARY_WORKER_CONCURRENCY` | Concurrent jobs, `worker:summary` | `5` |
| `NOTIFICATION_WORKER_CONCURRENCY` | Concurrent jobs, `worker:notification` | `10` |

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

### Deviations from CLAUDE.md §6/§9 (and why)

- **Queue names** — `summary-scheduler`/`summary-generate`/`summary-save`/`summary-publish`
  instead of §6's `scheduler-queue`/`ai-queue`/`summary-queue`/`notification-queue`. Namespacing
  every queue under the `summary-` feature prefix avoids Redis key collisions with other features
  that might one day add their own `ai-queue`/`summary-queue`. The worker script names
  (`worker:scheduler`/`worker:ai`/`worker:summary`/`worker:notification`) and the concurrency
  env-var names (`*_WORKER_CONCURRENCY`) still match §9 exactly.
- **Linear 3-stage Flow** (fetch folded into `generate`) instead of §6's flat 4-child sketch with
  a separate `fetch-messages` job. Folding fetch into generate avoids shuttling a whole message
  transcript through Redis as job data between two stages, co-locates all the skip logic
  (`exists`/`empty`/`blank`) in one place, and — more fundamentally — a nested parent→child chain
  is the correct BullMQ shape for a strictly *sequential* dependency (each stage needs the
  previous stage's output); §6's flat list of four children under one parent reads as four
  **parallel siblings**, which is not what this pipeline needs.
- **Concurrency values** — `AI_WORKER_CONCURRENCY=2` / `NOTIFICATION_WORKER_CONCURRENCY=10`
  instead of §9's `10`/`3`. AI generation is bound by Gemini's free-tier rate limit, so it's kept
  low and paired with the Redis-coordinated `limiter` BullMQ option on `GenerateProcessor`, which
  caps the global Gemini call rate across all `worker:ai` instances; publishing is just
  broadcasting an already-persisted message, which is cheap, so it's kept high.
  These are the code's actual defaults, and `.env.example` is already aligned to them.

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
