# Logitech Sync Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Logitech Sync (Cloud API) integration that polls org-level device/room inventory over mTLS and feeds the existing correlation/alert pipeline — bringing `LOGITECH_SYNC` from enum-only to a working adapter.

**Architecture:** Mirror the Poly Lens adapter (polling, no webhooks). A new `logitech-sync.ts` implements the existing `PlatformAdapter` interface; an mTLS HTTPS client uses a client certificate + private key (from the Sync Portal) stored in `PlatformCredential.config`. The existing daily cron + `syncAllDevices()` registry invoke it. No schema changes (cert material lives in the flexible `config` JSON).

**Tech Stack:** Next.js 15 API routes, Prisma 7, Node `https`/`undici` with client-cert `Agent`, Zod, Vitest.

**Spec:** embedded below (Design section).

---

## Design

### Authentication (mTLS)
Per the Sync API quick-start, the Cloud API uses **mutual-TLS client-certificate auth** — no API key/OAuth. The integration needs:
- `certPem` — client certificate (PEM)
- `keyPem` — client private key (PEM)
- `orgId` — organization id (path variable)
- `apiServer` — org-specific base, default `https://api.sync.logitech.com/v1`

These are stored in `PlatformCredential.config` (JSON) for `platform = LOGITECH_SYNC`. No new columns. The private key is sensitive — it is never returned to the client by the integrations API (write-only; see Task 6).

### Endpoints (verify against the Sync Portal OpenAPI spec at implementation time)
- `GET {apiServer}/{orgId}/places` — spaces/rooms (documented).
- Device listing/health endpoint — **exact path + fields are not in the quick-start guide.** The guide directs downloading the OpenAPI spec from the Sync Portal. The adapter isolates this in one function (`fetchDevicesRaw`) with a clearly-marked TODO so the path/field mapping is verified against the spec or live response, exactly like `poly-lens.ts` marks its reboot mutation as TBD.

### Behavior
- `syncDevices()` — fetch places + devices, normalize each to `NormalizedDevice` (online/offline/unknown), return list. `syncAllDevices()` upserts them (existing logic).
- `fetchRecentAlerts(since)` — Sync Cloud has no time-filtered alert feed and no webhooks, so (like Poly) derive alerts from currently-offline devices; the correlation engine dedups.
- `normalizeWebhookPayload` / `verifyWebhookSignature` — no-ops returning `null` / `false` (polling-only adapter; documented).
- `rebootDevice(platformId)` — if the OpenAPI spec exposes a reboot/command endpoint, implement it; otherwise throw `"Reboot not supported for Logitech Sync"` (caught by the ticket-action handler, which already wraps reboots in try/catch).

### mTLS client helper
A small `logi-sync-client.ts` builds a fetch wrapper using an `https.Agent({ cert, key })` (via `undici`'s `Agent`/`connect` options or Node `https`). All requests go through it so cert handling lives in one file.

### Error handling
- Missing/invalid creds → adapter init rejects with a descriptive error; `syncAllDevices()` already collects per-adapter init failures into `errors[]` without aborting other adapters.
- Non-2xx responses → throw with status + body snippet; logged server-side.

---

## Task 1: mTLS client helper

**Files:**
- Create: `src/lib/integrations/logi-sync-client.ts`
- Test: `src/test/integrations/logi-sync-client.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/integrations/logi-sync-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { createLogiSyncClient } from "@/lib/integrations/logi-sync-client";

beforeEach(() => mockFetch.mockReset());

describe("createLogiSyncClient", () => {
  const opts = { apiServer: "https://api.sync.logitech.com/v1", orgId: "org-1", certPem: "CERT", keyPem: "KEY" };

  it("builds org-scoped URLs and parses JSON", async () => {
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ places: [] }), { status: 200 }));
    const client = createLogiSyncClient(opts);
    const data = await client.get<{ places: unknown[] }>("/places");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.sync.logitech.com/v1/org-1/places",
      expect.objectContaining({ method: "GET" }),
    );
    expect(data.places).toEqual([]);
  });

  it("throws on non-2xx with status in the message", async () => {
    mockFetch.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    const client = createLogiSyncClient(opts);
    await expect(client.get("/places")).rejects.toThrow(/403/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/integrations/logi-sync-client.test.ts`
Expected: FAIL — `Cannot find module '@/lib/integrations/logi-sync-client'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/integrations/logi-sync-client.ts
import { Agent } from "undici";

export interface LogiSyncClientOptions {
  apiServer: string;
  orgId: string;
  certPem: string;
  keyPem: string;
}

export interface LogiSyncClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export function createLogiSyncClient(opts: LogiSyncClientOptions): LogiSyncClient {
  const base = `${opts.apiServer.replace(/\/$/, "")}/${opts.orgId}`;
  // mTLS: present the client cert/key on the TLS connection.
  const dispatcher = new Agent({
    connect: { cert: opts.certPem, key: opts.keyPem },
  });

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      // @ts-expect-error undici dispatcher is accepted by Node's fetch
      dispatcher,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Logitech Sync ${method} ${path} failed: ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  };
}
```

> Note: the test stubs global `fetch`, so the `dispatcher` option is ignored under test; it only matters at runtime. `undici` ships with Node 18+ (already a transitive dep via Next).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/integrations/logi-sync-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/logi-sync-client.ts src/test/integrations/logi-sync-client.test.ts
git commit -m "feat: add Logitech Sync mTLS client helper"
```

---

## Task 2: Logitech Sync adapter

**Files:**
- Create: `src/lib/integrations/logitech-sync.ts`
- Test: `src/test/integrations/logitech-sync.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/integrations/logitech-sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({ getCredential: vi.fn() }));
const mockGet = vi.fn();
vi.mock("@/lib/integrations/logi-sync-client", () => ({
  createLogiSyncClient: () => ({ get: mockGet, post: vi.fn() }),
}));

