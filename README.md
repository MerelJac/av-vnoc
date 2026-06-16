# Call One VNOC

A **Video Network Operations Center (VNOC)** dashboard for monitoring and managing
audio/visual and video-conferencing fleets across multiple customers. It ingests
device telemetry and alerts from vendor platforms (Poly Lens, Yealink YMCS, Logitech
Sync, Utelogy — with Neat Pulse and Cisco Control Hub planned), normalizes them into a
single alert pipeline, and drives a ticket-based operations workflow for Tier 1/2
support.

---

## Features

- **Live dashboard** — KPI strip (critical alerts, open tickets, % rooms online, 24h
  MTTR, 30-day SLA compliance, SLA-at-risk) with real-time updates over Server-Sent
  Events.
- **Alert pipeline** — normalized, de-duplicated alerts correlated by device, grouped
  into `DEVICE_FAULT` / `ROOM_OUTAGE` / `SITE_OUTAGE`, with a 60-second flap window and
  automatic self-heal.
- **Ticketing** — alerts auto-open tickets with an admin-configurable severity→priority
  map and SLA timers; ticket queue with priorities (P1–P4), a per-ticket action timeline
  (note, reboot, escalate, status change, portal launch), and a "My Queue" filter.
- **Per-customer tenancy** — technicians are scoped to the customers they're assigned to;
  super-admins and managers see everything.
- **Role-aware landing** — Tier 1 lands on their queue, managers on reports,
  super-admins on the dashboard.
- **Customer hierarchy** — `Customer → Site → Room → Device`, browsable through a split
  tree/detail Rooms page.
- **Device inventory** — filterable device list with unassigned-device detection and
  smart "this device probably belongs in room X" suggestions based on vendor room names.
- **Integrations** — per-platform vendor credentials managed in-app; polling adapters for
  Poly Lens, Yealink YMCS, Logitech Sync, and Utelogy, plus a Yealink webhook endpoint
  with a raw event log.
- **Manager reporting** — KPI/SLA reporting page and a monthly SLA email, plus
  early-warning emails as tickets approach their SLA deadline.
- **Audit trail** — activity log across the system.
- **Email** — transactional email via AWS SES (welcome, password reset, attachments).

## Tech Stack

| Layer       | Technology |
|-------------|------------|
| Framework   | Next.js 15 (App Router) · React 19 |
| Language    | TypeScript |
| Database    | PostgreSQL via Prisma 7 (`pg` pool + `PrismaPg` driver adapter) |
| Auth        | NextAuth v4 (Credentials provider, JWT session strategy) |
| Styling     | Tailwind CSS v4 |
| Validation  | Zod |
| Real-time   | Server-Sent Events |
| Email       | AWS SES (`@aws-sdk/client-ses`) |
| Testing     | Vitest + Testing Library (unit/integration) · Playwright (E2E) |
| Hosting     | AWS Amplify (Neon Postgres + Lambda crons) |

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
CRON_SECRET=             # Bearer token guarding the cron endpoints
```

> **Vendor API credentials (Poly Lens, Yealink YMCS, Logitech Sync, Utelogy) are not
> environment variables.** They're entered in-app under **Settings → Integrations** and
> stored in the database (`PlatformCredential`).

### Set up the database

```bash
npx prisma generate          # generate the Prisma client
npx prisma migrate deploy    # apply existing migrations
npx prisma db seed           # seed an admin user + test customers/rooms/devices
```

The seed creates a super-admin (`merelbjacobs@gmail.com` / `Testingtest`) and a sample
`Acme Corp → HQ - Chicago` hierarchy with a few seeded devices.

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
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest in watch mode |
| `npm run test:run` | Run the unit/integration suite once |
| `npm run test:ui` | Vitest UI |
| `npm run coverage` | Run tests with coverage |
| `npm run test:e2e` | Run Playwright E2E tests |

## Project Structure

Routes are organized into App Router **route groups**, each with its own auth guard:

| Group | Routes | Auth guard |
|---|---|---|
| `(public)` | `/` | None — redirects to `/dashboard` if logged in |
| `(auth)` | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/[token]` | None |
| `(app)` | `/dashboard`, `/alerts`, `/tickets`, `/tickets/[id]`, `/customers`, `/devices`, `/rooms`, `/reports`, `/settings`, `/profile` | `getServerSession` → `/login` |
| `(admin)` | `/users` | `isSuperAdmin` → `/dashboard` |

