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

## Setup

```bash
# 1. Start local services (Postgres + Redis)
docker compose up -d

# 2. Install dependencies
npm install

# 3. Create your env file and fill it in
cp .env.example .env
#    - generate two different JWT secrets, e.g.:  openssl rand -base64 48
#    - set GOOGLE_CLIENT_ID to your Google Cloud OAuth client id (for /auth/google)
#    - DATABASE_URL must match the Postgres port published by docker-compose

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

## Project structure

```
src/
  config/          # env loading + startup validation
  common/          # filters, interceptors, guards, decorators, pipes, DTOs, utils
  prisma/          # PrismaService + module
  auth/            # register/login/refresh/logout/google, JWT strategy, token rotation
  users/           # user persistence + serialization entity
  groups/          # groups + membership + join
  messages/        # message create + cursor-paginated history
prisma/
  schema.prisma    # data model
  migrations/      # versioned schema changes
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
