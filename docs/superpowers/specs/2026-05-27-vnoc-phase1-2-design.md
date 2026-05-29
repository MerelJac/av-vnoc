# VNOC Phase 1 + Phase 2 Design Spec

**Project:** Call One VNOC Operations Dashboard  
**Author:** Alex Zawadzki  
**Date:** 2026-05-27  
**Scope:** Phase 1 (Foundation) + Phase 2 (First integrations — Poly Lens, Yealink YMCS)

---

## Overview

A unified Video Network Operations Center dashboard that aggregates AV endpoint health from multiple vendor platforms into a single pane of glass. Technicians monitor alerts, manage tickets, and take remote action without leaving the app.

Phase 1 delivers the data model, asset sync, and dashboard shell.  
Phase 2 delivers live Poly Lens and Yealink YMCS integrations, full alert pipeline, and a functional ticket system.

---

## Architecture

**Pattern:** Webhook-first with cron fallback (Option C)

- Vendor platforms push events via webhook to the app.
- A cron job polls both APIs every 5 minutes to catch missed events and refresh device inventory.
- Alerts are normalized to a common schema, run through the correlation engine, and persisted.
- An SSE endpoint streams changes to the browser in near-real time.
- Tickets are created and managed natively (mock ServiceNow interface, real ServiceNow wired in Phase 3+).

**Stack:** Next.js 15 App Router · React 19 · Prisma 7 · PostgreSQL (Neon) · NextAuth v4 JWT · AWS SES · Tailwind v4

---

## Data Model

All new models are additive — the existing auth schema (User, Organization, OrganizationMember, Profile, Session, Invite, PasswordResetToken) is unchanged.

### Enums

```prisma
enum Platform {
  POLY_LENS
  YEALINK_YMCS
  NEAT_PULSE
  LOGITECH_SYNC
  CISCO_CONTROL_HUB
  UTELOGY
}

enum AlertSeverity {
  CRITICAL   // maps to P1
  HIGH       // maps to P2
  MEDIUM     // maps to P3
  LOW        // maps to P4
  INFO
}

enum AlertStatus {
  ACTIVE
  ACKNOWLEDGED
  AUTO_RESOLVED
  SUPPRESSED
  RESOLVED
}

enum TicketPriority { P1  P2  P3  P4 }

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

enum VnocRole {
  TIER1    // Technician — own queue, reboot, note, close
  TIER2    // Engineer   — all tickets, escalate, edit priority
  MANAGER  // VNOC Manager — KPI overview, SLA report, customer management
}
```

`VnocRole` is added as an optional field on `Profile`. `isSuperAdmin` on `User` remains the platform-admin gate (manages users and platform credentials).

### Asset Hierarchy

```
Customer → Site → Room → Device
```

| Model | Key fields |
|---|---|
| `Customer` | id, name |
| `Site` | customerId, name, address, city, state, lat, lng |
| `Room` | siteId, name |
| `Device` | roomId (nullable), platform, platformId (vendor ID), name, model, firmware, ipAddress, macAddress, status, lastSeenAt, rawPayload (Json) |

`Device` has a `@@unique([platform, platformId])` constraint — the vendor's own ID is the dedup key for sync.

### Alert Pipeline

