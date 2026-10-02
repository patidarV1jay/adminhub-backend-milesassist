# AdminHub Backend

REST API for the AdminHub admin dashboard: authentication, user management, transactions, bookings and dashboard analytics. Built with **NestJS**, **TypeScript**, **PostgreSQL** and **Prisma**.

- Interactive API docs (Swagger UI): `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs-json`
- ER diagram: [`/er-diagram.md`](/er-diagram.md)
- Postman Collection: `https://documenter.getpostman.com/view/57894601/2sBYHNWhqZ`

## Table of contents

1. [Tech stack](#tech-stack)
2. [Prerequisites](#prerequisites)
3. [Quick start](#quick-start)
4. [Environment variables](#environment-variables)
5. [Database: migrations and seed](#database-migrations-and-seed)
6. [Running the app](#running-the-app)
7. [Authentication](#authentication)
8. [API overview](#api-overview)
9. [Conventions](#conventions)
10. [Business rules](#business-rules)
11. [Security](#security)
12. [Architecture](#architecture)
13. [Project structure](#project-structure)
14. [Troubleshooting](#troubleshooting)
15. [Known limitations](#known-limitations)

## Tech stack

| Concern | Choice |
|---|---|
| Framework | NestJS (TypeScript) |
| Database | PostgreSQL 16 |
| ORM and migrations | Prisma 6 |
| Auth | JWT (`@nestjs/jwt`, `passport-jwt`), passwords hashed with bcrypt (cost 12) |
| Validation | `class-validator` / `class-transformer` (whitelisted DTOs) |
| Security | Helmet, CORS, `@nestjs/throttler` rate limiting, role-based access control |
| API docs | `@nestjs/swagger` |

## Prerequisites

- **Node.js 20 or newer** (developed on v24)
- **npm**
- **PostgreSQL 14+**, either through Docker (recommended) or installed locally
- **Docker Desktop** (only if you use the provided Compose setup)

## Quick start

```bash
# 1. Clone and install
git clone <your-repo-url> adminhub-backend
cd adminhub-backend
npm install

# 2. Create your environment file and edit the values
cp .env.example .env

# 3. Start PostgreSQL (Docker)
docker compose up -d

# 4. Create the tables and load demo data
npx prisma generate
npx prisma migrate deploy
npx prisma db seed

# 5. Run the API
npm run start:dev
```

Open `http://localhost:3000/docs`, log in with the seeded super admin (see [Seed data](#seed-data)) and authorize Swagger with the returned token.

### PostgreSQL with Docker

`docker-compose.yml` in the project root:

```yaml
services:
  db:
    image: postgres:16
    container_name: adminhub-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: adminhub
      POSTGRES_PASSWORD: adminhub
      POSTGRES_DB: adminhub
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

Start it with `docker compose up -d`, stop it with `docker compose down` (add `-v` to also delete the data volume).

### PostgreSQL without Docker

Install PostgreSQL, create an empty database named `adminhub`, and point `DATABASE_URL` at it.

## Environment variables

Copy `.env.example` to `.env`. The `.env` file is git-ignored; never commit real secrets.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | none | PostgreSQL connection string, e.g. `postgresql://adminhub:adminhub@localhost:5432/adminhub?schema=public` |
| `JWT_SECRET` | yes | none | Secret used to sign access tokens. Use a long random string (for example `openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | no | `1d` | Token lifetime (`15m`, `12h`, `1d`, ...) |
| `PORT` | no | `3000` | HTTP port |
| `SEED_ADMIN_EMAIL` | no | `sarah.jenkins@adminhub.com` | Email of the super admin created by the seed |
| `SEED_ADMIN_PASSWORD` | no | `Admin@12345` | Password of the super admin created by the seed |

The app refuses to start if `DATABASE_URL` or `JWT_SECRET` is missing.

## Database: migrations and seed

The schema lives in [`prisma/schema.prisma`](prisma/schema.prisma). Tables are created **only through migrations** in `prisma/migrations/` (committed to the repo); nothing is created by hand.

| Task | Command |
|---|---|
| Apply existing migrations (fresh setup, CI, production) | `npx prisma migrate deploy` |
| Create a new migration after editing the schema (development) | `npx prisma migrate dev --name <description>` |
| Regenerate the Prisma client | `npx prisma generate` |
| Validate the schema | `npx prisma validate` |
| Load demo data | `npx prisma db seed` |
| Drop everything, re-apply migrations and re-seed | `npx prisma migrate reset` |
| Browse the data in a UI | `npx prisma studio` |

### Seed data

`npx prisma db seed` runs `prisma/seed.ts` and creates demo users, services, bookings, transactions and alerts so every dashboard screen has data.

Seeded accounts (only SUPER_ADMIN and ADMIN accounts can log in to the admin console):

| Email | Role | Can log in |
|---|---|---|
| `sarah.jenkins@adminhub.com` | SUPER_ADMIN | yes (password `Admin@12345`, or `SEED_ADMIN_PASSWORD`) |
| `michael.admin@adminhub.com` | ADMIN | yes |
| `john.editor@adminhub.com` | EDITOR | no (managed user) |
| `emily.viewer@adminhub.com` | VIEWER | no (managed user) |

Passwords for the other accounts are defined in `prisma/seed.ts`. **Change all default credentials before deploying anywhere public.**

## Running the app

| Command | Purpose |
|---|---|
| `npm run start:dev` | Development with auto-reload |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build (`node dist/main`) |

On startup the app logs the API URL (`http://localhost:3000/api`) and the Swagger URL (`http://localhost:3000/docs`).

For production, run `npx prisma migrate deploy` (never `migrate dev`) before starting the app.

Quick health check:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","uptimeSeconds":12,"timestamp":"..."}
```

## Authentication

1. `POST /api/auth/login` with `{ "email": "...", "password": "..." }` returns `{ accessToken, tokenType: "Bearer", user }`.
2. Send the token on every other request: `Authorization: Bearer <accessToken>`.
3. In Swagger UI click **Authorize** and paste the token.

Every route requires a valid JWT except `POST /api/auth/login` and `GET /api/health`. The token is re-checked against the database on each request, so a suspended or deleted user loses access immediately.

## API overview

All routes are prefixed with `/api`. All routes below (except login and health) require a SUPER_ADMIN or ADMIN token.

### Auth and health

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Log in (public, limited to 5 attempts per minute per IP) |
| GET | `/auth/me` | Profile of the logged-in admin |
| GET | `/health` | Service and database health (public) |

### Users

| Method | Endpoint | Description |
|---|---|---|
| GET | `/users` | List with search, `role`, `status`, `sortBy`, pagination |
| GET | `/users/stats` | Total, active, inactive, suspended and new-this-month counts |
| GET | `/users/:id` | Detail with recent transactions, bookings and activity |
| GET | `/users/:id/activity` | Paginated activity log |
| POST | `/users` | Create a user |
| PATCH | `/users/:id` | Update profile, role or status (also used to suspend) |
| DELETE | `/users/:id` | Soft delete |
| PATCH | `/users/bulk/role` | Change the role of several users |
| PATCH | `/users/bulk/status` | Change the status of several users (suspend accounts) |

### Dashboard

| Method | Endpoint | Description |
|---|---|---|
| GET | `/dashboard/stats` | KPI cards: users, revenue, active bookings, pending transactions (value, % change, trend) |
| GET | `/dashboard/charts?range=6M` | Revenue series. `range`: `7D`, `1M`, `3M`, `6M`, `1Y` |
| GET | `/dashboard/alerts` | Live-computed alerts plus stored system alerts, most severe first |
| GET | `/dashboard/system-health` | Uptime, average response time, active sessions |

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| GET | `/transactions` | List with search, `type`, `status`, `userId`, `minAmount`/`maxAmount`, `dateFrom`/`dateTo`, sorting, pagination |
| GET | `/transactions/stats` | Total, volume, average, success rate and 14-day trend |
| GET | `/transactions/export` | CSV export of the filtered list (max 10,000 rows) |
| GET | `/transactions/:id` | Invoice, customer, processing history, related ledger entries |
| POST | `/transactions` | Create (total = subtotal + gateway fee) |
| PATCH | `/transactions/:id/status` | Update status |
| POST | `/transactions/:id/refund` | Refund a completed payment |

### Bookings

| Method | Endpoint | Description |
|---|---|---|
| GET | `/bookings` | List with search, `status`, `serviceId`, `customerId`, `dateFrom`/`dateTo` (scheduled date), sorting, pagination |
| GET | `/bookings/stats` | Total, active, completed, cancelled (with % change) |
| GET | `/bookings/export` | CSV export of the filtered list (max 10,000 rows) |
| GET | `/bookings/:id` | Logistics, payment, customer overview, lifecycle log |
| POST | `/bookings` | Create a booking |
| PATCH | `/bookings/:id` | Update, reschedule (`scheduledAt`) or cancel (`status: "CANCELLED"`) |
| GET | `/services` | Active services for filters and the booking form |

## Conventions

**Paginated lists** return:

```json
{
  "data": [ ... ],
  "meta": { "total": 120, "page": 1, "limit": 10, "totalPages": 12, "hasNextPage": true, "hasPreviousPage": false }
}
```

Common query parameters: `page` (default 1), `limit` (default 10, max 100), `search`, `sortBy`, `sortOrder` (`asc` | `desc`, default `desc`), `dateFrom`, `dateTo`. A date-only `dateTo` (`2026-09-30`) includes that whole day.

**Errors** always have the same shape:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A record with this email already exists",
  "path": "/api/users",
  "timestamp": "2026-10-01T10:47:50.125Z"
}
```

| Status | Meaning |
|---|---|
| 400 | Validation failed (unknown or invalid fields), invalid business input |
| 401 | Missing, invalid or expired token; invalid login |
| 403 | Authenticated but not allowed (role or ownership rule) |
| 404 | Record not found |
| 409 | Duplicate value or a state conflict (e.g. invalid status change, overlapping booking) |
| 429 | Rate limit exceeded |
| 500 | Unexpected error (details are logged server-side, never returned) |

**Display IDs**: `USR-4821`, `TXN-1082` and `BKG-2341` are derived from auto-increment numbers (`USR-{number}` and so on). List search accepts `TXN-1082`, `#TXN-1082` or `1082`. Records are addressed by UUID in URLs.

**Money** is stored as `Decimal(12,2)` and returned as JSON numbers. Timestamps are ISO 8601 in UTC.

## Business rules

**Users**
- Only SUPER_ADMIN and ADMIN accounts can log in; EDITOR and VIEWER are managed users.
- You cannot delete yourself or change your own role or status.
- Only a SUPER_ADMIN can create, modify, delete or bulk-change another SUPER_ADMIN.
- Deleting is a soft delete (`deletedAt`), so financial history stays intact.
- Create, update, delete and bulk actions are written to the user's activity log.

**Transactions**
- `amount = subtotal + gatewayFee`, calculated on the server.
- Allowed status changes: `PENDING -> COMPLETED | FAILED`, `FAILED -> PENDING`. Anything else returns 409. `COMPLETED` and `REFUNDED` are final.
- A refund is only possible for a `COMPLETED` payment. It marks the original `REFUNDED` and creates a linked `REFUND` entry with a negative amount, all in one database transaction. Double refunds are blocked atomically.
- Processing history events are recorded automatically (initiated, authorized, completed, failed, refunded).
- If a transaction is linked to a booking, the booking's payment status follows it.

**Bookings**
- Status changes: `PENDING -> CONFIRMED | CANCELLED`, `CONFIRMED -> COMPLETED | CANCELLED`. Completed and cancelled bookings cannot be modified.
- A customer cannot have two overlapping active bookings (409).
- `scheduledAt` must be in the future when creating or rescheduling.
- The amount of a paid booking cannot be changed.
- Every change adds an entry to the booking's lifecycle log.

**Dashboard**
- KPI percentage change compares the last 30 days with the 30 days before.
- Revenue is the sum of completed payments (refunded payments drop out automatically).
- Alerts combine live checks (pending and failed transactions, server memory) with stored system alerts.

## Security

- **Authentication**: JWT access tokens, passwords hashed with bcrypt (cost 12), no secrets in the repository.
- **Authorization**: global JWT guard plus role guard; routes are private unless marked `@Public()`.
- **Rate limiting**: 100 requests per minute per IP globally, 5 login attempts per minute per IP (HTTP 429 beyond that).
- **Helmet** security headers and CORS enabled.
- **Validation**: every DTO is whitelisted; unknown properties are rejected with 400.
- **Errors**: one global exception filter; Prisma errors are mapped to proper status codes and internals are never leaked.
- **Injection**: all queries go through Prisma (parameterized); CSV exports neutralize spreadsheet formula injection.

## Architecture

The app is a modular NestJS monolith. Each feature is a module with a controller (HTTP and validation), a service (business rules and queries) and DTOs.

```
Request
  -> ThrottlerGuard (rate limit)
  -> JwtAuthGuard (valid token, user still active)
  -> RolesGuard (role check)
  -> ValidationPipe (whitelisted DTOs)
  -> Controller -> Service -> Prisma -> PostgreSQL
  -> AllExceptionsFilter (uniform error format)
```

Design decisions:
- **Prisma** gives typed queries and version-controlled migrations.
- **Transactions** (database) wrap every multi-step change (refunds, bookings with events, bulk updates) so data never ends up half-written.
- **Event tables** (`TransactionEvent`, `BookingEvent`, `ActivityLog`) are append-only timelines that power the detail screens and double as an audit trail.
- **Soft delete** for users protects financial history; foreign keys to users and services use `RESTRICT`.
- **Indexes** cover the columns the screens filter and sort by (status, type, dates, amount, customer).
- **Metrics** (average response time, uptime, active sessions) are computed live from the running process and the database, nothing is hard-coded.

## Project structure

```
prisma/
├── schema.prisma          Data model
├── migrations/            SQL migrations (committed)
└── seed.ts                Demo data
docs/
└── ER_DIAGRAM.md          Entity-relationship diagram (Mermaid)
src/
├── main.ts                Bootstrap: Helmet, CORS, validation, Swagger
├── app.module.ts          Module wiring and global guards
├── auth/                  Login, JWT strategy, guards, decorators
├── users/                 User management
├── transactions/          Transactions, stats, refunds, CSV export
├── bookings/              Bookings, services, stats, CSV export
├── dashboard/             KPI stats, charts, alerts, system health
├── metrics/               Request timing and runtime metrics
├── health/                Health check
├── prisma/                Prisma module and service
├── config/                Environment validation
└── common/                DTOs, exception filter, pagination, date, CSV utilities
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `Module '"@prisma/client"' has no exported member ...` | Run `npx prisma generate`, then restart the TypeScript server in your editor |
| `Missing required environment variables` on startup | Create `.env` from `.env.example` and fill in `DATABASE_URL` and `JWT_SECRET` |
| `Can't reach database server` | Make sure the database is running (`docker compose ps`) and that `DATABASE_URL` matches its user, password, host and port |
| Port 5432 or 3000 already in use | Stop the other process or change the port mapping / `PORT` |
| Seed fails with a unique constraint error | The seed was run on existing data. Use `npx prisma migrate reset` for a clean database |
| `401 Unauthorized` on every call | Log in again and re-authorize Swagger; tokens expire after `JWT_EXPIRES_IN` |
| `429 Too Many Requests` | You hit the rate limit; wait a minute |
| `npm run build` produces `dist/src/main.js` | Add `"prisma"` to the `exclude` list in `tsconfig.build.json` |

## Known limitations

- The rate limiter keeps its counters in memory. With several server instances each one counts separately; use a Redis store for shared limits.
- A soft-deleted user keeps their email address reserved, so the same email cannot be re-used for a new user.
- Behind a reverse proxy, enable Express `trust proxy` so rate limiting sees real client IPs.
- There is no password reset or refresh-token flow; tokens simply expire.