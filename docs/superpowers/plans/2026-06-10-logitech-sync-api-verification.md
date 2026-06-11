# Logitech Sync API Verification — Implementation Plan

**Spec:** docs/superpowers/specs/2026-06-10-logitech-sync-api-verification.md
**Goal:** Align the Logitech Sync integration with the verified quick-start facts: place-embedded device discovery with `/devices` fallback, a real smoke script, and Settings guidance. TDD throughout.

## Task 1: Resilient device discovery in the adapter

**Files:** `src/lib/integrations/logitech-sync.ts` · `src/test/integrations/logitech-sync.test.ts`

- [ ] RED — new tests:
  1. devices embedded in `/places` (`places[].devices[]`) are collected and normalized (place name recorded in rawPayload via `__placeName`).
  2. `/devices` results are merged after place-embedded ones, deduped by id.
  3. a 404 from `/devices` does NOT fail `syncDevices()` when places yielded devices.
  4. existing flat `/devices` behavior still works when places carry no devices.
- [ ] GREEN — rewrite `fetchDevicesRaw`: fetch `/places` once; collect `place.devices[]` arrays when present; then try `client.get("/devices")` in a try/catch — on error, if we already have devices, log a warn and continue, else rethrow. Dedup by `String(d.id)`.
- [ ] Run adapter suite + full suite.

## Task 2: Logitech smoke script

**Files:** `scripts/smoke-logitech.ts` (gitignored by `scripts/smoke-*.ts`)

- [ ] Reads `LOGI_ORG_ID`, `LOGI_API_SERVER` (default `https://api.sync.logitech.com/v1`), `LOGI_CERT_PATH`, `LOGI_KEY_PATH` from `.env.local`; loads PEMs from the file paths (never inline).
- [ ] mTLS GET `{server}/{orgId}/places`; print place count, first place JSON, and whether any `devices[]` arrays are embedded; then attempt `/devices` and report status/shape.
- [ ] Reminder output: "verify field names in logitech-sync.ts fetchDevicesRaw".

## Task 3: Settings guidance

**Files:** `src/app/(app)/settings/SettingsClient.tsx` · `src/test/settings-client.test.tsx`

- [ ] RED — test asserts the Logitech card mentions the portal path ("Sync Portal → Settings → Sync Cloud API") and the two-certificate limit.
- [ ] GREEN — update the Logitech field labels/help copy accordingly (cert field label includes the portal path; a small note line about the two-cert account limit).

## Task 4: Verification & docs

- [ ] `npx vitest run` full, `npx tsc --noEmit`, `npm run lint` all clean.
- [ ] Update `docs/TODO.md`: mark the Logitech doc-fetch portion of Alex #5 partially done (quick-start fetched; OpenAPI spec still needed for reboot/full field map).
- [ ] Commit per task or as one `feat:` commit referencing the spec.

## Out of scope

- Reboot (needs OpenAPI spec from the portal).
- CollabOS LNA API (device-local; unusable from cloud — see spec).