Auth is enforced in each layout's server component (middleware only handles the `/`
redirect). The JWT carries `id`, `isSuperAdmin`, and `vnocRole`. Customer-scoped queries
are filtered through the tenancy helpers in `src/lib/tenancy.ts`.

## Data Model

**Auth:** `User` → `Profile` (1:1, holds `vnocRole`), `Organization`,
`OrganizationMember` (join, with `OrgRole`), `Session`, `Invite`, `PasswordResetToken`.

**VNOC:** `Customer → Site → Room → Device` (hierarchy), `CustomerAssignment`
(tech↔customer scoping), `AlertGroup → Alert` (normalized alert pipeline),
`Ticket → TicketAction` (ticket lifecycle), `PlatformCredential` (per-platform vendor
creds), `WebhookEvent` (raw event log), `ActivityLog` (audit trail), `AppConfig`
(admin-editable org/SLA/routing settings).

**Key enums:** `Platform`, `AlertSeverity`, `AlertStatus`, `AlertGroupType`,
`TicketStatus`, `TicketPriority` (P1–P4), `TicketActionType`, `VnocRole`
(TIER1, TIER2, MANAGER).

## API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/kpis` | GET | KPI strip counts |
| `/api/alerts` | GET | Paginated alerts with severity/status filters |
| `/api/tickets` | GET | Ticket queue (`?mine=true` for My Queue) |
| `/api/tickets/[id]` | GET | Ticket detail with action timeline |
| `/api/tickets/[id]/actions` | POST | Add an action to a ticket |
| `/api/customers`, `/api/sites`, `/api/rooms` | GET/POST (+ `[id]` CRUD) | Asset hierarchy management |
| `/api/devices`, `/api/devices/[id]` | GET / PUT | Device list with filters / assign to a room |
| `/api/reports/summary` | GET | Manager KPI/SLA rollup |
| `/api/activity` | GET | Recent activity log |
| `/api/sse/alerts` | GET | Server-Sent Events stream for live updates |
| `/api/webhooks/yealink` | POST | Yealink YMCS webhook ingestion |
| `/api/integrations`, `/api/integrations/sync` | GET/POST, POST | Per-platform credentials / on-demand sync |
| `/api/settings` | GET / PUT | Read/update org, SLA, and routing config |
| `/api/users/*`, `/api/invites/*`, `/api/profile` | … | User/invite/profile administration |

Other vendors (Poly Lens, Logitech Sync, Utelogy) are **polling-only** via the alerts
cron — only Yealink has a webhook endpoint today.

### Cron

`/api/cron/alerts` (≈5 min), `/api/cron/daily`, and `/api/cron/monthly` are authenticated
with `Authorization: Bearer <CRON_SECRET>` and triggered externally (Lambda invokers in
`src/scripts/`). The alerts job polls vendor APIs, runs correlation, and sweeps
auto-resolve + SLA warnings; the daily job runs a full device sync; the monthly job sends
the SLA report.

## Deployment

Deployed to **AWS Amplify** (`amplify.yml`). The preBuild phase runs `npx prisma generate`
and `npx prisma migrate deploy`; the build runs `next build`. ESLint is intentionally
skipped during the production build (`next.config.ts`).

## Testing

```bash
npm run test:run     # one-shot (unit + integration)
npm run coverage     # with coverage report
npm run test:e2e     # Playwright E2E
```

Unit/integration tests live in `src/test/` (API route handlers, library logic, and React
components — Vitest + Testing Library). E2E specs live in `tests/e2e/` (Playwright).
