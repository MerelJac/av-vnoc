# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs on port 3000 with Turbopack)
npm run dev

# Build (Turbopack) / production start
npm run build
npm run start

# Lint
npm run lint

# Tests (Vitest)
npm test            # watch mode
npm run test:run    # one-shot
npm run test:ui     # Vitest UI
npm run coverage    # with coverage report

# E2E (Playwright)
npm run test:e2e

# Database (Prisma)
npx prisma migrate dev        # new migration (dev)
npx prisma migrate deploy     # apply existing migrations (prod)
npx prisma db seed            # seed with test data (tsx ./prisma/seed.ts)
npx prisma generate           # regenerate client after schema changes
```

> If Prisma types aren't updating in the editor: Cmd+Shift+P → "TypeScript: Restart TypeScript Server"

## Environment Variables

Required in `.env`:

```
DATABASE_URL=           # PostgreSQL connection string (Neon in prod)
NEXTAUTH_SECRET=
NEXTAUTH_URL=
NEXT_PUBLIC_APP_URL=
SES_ACCESS_KEY_ID=      # AWS SES for email
SES_SECRET_ACCESS_KEY=
SES_REGION=
SES_FROM_ADDRESS=
INVITE_PASS=            # Static password set on accepted invites
CRON_SECRET=            # Bearer token for cron endpoints
```

> **Vendor API credentials are NOT environment variables.** Poly Lens, Yealink YMCS,
> Logitech Sync, and Utelogy credentials are stored per-platform in the
> `PlatformCredential` table and configured at runtime via **Settings → Integrations**
> (`/settings/platform`). The integrations layer reads them through
> `src/lib/integrations/credentials.ts` — there is no `process.env` usage in any adapter.
>
> `POLY_LENS_*`, `YMCS_*`, and `VERTEX_*` still appear in `.env.local`/`amplify.yml`
> but are **legacy/unused by the running code** (see "Legacy code" below).

## Architecture

**Stack:** Next.js 15 (App Router) · React 19 · Prisma 7 (PostgreSQL via `pg` pool) ·
NextAuth v4 (JWT strategy) · Tailwind v4 · Zod (validation) · AWS SES (email) ·
Server-Sent Events (live updates) · TipTap (rich text) · Papaparse (CSV import).

### Route Groups

| Group | Path | Auth Guard |
|---|---|---|
| `(public)` | `/` | None — redirects to `/dashboard` if logged in (middleware) |
| `(auth)` | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/[token]` | None |
| `(app)` | `/dashboard`, `/alerts`, `/tickets`, `/tickets/[id]`, `/customers`, `/devices`, `/rooms`, `/reports`, `/settings`, `/settings/platform`, `/profile`, `/landing` | `getServerSession` → redirect to `/login` |
| `(admin)` | `/users` | `isSuperAdmin` check → redirect to `/dashboard` |

`/landing` resolves the role-aware post-login destination via `landingPathFor`
(`src/lib/landing.ts`): super-admin → `/dashboard`, `TIER1` → `/tickets?queue=mine`,
`MANAGER` → `/reports`, everyone else → `/dashboard`.

### Auth

- **NextAuth v4** with `CredentialsProvider` + `PrismaAdapter`. Session strategy is JWT
  (`src/lib/auth.ts`). Inactive users (`active = false`) are rejected at sign-in.
- JWT/session carries `id`, `isSuperAdmin`, and `vnocRole` (extended in
  `src/types/next-auth.d.ts`).
- Route protection is done in each layout's server component, not middleware (middleware
  only handles the `/` redirect).

### Tenancy (per-customer scoping)

`src/lib/tenancy.ts` enforces "technicians only see customers they support":

- `getAccessibleCustomerIds(user)` returns `null` (= **unrestricted**) for super-admins,
  `MANAGER`s, and users with **zero** `CustomerAssignment` rows (backwards-compatible
  default). Otherwise it returns the assigned customer id list.
- `*TenancyWhere(ids)` helpers produce Prisma `where` fragments that walk the
  `Customer → Site → Room → Device` hierarchy. Apply these in any query that lists
  customer-scoped data (alerts, tickets, devices, rooms, customers).

### Database

Prisma 7 with a shared `pg.Pool` connection (driver adapter pattern — `PrismaPg`). The
singleton is cached on `globalThis` to survive hot reloads in dev (`src/lib/prisma.ts`).

**Auth models:** `User` → `Profile` (1:1, holds `vnocRole`), `Organization`,
`OrganizationMember` (join, with `OrgRole`), `Session`, `Invite`, `PasswordResetToken`.

