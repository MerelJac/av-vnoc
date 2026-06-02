# Portal Launch — Design Spec

- **Date:** 2026-06-02
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Area:** Ticket detail / device troubleshooting

## Problem

When an alert correlates into a ticket, a tech often needs to dig deeper than our
dashboard shows — live device telemetry, call quality, peripheral status — which
only the vendor's own management portal exposes. Today the tech has to manually
open the right portal (Poly Lens, Yealink YMCS, etc.), log in, and hand-search for
the device. We want a one-click jump from the ticket to that device in its vendor
portal.

## Goals

- One-click "Open in {Platform}" from the ticket's device card.
- Land **directly on the device's page** in the vendor portal where we can build
  that URL; fall back to the portal home page otherwise.
- Record each launch in the ticket Timeline for the troubleshooting audit trail.
- Never leak vendor credentials/tokens to the browser.

## Non-Goals

- No embedding the vendor portal (iframe) — these portals set `X-Frame-Options`
  and require their own SSO login.
- No pulling diagnostics into our UI via vendor APIs (separate, larger effort).
- No launch control on the Alerts or Devices tables — **ticket detail only** for now.
- No new Settings UI — the override template (below) reuses the existing
  `PlatformCredential.config` JSON.

## Decisions

1. **Launch target: hybrid.** Device-specific deep link where we have a URL scheme
   (Poly Lens, Yealink YMCS); portal-home fallback for the four enum-only platforms
   (Neat Pulse, Logitech Sync, Cisco Control Hub, Utelogy). Degrades gracefully.
2. **Placement: ticket detail only.** The button lives on the device card in
   `TicketDetail.tsx`, visible even when the ticket is resolved (useful for
   post-mortems).
3. **URL architecture: code builders + config override.** A focused
   `portal-links.ts` module owns per-platform builders. An optional
   `PlatformCredential.config.portalUrlTemplate` can override a platform's URL with
   no deploy. Matches the existing adapter pattern (logic in code, tenant/secrets in
   `config`).
4. **Audit: TicketAction.** Record launches as a `PORTAL_LAUNCH` `TicketActionType`
   so they appear in the ticket's own Timeline alongside Reboot/Escalate. Costs one
   enum value + a migration.

## Architecture

The core is one pure, dependency-free module (`portal-links.ts`) that maps a device
context to a URL. URL construction happens **server-side** in the ticket page so the
credential `config` (which caches the OAuth access token) never serializes to the
client — only the finished `{ url, isDeepLink, label }` crosses the boundary.

```
page.tsx (server)                       portal-links.ts (pure)
  load ticket → alert → device          buildPortalLink(ctx):
  load PlatformCredential.config   ──▶     1. config.portalUrlTemplate override (https only)
  buildPortalLink(ctx) ─────────────┐      2. code builder (POLY_LENS, YEALINK_YMCS)
                                     │      3. PORTAL_HOME[platform] fallback
  pass { url, isDeepLink, label }    ◀──── always returns a usable URL; never throws
        │
        ▼
TicketDetail.tsx (client)
  <a target=_blank rel=noopener> opens tab
  + non-blocking POST .../actions { type: PORTAL_LAUNCH }  (keepalive)
  + optimistic Timeline append
```

## Components

### New

- `src/lib/portal-links.ts` — pure URL builder, ~150 lines, no DB/network/secrets.
- `src/test/portal-links.test.ts` — unit tests (co-located with existing tests in
  `src/test/`).

### Modified

- `prisma/schema.prisma` — add `PORTAL_LAUNCH` to `enum TicketActionType` (+ one
  migration via `prisma migrate dev`).
- `src/app/(app)/tickets/[id]/page.tsx` — query `platformCredential.config` for the
  device's platform, call `buildPortalLink(...)`, pass `portalLink` prop.
- `src/app/(app)/tickets/[id]/TicketDetail.tsx` — add `portalLink` prop; render the
  launch button on the device card; add a non-blocking `logPortalLaunch()` handler.
- `src/app/api/tickets/[id]/actions/route.ts` — add `PORTAL_LAUNCH` to the Zod
  `ActionSchema` enum and to the tier-1 set in `canPerformAction`; for
  `PORTAL_LAUNCH` just create the action (no device side-effect).

## Module contract: `portal-links.ts`

```ts
import { Platform } from "@prisma/client";

export interface PortalLinkContext {
  platform: Platform;
  platformId: string;                              // vendor device id (Device.platformId)
  deviceRawPayload: unknown;                        // Device.rawPayload (non-secret)
  credentialConfig: Record<string, unknown> | null; // PlatformCredential.config — SERVER ONLY
}

export interface PortalLink {
  url: string;        // always a usable https URL
  isDeepLink: boolean; // true = device page, false = portal-home fallback
  label: string;       // e.g. "Open in Poly Lens"
}

export function buildPortalLink(ctx: PortalLinkContext): PortalLink;
```

**Resolution order (first match wins):**

1. `credentialConfig.portalUrlTemplate` (string) → interpolate `{deviceId}`,
   `{tenantId}`, `{macAddress}` from ctx; accept only if the result starts with
   `https://`. → `isDeepLink: true`.
