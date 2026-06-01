# Call One VNOC

A **Video Network Operations Center (VNOC)** dashboard for monitoring and managing
audio/visual and video-conferencing fleets across multiple customers. It ingests
device telemetry and alerts from vendor platforms (Poly Lens, Yealink YMCS, Neat
Pulse, Logitech Sync, Cisco Control Hub, Utelogy), normalizes them into a single
alert pipeline, and drives a ticket-based operations workflow for Tier 1/2 support.

---

## Features

- **Live dashboard** — KPI strip (active alerts, open tickets, devices online) with
  real-time updates over Server-Sent Events.
- **Alert pipeline** — normalized, de-duplicated alerts grouped by device, with
  severity (`CRITICAL` → `INFO`) and lifecycle status (`ACTIVE` → `RESOLVED`).
- **Ticketing** — ticket queue with priorities (P1–P4), a per-ticket action
  timeline, and a "My Queue" filter.
- **Customer hierarchy** — `Customer → Site → Room → Device`, browsable through a
  split tree/detail Rooms page.
- **Device inventory** — filterable device list with unassigned-device detection and
  smart "this device probably belongs in room X" suggestions based on vendor room
  names.
- **Webhook ingestion** — per-platform webhook endpoints with a raw event log.
- **Per-customer integrations** — vendor API credentials managed per customer.
- **Audit trail** — activity log across the system.
- **Email & PDF** — transactional email via AWS SES; invoice/quote PDF generation.
- **Cron jobs** — daily auto-resolve sweep of stale alerts + vendor API polling, and
  monthly rollups.

## Tech Stack

| Layer       | Technology |
|-------------|------------|
| Framework   | Next.js 15 (App Router) · React 19 |
| Language    | TypeScript |
| Database    | PostgreSQL via Prisma 7 (`pg` pool + `PrismaPg` driver adapter) |
| Auth        | NextAuth v4 (Credentials provider, JWT session strategy) |
| Styling     | Tailwind CSS v4 |
| Validation  | Zod |
| Email       | AWS SES (`@aws-sdk/client-ses`) |
| PDF         | `@react-pdf/renderer` |
| Testing     | Vitest + Testing Library |
| Hosting     | AWS Amplify |

## Getting Started

### Prerequisites

- Node.js 20+
- A PostgreSQL database (Neon is used in production)

### Install

```bash
npm install
```

### Configure environment

Create a `.env` file in the project root:

```bash
DATABASE_URL=            # PostgreSQL connection string
NEXTAUTH_SECRET=
NEXTAUTH_URL=
NEXT_PUBLIC_APP_URL=

# AWS SES (transactional email)
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
SES_REGION=
SES_FROM_ADDRESS=

INVITE_PASS=             # Static password applied to accepted invites
CRON_SECRET=            # Bearer token guarding the cron endpoints

# Vertex tax API
VERTEX_TRUSTED_ID=
VERTEX_COMPANY_CODE=
VERTEX_ENDPOINT=
```

### Set up the database

```bash
npx prisma generate          # generate the Prisma client
npx prisma migrate deploy    # apply existing migrations
npx prisma db seed           # seed with test data (customers, rooms, devices)
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> If Prisma types don't refresh in your editor:
> **Cmd+Shift+P → "TypeScript: Restart TypeScript Server"**.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build (`prisma generate` then `next build`) |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run the test suite once |
| `npm run coverage` | Run tests with coverage |

## Project Structure

Routes are organized into App Router **route groups**, each with its own auth guard:

| Group | Routes | Auth guard |
|---|---|---|
| `(public)` | `/` | None — redirects to `/dashboard` if logged in |
| `(auth)` | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/[token]` | None |
| `(app)` | `/dashboard`, `/alerts`, `/tickets`, `/tickets/[id]`, `/customers`, `/devices`, `/rooms`, `/settings`, `/profile` | `getServerSession` → `/login` |
| `(admin)` | `/users` | `isSuperAdmin` → `/dashboard` |

Auth is enforced in each layout's server component (middleware only handles the `/`
redirect). The JWT carries `id` and `isSuperAdmin`.

## Data Model

**Auth:** `User` → `Profile` (1:1), `Organization`, `OrganizationMember` (join, with
`OrgRole`), `Session`, `Invite`, `PasswordResetToken`.

**VNOC:** `Customer → Site → Room → Device` (hierarchy), `AlertGroup → Alert`
(normalized alert pipeline), `Ticket → TicketAction` (ticket lifecycle),
`PlatformCredential` (per-customer vendor creds), `WebhookEvent` (raw event log),
`ActivityLog` (audit trail).

**Key enums:** `Platform`, `AlertSeverity`, `AlertStatus`, `TicketStatus`,
`TicketPriority` (P1–P4), `VnocRole` (TIER1, TIER2, MANAGER).

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/kpis` | GET | KPI strip counts |
| `/api/alerts` | GET | Paginated alerts with severity/status filters |
| `/api/tickets` | GET | Ticket queue (`?mine=true` for My Queue) |
| `/api/tickets/[id]` | GET | Ticket detail with action timeline |
| `/api/tickets/[id]/actions` | POST | Add an action to a ticket |
| `/api/rooms` | GET / POST | Customer→site→room tree / create room |
| `/api/rooms/[id]` | GET / PUT / DELETE | Room detail + suggestions / rename / delete |
| `/api/devices` | GET | Device list with filters (platform, status, unassigned) |
| `/api/devices/[id]` | PUT | Assign/unassign device to a room |
| `/api/activity` | GET | Recent activity log |
| `/api/sse/alerts` | GET | Server-Sent Events stream for live updates |
| `/api/webhooks/[platform]` | POST | Vendor webhook ingestion |
| `/api/integrations` | GET / POST | Manage per-customer platform credentials |

### Cron

`/api/cron/daily` and `/api/cron/monthly` are authenticated with
`Authorization: Bearer <CRON_SECRET>` and triggered externally (Lambda scripts in
`src/scripts/`). The daily job runs an auto-resolve sweep on stale alerts and polls
vendor APIs for missed events.

## Deployment

Deployed to **AWS Amplify** (`amplify.yml`). The build runs `npx prisma generate`
before `next build`. ESLint is intentionally skipped during the production build
(`next.config.ts`).

## Testing

```bash
npm run test:run     # one-shot
npm run coverage     # with coverage report
```

Tests live in `src/test/` and cover API route handlers and React components
(Vitest + Testing Library).