**VNOC models:** `Customer` → `Site` → `Room` → `Device` (hierarchy),
`CustomerAssignment` (tech↔customer join for tenancy), `AlertGroup` → `Alert`
(normalized alert pipeline), `Ticket` → `TicketAction` (ticket lifecycle), `ActivityLog`
(audit trail), `PlatformCredential` (per-platform vendor creds), `WebhookEvent` (raw
event log), `AppConfig` (admin-editable `org` / `sla` / `routing` JSON blobs).

**Key enums:** `Platform` (POLY_LENS, YEALINK_YMCS, NEAT_PULSE, LOGITECH_SYNC,
CISCO_CONTROL_HUB, UTELOGY), `AlertSeverity` (CRITICAL→INFO), `AlertStatus`
(ACTIVE, ACKNOWLEDGED, AUTO_RESOLVED, SUPPRESSED, RESOLVED), `AlertGroupType`
(ROOM_OUTAGE, SITE_OUTAGE, DEVICE_FAULT), `TicketStatus`, `TicketPriority` (P1–P4),
`TicketActionType` (NOTE, REBOOT, FIRMWARE_PUSH, ESCALATE, STATUS_CHANGE,
CONFIG_RESTORE, PORTAL_LAUNCH), `VnocRole` (TIER1, TIER2, MANAGER).

### Integrations layer (`src/lib/integrations/`)

Each vendor platform implements the `PlatformAdapter` interface (`types.ts`):
`syncDevices()` and `fetchRecentAlerts(since)` (plus reboot where the vendor API allows).
Credentials come from the `PlatformCredential` table via `credentials.ts`
(`getCredential` / `getConfig` / `updateConfig`, which also persists `lastPolledAt`).

| Adapter | File | Transport | Status |
|---|---|---|---|
| Poly Lens | `poly-lens.ts` (+ `graphql-client.ts`) | GraphQL polling | Live — devices, alerts, reboot |
| Yealink YMCS | `yealink.ts` (+ `ymcs-client.ts`) | REST polling + webhook | Live — 429 retry/backoff |
| Logitech Sync | `logitech-sync.ts` (+ `logi-sync-client.ts`, `logi-config-schema.ts`) | mTLS REST polling | Live — devices/alerts; reboot pending vendor OpenAPI |
| Utelogy | `utelogy.ts` | REST polling | Scaffold — pending U-API credential verification |
| Neat Pulse, Cisco Control Hub | — | — | **Not built** |