import { getCredential } from "@/lib/integrations/credentials";
import { createLogiSyncAdapter } from "@/lib/integrations/logitech-sync";

const mockCred = vi.mocked(getCredential);
beforeEach(() => { vi.resetAllMocks(); });

const VALID_CONFIG = {
  config: { orgId: "org-1", apiServer: "https://api.sync.logitech.com/v1", certPem: "C", keyPem: "K" },
};

describe("createLogiSyncAdapter", () => {
  it("rejects when credentials are missing", async () => {
    mockCred.mockResolvedValueOnce(null);
    await expect(createLogiSyncAdapter()).rejects.toThrow(/not configured/i);
  });

  it("rejects when cert material is incomplete", async () => {
    mockCred.mockResolvedValueOnce({ config: { orgId: "org-1" } } as never);
    await expect(createLogiSyncAdapter()).rejects.toThrow(/certificate|key|orgId/i);
  });

  it("syncDevices normalizes places+devices into NormalizedDevice[]", async () => {
    mockCred.mockResolvedValueOnce(VALID_CONFIG as never);
    // First call: places, second call: devices (shape per OpenAPI spec — see adapter TODO)
    mockGet
      .mockResolvedValueOnce({ places: [{ id: "place-1", name: "Room A" }] })
      .mockResolvedValueOnce({ devices: [
        { id: "dev-1", name: "Rally Bar", placeId: "place-1", connectionStatus: "online", model: "Rally Bar", firmwareVersion: "1.2.3" },
      ] });
    const adapter = await createLogiSyncAdapter();
    const devices = await adapter.syncDevices();
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      platform: "LOGITECH_SYNC",
      platformId: "dev-1",
      name: "Rally Bar",
      status: "online",
      model: "Rally Bar",
    });
  });

  it("normalizeWebhookPayload returns null and verifyWebhookSignature returns false (polling-only)", async () => {
    mockCred.mockResolvedValueOnce(VALID_CONFIG as never);
    const adapter = await createLogiSyncAdapter();
    expect(adapter.normalizeWebhookPayload({})).toBeNull();
    expect(adapter.verifyWebhookSignature("x", "y")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/integrations/logitech-sync.test.ts`
Expected: FAIL — `Cannot find module '@/lib/integrations/logitech-sync'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/integrations/logitech-sync.ts
import { Platform } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential } from "./credentials";
import { createLogiSyncClient, LogiSyncClient } from "./logi-sync-client";

const DEFAULT_API_SERVER = "https://api.sync.logitech.com/v1";

interface LogiConfig { orgId: string; apiServer: string; certPem: string; keyPem: string; }

function readConfig(raw: unknown): LogiConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  const orgId = typeof c.orgId === "string" ? c.orgId : "";
  const certPem = typeof c.certPem === "string" ? c.certPem : "";
  const keyPem = typeof c.keyPem === "string" ? c.keyPem : "";
  const apiServer = typeof c.apiServer === "string" && c.apiServer ? c.apiServer : DEFAULT_API_SERVER;
  if (!orgId || !certPem || !keyPem) {
    throw new Error("Logitech Sync requires orgId, certificate (certPem) and private key (keyPem)");
  }
  return { orgId, certPem, keyPem, apiServer };
}

// Maps a Sync connection status to our normalized status.
function toStatus(value: unknown): DeviceStatus {
  if (value === "online" || value === "connected") return "online";
  if (value === "offline" || value === "disconnected") return "offline";
  return "unknown";
}

// TODO(verify): confirm the device endpoint path and field names against the
// Sync Portal OpenAPI spec / a live response. `/devices` + the fields below are
// the working assumption from the quick-start guide; isolate changes here.
async function fetchDevicesRaw(client: LogiSyncClient): Promise<Array<Record<string, unknown>>> {
  await client.get<{ places: unknown[] }>("/places"); // ensures org access; place mapping optional
  const res = await client.get<{ devices?: Array<Record<string, unknown>> }>("/devices");
  return res.devices ?? [];
}

export async function createLogiSyncAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential(Platform.LOGITECH_SYNC);
  if (!cred) throw new Error("Logitech Sync credentials not configured");
  const cfg = readConfig(cred.config);
  const client = createLogiSyncClient(cfg);

  async function syncDevices(): Promise<NormalizedDevice[]> {
    const raw = await fetchDevicesRaw(client);
    return raw.map((d) => ({
      platform: Platform.LOGITECH_SYNC,
      platformId: String(d.id),
      name: typeof d.name === "string" ? d.name : String(d.id),
      model: typeof d.model === "string" ? d.model : undefined,
      firmware: typeof d.firmwareVersion === "string" ? d.firmwareVersion : undefined,
      macAddress: typeof d.macAddress === "string" ? d.macAddress : undefined,
      status: toStatus(d.connectionStatus ?? d.status),
      lastSeenAt: typeof d.lastSeen === "string" ? new Date(d.lastSeen) : undefined,
      rawPayload: d,
    }));
  }

  async function fetchRecentAlerts(_since: Date): Promise<NormalizedAlert[]> {
    // No time-filtered alert feed; derive from offline devices (correlation dedups).
    const devices = await syncDevices();
    return devices
      .filter((d) => d.status === "offline")
      .map((d) => ({
        platform: Platform.LOGITECH_SYNC,
        platformAlertId: `offline-${d.platformId}`,
        platformDeviceId: d.platformId,
        severity: "CRITICAL" as const,
        title: `${d.name} offline`,
        description: `Logitech Sync reports ${d.name} as offline`,
        rawPayload: d.rawPayload,
        receivedAt: new Date(),
      }));
  }

  return {
    syncDevices,
    fetchRecentAlerts,
    normalizeWebhookPayload: () => null,
    verifyWebhookSignature: () => false,
    rebootDevice: async () => {
      // TODO(verify): implement if the OpenAPI spec exposes a device command endpoint.
      throw new Error("Reboot not supported for Logitech Sync");
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/integrations/logitech-sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/logitech-sync.ts src/test/integrations/logitech-sync.test.ts
git commit -m "feat: add Logitech Sync polling adapter"
```

---

## Task 3: Register adapter in the sync pipeline

**Files:**
- Modify: `src/lib/integrations/sync.ts`
- Test: `src/test/sync.test.ts` (extend)

- [ ] **Step 1: Read `src/lib/integrations/sync.ts`** to find the `syncAllDevices()` adapter-assembly block (where Poly and Yealink adapters are pushed with `Promise.allSettled`-style guards).

- [ ] **Step 2: Write a failing test** asserting a Logitech adapter is attempted.

```typescript
// add to src/test/sync.test.ts — mock createLogiSyncAdapter and assert it is invoked
vi.mock("@/lib/integrations/logitech-sync", () => ({ createLogiSyncAdapter: vi.fn() }));
// ...then in a test: mock it to resolve an adapter returning [] and assert syncAllDevices()
// calls it and includes its devices / records its init error like the others.
```

(Match the existing structure of `sync.test.ts` — same mock + assertion style already used for Poly/Yealink.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/sync.test.ts`
Expected: FAIL (adapter not yet wired).

- [ ] **Step 4: Wire the adapter** in `syncAllDevices()` alongside Poly/Yealink:

```typescript
import { createLogiSyncAdapter } from "./logitech-sync";
// ...
const logiResult = await Promise.allSettled([createLogiSyncAdapter()]).then((r) => r[0]);
if (logiResult.status === "fulfilled") adapters.push(logiResult.value);
else errors.push(`LogitechSync adapter init failed: ${String(logiResult.reason)}`);
```

(Follow the exact guard pattern already used for the other two adapters in this file.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/test/sync.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/integrations/sync.ts src/test/sync.test.ts
git commit -m "feat: register Logitech Sync adapter in device sync pipeline"
```

---

## Task 4: Credential validation schema

**Files:**
- Modify: `src/lib/integrations/credentials.ts` (add a Logi config Zod schema + typed reader) OR create `src/lib/integrations/logi-config-schema.ts`
- Test: `src/test/integrations/logi-config-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/integrations/logi-config-schema.test.ts
import { describe, it, expect } from "vitest";
import { logiConfigSchema } from "@/lib/integrations/logi-config-schema";

describe("logiConfigSchema", () => {
  it("accepts full config", () => {
    const r = logiConfigSchema.safeParse({ orgId: "o", certPem: "C", keyPem: "K", apiServer: "https://x/v1" });
    expect(r.success).toBe(true);
  });
  it("requires orgId, certPem, keyPem", () => {
    expect(logiConfigSchema.safeParse({ orgId: "o" }).success).toBe(false);
  });
  it("defaults apiServer when omitted", () => {
    const r = logiConfigSchema.parse({ orgId: "o", certPem: "C", keyPem: "K" });
    expect(r.apiServer).toMatch(/api\.sync\.logitech\.com/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/integrations/logi-config-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/integrations/logi-config-schema.ts
import { z } from "zod";

export const logiConfigSchema = z.object({
  orgId: z.string().trim().min(1, "Org ID is required"),
  certPem: z.string().trim().min(1, "Client certificate is required"),
  keyPem: z.string().trim().min(1, "Private key is required"),
  apiServer: z.string().trim().url().default("https://api.sync.logitech.com/v1"),
});

export type LogiConfigInput = z.infer<typeof logiConfigSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/integrations/logi-config-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/logi-config-schema.ts src/test/integrations/logi-config-schema.test.ts
git commit -m "feat: add Logitech Sync credential config schema"
```

---

## Task 5: Integrations API — accept Logi cert config

**Files:**
- Modify: `src/app/api/integrations/route.ts`
- Test: `src/test/api/integrations.test.ts` (extend)

- [ ] **Step 1: Read** `src/app/api/integrations/route.ts` and the existing `integrations.test.ts` to match how POST validates/persists per-platform creds.

- [ ] **Step 2: Write a failing test** that POSTing `LOGITECH_SYNC` with `{ orgId, certPem, keyPem }` validates via `logiConfigSchema`, stores them in `config` (not returned in GET), and rejects incomplete cert material with 400.

- [ ] **Step 3: Run** `npx vitest run src/test/api/integrations.test.ts` → FAIL.

- [ ] **Step 4: Implement** the `LOGITECH_SYNC` branch: validate with `logiConfigSchema`, persist via `updateConfig(Platform.LOGITECH_SYNC, parsed)`. Ensure the GET response **omits `keyPem`/`certPem`** (return only `{ orgId, apiServer, hasCert: true }`).

- [ ] **Step 5: Run** the test → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/integrations/route.ts src/test/api/integrations.test.ts
git commit -m "feat: accept Logitech Sync mTLS cert config in integrations API"
```

---

## Task 6: Settings UI — Logitech Sync cert upload

**Files:**
- Modify: `src/app/(app)/settings/platform/page.tsx` (and its client component)

- [ ] **Step 1: Read** the platform settings page/client to match the existing per-platform credential form pattern.

- [ ] **Step 2: Add a Logitech Sync section** with fields: Org ID, API server (optional, placeholder = default), Certificate (PEM, textarea), Private key (PEM, textarea, write-only — shows "configured" when `hasCert`). On submit, POST to `/api/integrations` with `platform: "LOGITECH_SYNC"`.

- [ ] **Step 3: Manual verification** — `npm run dev`, open `/settings/platform`, confirm the Logitech Sync form renders, saves, and reloads showing "certificate configured" without leaking the key.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings/platform"
git commit -m "feat: add Logitech Sync credential form to platform settings"
```

---

## Task 7: Verification

- [ ] `npx tsc --noEmit` → clean
- [ ] `npx vitest run` → all pass (new client/adapter/schema/api tests included)
- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → succeeds
- [ ] Commit any fixes.

---

## Open Items (resolve during implementation with real credentials)
- **Device endpoint path + field names** (`fetchDevicesRaw`) — confirm against the Sync Portal OpenAPI spec. All mapping is isolated in one function.
- **Reboot/command support** — implement `rebootDevice` only if the spec exposes it; otherwise the documented throw is correct.
- **Places → Room mapping** — if Sync `places` correspond to VNOC rooms, a later enhancement can map `placeId` → `Room`; out of scope for this first pass (device sync + offline alerts).