2. `DEEP_LINK_BUILDERS[platform]` (a `Partial<Record<Platform, (ctx) => string | null>>`)
   → device deep link. → `isDeepLink: true`.
3. `PORTAL_HOME[platform]` → `isDeepLink: false`.

Supporting maps are exhaustive over the enum:

- `PLATFORM_LABELS: Record<Platform, string>` → "Poly Lens", "Yealink YMCS",
  "Neat Pulse", "Logitech Sync", "Cisco Control Hub", "Utelogy".
- `PORTAL_HOME: Record<Platform, string>` → vendor portal front doors.

`buildPortalLink` is total: it always returns a `PortalLink` and never throws. IDs
are passed through `encodeURIComponent`.

## Per-platform URL schemes

| Platform            | Deep link today? | Home (fallback)             |
|---------------------|------------------|-----------------------------|
| POLY_LENS           | Yes (builder)    | `https://lens.poly.com`     |
| YEALINK_YMCS        | Yes (builder)    | `https://ymcs.yealink.com`  |
| NEAT_PULSE          | No → home        | `https://pulse.neat.no`     |
| LOGITECH_SYNC       | No → home        | `https://sync.logitech.com` |
| CISCO_CONTROL_HUB   | No → home        | `https://admin.webex.com`   |
| UTELOGY             | No → home        | `https://app.utelogy.com`   |

**Verification required:** the exact device-page paths for Poly Lens and Yealink
YMCS (and several home URLs, e.g. Utelogy) are behind authenticated portals and not
reliably documented. Implementation will encode a best-known scheme and flag it for
verification against the live portals. The `portalUrlTemplate` override is the
no-deploy correction path if a guessed URL is wrong.

## Data flow

1. Tech opens the ticket. `page.tsx` (server) already includes `alert.device`. If a
   device is present it additionally runs
   `prisma.platformCredential.findUnique({ where: { platform }, select: { config: true } })`,
   then `buildPortalLink({ platform, platformId, deviceRawPayload: device.rawPayload, credentialConfig: cred?.config ?? null })`.
2. Only `{ url, isDeepLink, label }` (or `null` when there's no device) is passed to
   `TicketDetail`.
3. Click → native `<a target="_blank" rel="noopener noreferrer">` opens the tab (a
   genuine user gesture on an anchor, so it isn't popup-blocked) **and** fires a
   non-blocking `POST /api/tickets/[id]/actions` with
   `{ type: "PORTAL_LAUNCH", body: "<label> · <device|portal home>" }` using
   `fetch(..., { keepalive: true })`. The Timeline appends optimistically.
4. The route creates the `PORTAL_LAUNCH` action (no reboot/side-effect) and returns it.

## Audit logging

- `PORTAL_LAUNCH` is added to `TicketActionType` and to the route's Zod enum.
- `canPerformAction`: `PORTAL_LAUNCH` joins the tier-1 set — any tech may launch.
- The action `body` records which platform and whether it was a device deep link or
  the portal home, so the Timeline reads e.g. "Alex — portal launch — Poly Lens ·
  device deep-link".

## Error handling & security

- `buildPortalLink` always returns a usable URL; if there's no device/alert the
  `portalLink` prop is `null` and no button renders.
- Missing or unconfigured `PlatformCredential` → `credentialConfig` is `null`; the
  code builder or home fallback still produces a URL.
- The audit `POST` is fire-and-forget; a failure is logged to the console client-side
  and never blocks the portal from opening (navigation has already happened).
- `rel="noopener noreferrer"` + `target="_blank"`; IDs `encodeURIComponent`-escaped.
- Override templates are validated to produce an `https://` URL or are ignored
  (fallback to home). The override lives in admin-only `PlatformCredential.config`,
  so it is not an external-user injection vector.
- Secrets never cross to the client: only `{ url, isDeepLink, label }` is serialized.

## Testing

**Unit — `src/test/portal-links.test.ts`:**

- POLY_LENS and YEALINK_YMCS produce the expected device deep link, `isDeepLink:true`.
- NEAT_PULSE / LOGITECH_SYNC / CISCO_CONTROL_HUB / UTELOGY → home URL,
  `isDeepLink:false`.
- `config.portalUrlTemplate` override wins and interpolates `{deviceId}` / `{tenantId}`.
- A non-`https` template is rejected → falls back to home.
- Correct `label` per platform; device id is URL-encoded.

**Route — `src/app/api/tickets/[id]/actions`:**

- `PORTAL_LAUNCH` is accepted for a tier-1 user, creates the action, and triggers no
  reboot path.

**Regression:** keep the existing coverage floor (80/68/80/80) green.

## Open verification items (implementation-time)

1. Confirm Poly Lens device-page deep-link path (and whether it needs `tenantId`).
2. Confirm Yealink YMCS device-page deep-link path.
3. Confirm the home URLs for Utelogy (and sanity-check the others).

## Out of scope / future

- Launch controls on the Alerts and Devices tables.
- Deep-link builders for Neat Pulse, Logitech Sync, Cisco Control Hub, Utelogy once
  schemes are known (drop-in additions to `DEEP_LINK_BUILDERS`).
- A Settings UI for editing `portalUrlTemplate` (today: edit `config` JSON directly).
