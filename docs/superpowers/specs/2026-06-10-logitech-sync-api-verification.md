# Logitech Sync API Verification — Design Spec

**Source:** Sync API Quick Start Guide (hub.sync.logitech.com, post 1-8), fetched 2026-06-10.
**Purpose:** Reconcile the Logitech Sync integration (built 2026-06-10 from assumptions) with the now-documented API, and define what changes.

## What the quick-start guide confirms (verified facts)

| Fact | Our implementation | Status |
|---|---|---|
| Auth is mTLS with `certificate.pem` + `privateKey.pem` | `logi-sync-client.ts` undici Agent with `cert`/`key` | ✅ matches |
| Credentials come from Sync Portal → Settings → Sync Cloud API → "Generate new certificate" | Settings card asks for PEMs + Org ID | ✅ matches (help text should name the portal path) |
| Org ID + API Server are required; example server `https://api.sync.logitech.com/v1/` (note trailing slash) | config.orgId + config.apiServer with that default; client strips trailing slash | ✅ matches |
| `GET /places` with Org ID in the path returns the org's rooms/spaces | Adapter calls `/places` first | ✅ matches |
| **Only two certificates can exist per Sync account at once** | Not surfaced anywhere | ⚠️ surface in Settings help text |
| Private key must never be stored in plain text / repo / code | keyPem stored in `PlatformCredential.config` (DB), write-only via API, never echoed | ⚠️ acceptable for now (same posture as all platform creds); recommend DB-at-rest encryption as a follow-up |

## What the guide does NOT document

- A device-list endpoint (`/devices` in our adapter is still an assumption).
- Any device command (reboot, firmware). These live in the **OpenAPI spec downloadable from the Sync Portal** (Settings → Sync Cloud API tab) — Alex action item.
- Rate limits.

## CollabOS API finding (out of scope)

The guide also documents a **device-local CollabOS API**: `POST api/v1/Sign In` against the device's IPv4 with username/password (Local Network Access) returning an `auth_token`. This requires network adjacency to the device, so it is not usable from the cloud-hosted VNOC. Recorded for a possible future on-prem collector; no work planned.

## Design decisions

1. **Keep the mTLS client unchanged** — fully validated by the guide.
2. **Make device discovery resilient:** `/places` is the only verified endpoint, and Sync orgs commonly embed devices under places. `fetchDevicesRaw` will (a) collect devices embedded in the `/places` response (`places[].devices[]` when present), and (b) still try `/devices` as a fallback, tolerating a 404 (endpoint may not exist) without failing the sync when places already produced devices. All mapping stays isolated in that one function.
3. **Create `scripts/smoke-logitech.ts`** (gitignored) that hits `/places` with real cert material and dumps the raw response — the concrete verification step once certificates are generated.
4. **Settings UX:** Logitech card help text gains the portal path and the two-certificate-limit warning.
5. **Reboot stays unimplemented** until the OpenAPI spec is downloaded (tracked in docs/TODO.md — Alex #5).