| Model | Key fields |
|---|---|
| `WebhookEvent` | platform, eventId (vendor's ID), payload (Json), processedAt, error, receivedAt |
| `Alert` | platform, platformAlertId, deviceId, roomId, groupId, severity, status, title, description, rawPayload, receivedAt, autoCloseAt, resolvedAt |
| `AlertGroup` | type (room_outage / site_outage / device_fault), customerId, siteId, roomId, resolvedAt |

`WebhookEvent.eventId` is indexed with platform for dedup before processing. `Alert.platformAlertId` is the normalized dedup key.

### Tickets

| Model | Key fields |
|---|---|
| `Ticket` | alertId (unique FK), customerId, assignedTo (userId), priority, status, title, description, rootCause, resolution, slaDeadline, openedAt, resolvedAt, closedAt |
| `TicketAction` | ticketId, userId, type (note / reboot / firmware_push / escalate / status_change / config_restore), body, createdAt |

Every action a technician takes — reboot, note, escalate — writes a `TicketAction` row. This is the audit trail.

### Supporting

| Model | Key fields |
|---|---|
| `ActivityLog` | type, platform, userId, alertId, ticketId, message, meta (Json), createdAt |
| `PlatformCredential` | platform (unique), clientId, clientSecret, apiKey, webhookSecret, config (Json) |

`PlatformCredential` stores per-platform API config in the DB. Admins update it via a settings UI rather than redeploying env vars.

---

## Integration Layer

### File Structure

```
src/lib/integrations/
  types.ts              # NormalizedAlert, NormalizedDevice shared types
  poly-lens.ts          # Poly Lens adapter (auth, device sync, alert normalize)
  yealink.ts            # Yealink YMCS adapter
  sync.ts               # One-time full inventory sync across all platforms
src/lib/correlation.ts  # Dedup, flap suppression, group detection
src/app/api/
  webhooks/
    poly-lens/route.ts  # POST — HMAC-verified inbound events
    yealink/route.ts    # POST — HMAC-verified inbound events
  integrations/
    sync/route.ts       # POST — trigger full device inventory sync (admin only)
  cron/
    alerts/route.ts     # GET — poll both APIs for missed alerts (Bearer CRON_SECRET)
```

### Adapter Contract

Each adapter exports:

```typescript
interface PlatformAdapter {
  syncDevices(): Promise<NormalizedDevice[]>
  fetchRecentAlerts(since: Date): Promise<NormalizedAlert[]>
  normalizeWebhookPayload(raw: unknown): NormalizedAlert | null
  verifyWebhookSignature(payload: string, sig: string): boolean
  rebootDevice(platformId: string): Promise<void>
}
```

Adding a new platform (Neat Pulse, Logitech Sync, etc.) = implement this interface in a new file.

### NormalizedAlert shape

```typescript
interface NormalizedAlert {
  platform: Platform
  platformAlertId: string
  platformDeviceId: string
  severity: AlertSeverity
  title: string
  description?: string
  rawPayload: unknown
  receivedAt: Date
}
```

### Webhook Security

Both endpoints verify HMAC-SHA256 signatures using the platform's webhook secret (stored in `PlatformCredential`). Raw body is preserved before parsing for signature verification. Unverified requests return 401 immediately — payload is never processed.

### Cron Polling

`/api/cron/alerts` runs every 5 minutes (triggered by external scheduler or AWS Lambda). It:
1. Fetches alerts since `lastPolledAt` from both platforms.
2. Calls the same normalization and correlation path as webhooks.
3. Updates `lastPolledAt` in `PlatformCredential.config`.

---

## Correlation Engine

`src/lib/correlation.ts` — runs synchronously on every inbound `NormalizedAlert`.

### Pass 1: Dedup

Check `Alert` table for an existing ACTIVE alert with the same `[platform, platformAlertId]`. If found, update `receivedAt` and skip downstream steps.

### Pass 2: Flap Suppression

Set `autoCloseAt = receivedAt + 60 seconds`. A background sweep (runs on the `/api/cron/alerts` cycle) resolves any Alert where `autoCloseAt < now` AND the device's current `status` is back to `online`. These are logged to `ActivityLog` as `auto_resolved` and never create a ticket.

### Pass 3: Pattern Grouping

After persisting the alert, query ACTIVE alerts in the same room created within the last 2 minutes:
- **2+ devices in same room** → create or attach `AlertGroup` type `room_outage`
- **3+ rooms at same site** → create or attach `AlertGroup` type `site_outage`
- Otherwise → `AlertGroup` type `device_fault` (single-device groups are still created for uniform handling downstream)

### Ticket Auto-Creation

After correlation, if the alert is not suppressed:
- Priority is assigned by playbook: CRITICAL → P1, HIGH → P2, MEDIUM → P3, LOW → P4.
- `slaDeadline` is set: P1 = +1h, P2 = +4h, P3 = +8h, P4 = +24h.
- A `Ticket` row is created and the alert is linked.
- An `ActivityLog` entry is written.

---

## Dashboard

### Route Structure

```
src/app/(app)/
  dashboard/          # Overview — all panels
  alerts/             # Full alerts table with filters
  tickets/            # Ticket queue
  rooms/              # Room browser → room detail
  devices/            # Device inventory
  customers/          # Customer list (admin/manager only)
  settings/           # Platform credentials (superAdmin only)
```

### Overview Panels (matches Figure 2 mockup)

| Panel | Data source | Update mechanism |
|---|---|---|
| KPI strip | `/api/dashboard/kpis` | SSE |
| Live Alerts feed | `/api/alerts?status=ACTIVE` | SSE |
| My Open Tickets | `/api/tickets?assignedTo=me` | SSE |
| Customer Site Map | `/api/customers/sites` | 30s poll |
| VNOC Activity Feed | `/api/activity` | SSE |
| Room Control (stub) | `/api/rooms/:id` | On-demand |

### SSE Stream

`GET /api/sse/alerts` — returns `text/event-stream`. On connect, sends current state snapshot. Events pushed on:
- New `Alert` created
- `Alert.status` changes (ACTIVE → AUTO_RESOLVED, etc.)
- New `Ticket` created
- `Ticket.status` changes

Each event carries a `type` field (`alert_created`, `alert_resolved`, `ticket_opened`, `ticket_updated`, `kpi_updated`) and the affected record payload.

### Sidebar

Left sidebar matches the mockup:
- **Live Operations** section: My Queue (badge count), All Alerts, All Tickets
- **Asset Navigation**: Sites, Rooms, Devices
- **Customers** section: flat list of Customer names (≤10 for Phase 1–2)
- **Data Sources** section: Poly Lens, Yealink YMCS (with health indicator dot)

---

## Ticket System (Mock ServiceNow Interface)

Tickets are stored natively. The UI and data model are designed to map 1:1 to ServiceNow fields so the Phase 3 swap is a data-layer change, not a UI rebuild.

| VNOC field | ServiceNow equivalent |
|---|---|
| `Ticket.id` | incident_number |
| `Ticket.priority` | priority (1–4) |
| `Ticket.status` | state |
| `Ticket.slaDeadline` | SLA timer |
| `TicketAction` | Work notes / journal entries |
| `Ticket.rootCause` | Root cause (close code) |

Ticket detail page shows: alert summary, device info, action timeline, and action buttons (Add Note, Reboot Device, Escalate, Close).

---

## Role-Based Views

`vnocRole` on `Profile` gates what each user sees and can do.

| Role | Landing view | Permissions |
|---|---|---|
| TIER1 | My Queue + All Alerts | Claim ticket, add note, reboot device, close ticket |
| TIER2 | All Tickets + escalations | Everything TIER1 + edit priority, escalate to field, manage any ticket |
| MANAGER | KPI overview + SLA compliance | Everything TIER2 + manage customers, view reports |
| isSuperAdmin | Full access | Platform credentials, user management, invite users |

Role is checked server-side in each layout's `getServerSession` call — the same pattern as the existing `(admin)` group.

---

## Environment Variables (additions)

```
# Poly Lens
POLY_LENS_CLIENT_ID=
POLY_LENS_CLIENT_SECRET=
POLY_LENS_WEBHOOK_SECRET=
POLY_LENS_API_BASE=https://api.lens.poly.com

# Yealink YMCS
YEALINK_API_KEY=
YEALINK_WEBHOOK_SECRET=
YEALINK_API_BASE=https://open.ymcs.yealink.com
```

---

## Open Questions (to resolve before Phase 3)

1. **SLA targets** — P1 response time SLA number is not defined in the proposal. Assumed 1h for now.
2. **ServiceNow tenant** — net-new or shared with IT ops? Affects Phase 3 scoping.
3. **Utelogy credentials** — not needed for Phase 1–2 but should be requested during Phase 2.
4. **Customer geographic data** — lat/lng for site map. Does Call One have this in a spreadsheet, or does it come from the vendor APIs?