`sync.ts` orchestrates device sync across all adapters (`syncAllDevices`,
`Promise.allSettled` so one failing adapter doesn't block the rest).

### Correlation engine (`src/lib/correlation.ts`)

`processAlert(normalized)` is the alert pipeline:

1. **Dedup** — existing `ACTIVE`/`ACKNOWLEDGED` alert with same `platform + platformAlertId` is refreshed, not duplicated.
2. **Device resolution** — by `platform + platformId`, with a **MAC-address fallback** for YMCS (alarms carry MAC, not device id).
3. **Suppression** — alerts from unknown or room-less devices are dropped as noise.
4. **Persist** with a 60s `autoCloseAt` flap window.
5. **Grouping** — `DEVICE_FAULT`, escalating to `ROOM_OUTAGE` (2+ devices in a room) and `SITE_OUTAGE` (3+ rooms at a site).
6. **Auto-ticket** — severity→priority and SLA deadline come from `AppConfig` (`getRoutingConfig` / `getSlaConfig`).
7. **SSE emit** — `alert_created`, `ticket_opened`, `kpi_updated`.

`runAutoResolveSweep()` closes `ACTIVE` alerts past their flap window once the device is
back `online` (status `AUTO_RESOLVED`).

### Real-time (SSE)

`src/lib/sse-bus.ts` is an in-process event bus; `/api/sse/alerts` streams to clients
and the `useSse` hook (`src/hooks/`) consumes it. Events: `alert_created`,
`ticket_opened`, `alert_resolved`, `kpi_updated`.

### Reporting & SLA

`src/lib/reports.ts` powers the manager `/reports` page and `/api/reports/summary`
(KPI/SLA rollups). `src/lib/sla-warnings.ts` (`runSlaWarningSweep`, invoked by the alerts
cron) emails managers as tickets approach their SLA deadline. A monthly SLA email goes
out from the monthly cron.

### Email

All email goes through AWS SES via `src/lib/email-templates/config.ts` (`sendEmail`
helper). Templates: `welcomeEmail.ts`, `forgotPassword.ts`, `emailWithAttachment.ts`.
The `SESClient` is initialized once with credentials from env vars.

### Cross-cutting

- **Rate limiting** — `src/lib/rate-limit.ts` guards the auth and webhook endpoints.
- **Structured logging** — `src/lib/logger.ts` (`logError` / `logWarn`) emits JSON logs;
  prefer it over `console.*` in pipeline code.
- **Activity log** — `src/lib/activity.ts` writes the `ActivityLog` audit trail.
- **Portal links** — `src/lib/portal-links.ts` builds deep links into vendor consoles
  (the ticket `PORTAL_LAUNCH` action).

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/kpis` | GET | KPI strip counts (active alerts, open tickets, % online, MTTR, SLA, at-risk) |
| `/api/alerts` | GET | Paginated alert list with severity/status filters |
| `/api/tickets` | GET | Ticket queue (`?mine=true` for My Queue) |
| `/api/tickets/[id]` | GET | Ticket detail with actions timeline |
| `/api/tickets/[id]/actions` | POST | Add an action to a ticket (note, reboot, escalate, status change, …) |
| `/api/customers`, `/api/customers/[id]` | GET/POST, GET/PUT/DELETE | Customer CRUD |
| `/api/sites`, `/api/sites/[id]` | GET/POST, GET/PUT/DELETE | Site CRUD |
| `/api/rooms`, `/api/rooms/[id]` | GET/POST, GET/PUT/DELETE | Room tree / detail + device suggestions |
| `/api/devices`, `/api/devices/[id]` | GET, PUT | Device list (filters) / assign to room |
| `/api/reports/summary` | GET | Manager KPI/SLA rollup |
| `/api/activity` | GET | Recent activity log |
| `/api/sse/alerts` | GET | Server-Sent Events stream for live alert/ticket updates |
| `/api/webhooks/yealink` | POST | Yealink YMCS webhook ingestion (HMAC-verified, raw event log) |
| `/api/integrations` | GET/POST | Manage per-platform credentials |
| `/api/integrations/sync` | POST | Trigger an on-demand device sync |
| `/api/settings` | GET/PUT | Read/update `AppConfig` (org/SLA/routing) |
| `/api/profile` | GET/PUT | Current-user profile |
| `/api/users`, `/api/users/[id]` | … | User admin (super-admin only) |
| `/api/users/[id]/permissions`, `/api/users/[id]/customers` | … | vnocRole + customer assignments |
| `/api/invites`, `/api/invites/[id]`, `/api/invites/accept` | … | Invite lifecycle |
| `/api/auth/forgot-password`, `/api/auth/reset-password` | POST | Password reset |
| `/api/redirect` | GET | Role-aware post-login redirect |

> Webhook ingestion currently exists **only for Yealink YMCS**. Poly Lens, Logitech Sync,
> and Utelogy are **polling-only** (via the alerts cron) — there is no dynamic
> `/api/webhooks/[platform]` route.

### Cron Jobs

All authenticated with `Authorization: Bearer <CRON_SECRET>`; triggered externally
(Lambda invokers in `src/scripts/lambda-*.mjs`).

| Route | Cadence (intended) | Work |
|---|---|---|
| `/api/cron/alerts` | ~5 min | Poll each adapter's `fetchRecentAlerts`, run correlation, auto-resolve sweep, SLA-warning sweep |
| `/api/cron/daily` | daily | Full device sync (`syncAllDevices`) + auto-resolve sweep |
| `/api/cron/monthly` | monthly | Rollups + monthly SLA email |

### Deployment

Deployed to AWS Amplify (`amplify.yml`). The preBuild phase runs `npx prisma generate`
then `npx prisma migrate deploy`; the build runs `next build`. ESLint is intentionally
ignored during builds (`next.config.ts`).

### Legacy code (do not trust / candidate for removal)

This repo was bootstrapped from a financial-app template; several files are now empty
stubs (`// removed`) or unused and should not be referenced when adding features:
`src/lib/{bc,bc-local,invoice-pdf,quote-pdf,buildFinancialReportRows}.ts`,
`src/lib/utils/{vertex,invoice-tax}.ts`, `src/scripts/emailMonthlyInvoiceReport.ts`.
`@react-pdf/renderer` is still a dependency but only `src/lib/utils/htmlToPdf.tsx`
imports it, and nothing imports that — VNOC does no PDF generation. The `VERTEX_*` env
vars are read nowhere in the codebase.
