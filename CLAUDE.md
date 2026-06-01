# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs on port 3000 with Turbopack)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Database migrations
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
VERTEX_TRUSTED_ID=      # Vertex tax API
VERTEX_COMPANY_CODE=
VERTEX_ENDPOINT=
```

## Architecture

**Stack:** Next.js 15 (App Router) · React 19 · Prisma 7 (PostgreSQL via `pg` pool) · NextAuth v4 (JWT strategy) · Tailwind v4 · AWS SES · `@react-pdf/renderer`

### Route Groups

| Group | Path | Auth Guard |
|---|---|---|
| `(public)` | `/` | None — redirects to `/dashboard` if logged in (middleware) |
| `(auth)` | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/[token]` | None |
| `(app)` | `/dashboard`, `/alerts`, `/tickets`, `/tickets/[id]`, `/customers`, `/devices`, `/rooms`, `/settings`, `/profile` | `getServerSession` → redirect to `/login` |
| `(admin)` | `/users` | `isSuperAdmin` check → redirect to `/dashboard` |

### Auth

- **NextAuth v4** with `CredentialsProvider` + `PrismaAdapter`. Session strategy is JWT.
- JWT carries `id` and `isSuperAdmin`. Extended via `src/types/next-auth.d.ts`.
- Route protection is done in each layout's server component, not middleware (middleware only handles the `/` redirect).

### Database

Prisma 7 with a shared `pg.Pool` connection (driver adapter pattern — `PrismaPg`). The singleton is cached on `globalThis` to survive hot reloads in dev (`src/lib/prisma.ts`).

**Auth models:** `User` → `Profile` (1:1), `Organization`, `OrganizationMember` (join, with `OrgRole` enum), `Session`, `Invite`, `PasswordResetToken`.

**VNOC models:** `Customer` → `Site` → `Room` → `Device` (hierarchy), `AlertGroup` → `Alert` (normalized alert pipeline), `Ticket` → `TicketAction` (ticket lifecycle), `ActivityLog` (audit trail), `PlatformCredential` (per-customer vendor creds), `WebhookEvent` (raw event log).

**Key enums:** `Platform` (POLY_LENS, YEALINK_YMCS, NEAT_PULSE, LOGITECH_SYNC, CISCO_CONTROL_HUB, UTELOGY), `AlertSeverity` (CRITICAL→INFO), `AlertStatus` (ACTIVE→RESOLVED), `TicketStatus`, `TicketPriority` (P1–P4), `VnocRole` (TIER1, TIER2, MANAGER).

### Email

All email goes through AWS SES via `src/lib/email-templates/config.ts` (`sendEmail` helper). Per-event templates live alongside it (welcome, forgot-password, workout notifications, etc.). The `SESClient` is initialized once with credentials from env vars.

### PDF Generation

`@react-pdf/renderer` is used for invoice and quote PDFs — see `src/lib/invoice-pdf.ts` and `src/lib/quote-pdf.ts`.

### VNOC API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/dashboard/kpis` | GET | KPI strip counts (active alerts, open tickets, etc.) |
| `/api/alerts` | GET | Paginated alert list with severity/status filters |
| `/api/tickets` | GET | Ticket queue (supports `?mine=true` for My Queue) |
| `/api/tickets/[id]` | GET | Ticket detail with actions timeline |
| `/api/tickets/[id]/actions` | POST | Add action to ticket |
| `/api/activity` | GET | Recent activity log |
| `/api/sse/alerts` | GET | Server-Sent Events stream for live alert/ticket updates |
| `/api/webhooks/[platform]` | POST | Vendor webhook ingestion (Poly Lens, Yealink YMCS) |
| `/api/integrations` | GET/POST | Manage platform credentials per customer |

### Cron Jobs

`/api/cron/daily` and `/api/cron/monthly` are authenticated with `Authorization: Bearer <CRON_SECRET>`. Triggered externally (Lambda scripts in `src/scripts/`).

The daily cron runs auto-resolve sweep on stale alerts and polls vendor APIs for missed events.

### Deployment

Deployed to AWS Amplify (`amplify.yml`). The build runs `npx prisma generate` before `next build`. ESLint is intentionally ignored during builds (`next.config.ts`).
