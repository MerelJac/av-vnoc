# Utelogy Platform Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Utelogy as a 4th polling-only platform adapter (mirroring Logitech Sync exactly) including the adapter, sync/cron wiring, integrations PUT validation, settings UI card, and a manual smoke-test script.

**Architecture:** A new `createUtelogyAdapter` factory authenticates via Bearer apiKey, fetches devices from a tenant-specific base URL stored in `config.baseUrl`, derives offline alerts from offline devices, and is registered in sync.ts / cron-alerts route / settings UI alongside the three existing adapters. All field-name assumptions are isolated in one `fetchDevicesRaw()` function marked `TODO(verify)`.

**Tech Stack:** Next.js 15 App Router · Vitest · Prisma 7 · TypeScript · global `fetch` (no new dependencies)

---

## Baseline

Before starting, confirm the full test suite passes:

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run 2>&1 | tail -5
```

Expected: `49 passed (49)` / `319 passed (319)`

---

## File Map

| Action | File |
|--------|------|
| CREATE | `src/lib/integrations/utelogy.ts` |
| CREATE | `src/test/integrations/utelogy.test.ts` |
| MODIFY | `src/lib/integrations/sync.ts` |
| MODIFY | `src/test/sync.test.ts` |
| MODIFY | `src/app/api/cron/alerts/route.ts` |
| MODIFY | `src/test/api/cron-alerts.test.ts` |
| MODIFY | `src/app/api/integrations/route.ts` |
| MODIFY | `src/test/api/integrations.test.ts` |
| MODIFY | `src/app/(app)/settings/SettingsClient.tsx` |
| MODIFY | `src/test/settings-client.test.tsx` |
| CREATE | `scripts/smoke-utelogy.ts` |

---

## Task 1: Utelogy adapter + unit tests

**Files:**
- Create: `src/test/integrations/utelogy.test.ts`
- Create: `src/lib/integrations/utelogy.ts`

### Step 1.1 — Write the failing test file

Create `src/test/integrations/utelogy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({ getCredential: vi.fn() }));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { getCredential } from "@/lib/integrations/credentials";
import { createUtelogyAdapter } from "@/lib/integrations/utelogy";

const mockCred = vi.mocked(getCredential);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mockFetch);
});

const VALID_CRED = {
  apiKey: "test-api-key",
  config: { baseUrl: "https://acme.utelogy.com" },
};

describe("createUtelogyAdapter", () => {
  it("rejects when credentials are missing", async () => {
    mockCred.mockResolvedValueOnce(null);
    await expect(createUtelogyAdapter()).rejects.toThrow(/not configured/i);
  });

  it("rejects when apiKey is missing", async () => {
    mockCred.mockResolvedValueOnce({ apiKey: null, config: { baseUrl: "https://acme.utelogy.com" } } as never);
    await expect(createUtelogyAdapter()).rejects.toThrow(/apiKey/i);
  });

  it("rejects when baseUrl is missing from config", async () => {
    mockCred.mockResolvedValueOnce({ apiKey: "key", config: {} } as never);
    await expect(createUtelogyAdapter()).rejects.toThrow(/baseUrl/i);
  });

  it("rejects when baseUrl is not a valid URL", async () => {
    mockCred.mockResolvedValueOnce({ apiKey: "key", config: { baseUrl: "not-a-url" } } as never);
    await expect(createUtelogyAdapter()).rejects.toThrow(/baseUrl/i);
  });
});

describe("syncDevices", () => {
  it("normalizes devices into NormalizedDevice[]", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          {
            id: "dev-1",
            name: "Utelogy Room A",
            model: "RoomBar",
            firmwareVersion: "2.0.1",
            macAddress: "AA:BB:CC:DD:EE:FF",
            connectionStatus: "online",
            lastSeen: "2026-06-10T12:00:00Z",
          },
        ],
      }),
    });

    const adapter = await createUtelogyAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      platform: "UTELOGY",
      platformId: "dev-1",
      name: "Utelogy Room A",
      model: "RoomBar",
      firmware: "2.0.1",
      macAddress: "aa:bb:cc:dd:ee:ff",
      status: "online",
    });
    expect(devices[0].lastSeenAt).toBeInstanceOf(Date);
  });

  it("maps connected->online, disconnected->offline, unknown->unknown", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          { id: "d1", name: "A", connectionStatus: "connected" },
          { id: "d2", name: "B", connectionStatus: "disconnected" },
          { id: "d3", name: "C", connectionStatus: "sleeping" },
        ],
      }),
    });

    const adapter = await createUtelogyAdapter();
    const devices = await adapter.syncDevices();

    expect(devices[0].status).toBe("online");
    expect(devices[1].status).toBe("offline");
    expect(devices[2].status).toBe("unknown");
  });

  it("falls back to id string when name is missing", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ devices: [{ id: 42, connectionStatus: "online" }] }),
    });

    const adapter = await createUtelogyAdapter();
    const devices = await adapter.syncDevices();
    expect(devices[0].name).toBe("42");
  });

  it("lowercases macAddress when present", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [{ id: "d1", name: "X", macAddress: "AA:BB:CC:11:22:33", connectionStatus: "online" }],
      }),
    });

    const adapter = await createUtelogyAdapter();
    const devices = await adapter.syncDevices();
    expect(devices[0].macAddress).toBe("aa:bb:cc:11:22:33");
  });

  it("handles empty devices array from API", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ devices: [] }),
    });

    const adapter = await createUtelogyAdapter();
    const devices = await adapter.syncDevices();
    expect(devices).toHaveLength(0);
  });

  it("handles missing devices key in response (falls back to [])", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const adapter = await createUtelogyAdapter();
    const devices = await adapter.syncDevices();
    expect(devices).toHaveLength(0);
  });

  it("throws when fetch returns non-2xx", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    const adapter = await createUtelogyAdapter();
    await expect(adapter.syncDevices()).rejects.toThrow(/401/);
  });

  it("uses Bearer apiKey authorization header", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ devices: [] }),
    });

    const adapter = await createUtelogyAdapter();
    await adapter.syncDevices();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://acme.utelogy.com/api/v1/devices",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer test-api-key",
        }),
      })
    );
  });
});

describe("fetchRecentAlerts", () => {
  it("derives CRITICAL offline alerts from offline devices only", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          { id: "dev-up", name: "Room Up", connectionStatus: "online" },
          { id: "dev-down", name: "Room Down", connectionStatus: "offline" },
        ],
      }),
    });

    const adapter = await createUtelogyAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-06-01"));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      platform: "UTELOGY",
      platformAlertId: "offline-dev-down",
      platformDeviceId: "dev-down",
      severity: "CRITICAL",
      title: expect.stringContaining("Room Down"),
    });
    expect(alerts[0].description).toMatch(/Utelogy reports Room Down as offline/);
    expect(alerts[0].receivedAt).toBeInstanceOf(Date);
  });

  it("returns empty array when no devices are offline", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        devices: [
          { id: "d1", name: "Online Device", connectionStatus: "online" },
        ],
      }),
    });

    const adapter = await createUtelogyAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-06-01"));
    expect(alerts).toHaveLength(0);
  });
});

describe("webhooks and reboot", () => {
  it("normalizeWebhookPayload returns null (polling-only)", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    const adapter = await createUtelogyAdapter();
    expect(adapter.normalizeWebhookPayload({})).toBeNull();
  });

  it("verifyWebhookSignature returns false (polling-only)", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    const adapter = await createUtelogyAdapter();
    expect(adapter.verifyWebhookSignature("payload", "sig")).toBe(false);
  });

  it("rebootDevice throws unsupported error", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    const adapter = await createUtelogyAdapter();
    await expect(adapter.rebootDevice("dev-1")).rejects.toThrow(/not supported for Utelogy/i);
  });
});
```

- [ ] **Step 1.2: Run the test to verify it fails (module not found)**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/integrations/utelogy.test.ts 2>&1 | tail -20
```

Expected output: FAIL — `Cannot find module '@/lib/integrations/utelogy'`

- [ ] **Step 1.3: Create the implementation**

Create `src/lib/integrations/utelogy.ts`:

```typescript
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential } from "./credentials";

function toStatus(value: unknown): DeviceStatus {
  if (value === "online" || value === "connected") return "online";
  if (value === "offline" || value === "disconnected") return "offline";
  return "unknown";
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "content-type": "application/json",
  };
}

async function httpGet<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, { headers: buildHeaders(apiKey) });
  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 200);
    throw new Error(`Utelogy API ${res.status}: ${snippet}`);
  }
  return res.json() as Promise<T>;
}

// TODO(verify): confirm endpoint path + field names against the Utelogy U-API docs
// / a live response. `GET /api/v1/devices` + the field names below are the working
// assumption; isolate all changes here.
async function fetchDevicesRaw(
  baseUrl: string,
  apiKey: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await httpGet<{ devices?: Array<Record<string, unknown>> }>(
    `${baseUrl}/api/v1/devices`,
    apiKey,
  );
  return res.devices ?? [];
}

export async function createUtelogyAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential(Platform.UTELOGY);
  if (!cred) throw new Error("Utelogy credentials not configured");

  const apiKey = cred.apiKey;
  if (!apiKey) throw new Error("Utelogy requires apiKey");

  const rawConfig = (cred.config as Record<string, unknown>) ?? {};
  const baseUrl = rawConfig.baseUrl;
  if (!baseUrl || typeof baseUrl !== "string") {
    throw new Error("Utelogy requires baseUrl in config");
  }
  try {
    new URL(baseUrl);
  } catch {
    throw new Error("Utelogy baseUrl is not a valid URL");
  }

  async function syncDevices(): Promise<NormalizedDevice[]> {
    const raw = await fetchDevicesRaw(baseUrl as string, apiKey as string);
    return raw.map((d): NormalizedDevice => ({
      platform: Platform.UTELOGY,
      platformId: String(d.id),
      name: typeof d.name === "string" ? d.name : String(d.id),
      model: typeof d.model === "string" ? d.model : undefined,
      firmware: typeof d.firmwareVersion === "string" ? d.firmwareVersion : undefined,
      macAddress: typeof d.macAddress === "string" ? d.macAddress.toLowerCase() : undefined,
      status: toStatus(d.connectionStatus ?? d.status),
      lastSeenAt: typeof d.lastSeen === "string" ? new Date(d.lastSeen) : undefined,
      rawPayload: d,
    }));
  }

  async function fetchRecentAlerts(_since: Date): Promise<NormalizedAlert[]> {
    // Utelogy has no time-filtered alert feed; derive alerts from currently-offline
    // devices — the correlation engine dedups repeats.
    const devices = await syncDevices();
    return devices
      .filter((d) => d.status === "offline")
      .map((d): NormalizedAlert => ({
        platform: Platform.UTELOGY,
        platformAlertId: `offline-${d.platformId}`,
        platformDeviceId: d.platformId,
        severity: AlertSeverity.CRITICAL,
        title: `${d.name} offline`,
        description: `Utelogy reports ${d.name} as offline`,
        rawPayload: d.rawPayload,
        receivedAt: new Date(),
      }));
  }

  return {
    syncDevices,
    fetchRecentAlerts,
    // Polling-only adapter: Utelogy U-API does not expose webhooks.
    normalizeWebhookPayload: () => null,
    verifyWebhookSignature: () => false,
    rebootDevice: async () => {
      // TODO(verify): implement if the U-API exposes a device command endpoint.
      throw new Error("Reboot not supported for Utelogy");
    },
  };
}
```

- [ ] **Step 1.4: Run the test to verify it passes**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/integrations/utelogy.test.ts 2>&1 | tail -20
```

Expected: all tests in this file PASS.

---

## Task 2: Register adapter in sync.ts

**Files:**
- Modify: `src/lib/integrations/sync.ts`
- Modify: `src/test/sync.test.ts`

- [ ] **Step 2.1: Add failing tests to sync.test.ts**

Add the Utelogy mock to the existing `vi.mock` block and add two new `it()` blocks. The file currently ends at line 112. The full updated test file should be:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    device: { upsert: vi.fn() },
  },
}))
vi.mock('@/lib/integrations/poly-lens', () => ({
  createPolyLensAdapter: vi.fn(),
}))
vi.mock('@/lib/integrations/yealink', () => ({
  createYealinkAdapter: vi.fn(),
}))
vi.mock('@/lib/integrations/logitech-sync', () => ({
  createLogiSyncAdapter: vi.fn(),
}))
vi.mock('@/lib/integrations/utelogy', () => ({
  createUtelogyAdapter: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { createPolyLensAdapter } from '@/lib/integrations/poly-lens'
import { createYealinkAdapter } from '@/lib/integrations/yealink'
import { createLogiSyncAdapter } from '@/lib/integrations/logitech-sync'
import { createUtelogyAdapter } from '@/lib/integrations/utelogy'
import { syncAllDevices } from '@/lib/integrations/sync'

const makeAdapter = (devices: unknown[]) => ({
  syncDevices: vi.fn().mockResolvedValue(devices),
  fetchRecentAlerts: vi.fn(),
  normalizeWebhookPayload: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  rebootDevice: vi.fn(),
})

describe('syncAllDevices', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upserts each device returned by adapters', async () => {
    const mockPolyDevice = {
      platform: 'POLY_LENS' as const,
      platformId: 'poly-1',
      name: 'Poly X50',
      status: 'online' as const,
      rawPayload: {},
    }
    const mockYealinkDevice = {
      platform: 'YEALINK_YMCS' as const,
      platformId: 'yk-1',
      name: 'Yealink CP960',
      status: 'offline' as const,
      rawPayload: {},
    }

    vi.mocked(createPolyLensAdapter).mockResolvedValue({
      syncDevices: vi.fn().mockResolvedValue([mockPolyDevice]),
      fetchRecentAlerts: vi.fn(),
      normalizeWebhookPayload: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      rebootDevice: vi.fn(),
    })
    vi.mocked(createYealinkAdapter).mockResolvedValue({
      syncDevices: vi.fn().mockResolvedValue([mockYealinkDevice]),
      fetchRecentAlerts: vi.fn(),
      normalizeWebhookPayload: vi.fn(),
      verifyWebhookSignature: vi.fn(),
      rebootDevice: vi.fn(),
    })

    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    await syncAllDevices()

    expect(prisma.device.upsert).toHaveBeenCalledTimes(2)
  })

  it('syncs Logitech Sync devices alongside the other adapters', async () => {
    vi.mocked(createPolyLensAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockResolvedValue(
      makeAdapter([
        {
          platform: 'LOGITECH_SYNC' as const,
          platformId: 'logi-1',
          name: 'Rally Bar',
          status: 'online' as const,
          rawPayload: {},
        },
      ]) as any
    )
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    const result = await syncAllDevices()

    expect(createLogiSyncAdapter).toHaveBeenCalledOnce()
    expect(prisma.device.upsert).toHaveBeenCalledTimes(1)
    expect(result.synced).toBe(1)
  })

  it('records Logitech init failure in errors without blocking other adapters', async () => {
    vi.mocked(createPolyLensAdapter).mockResolvedValue(
      makeAdapter([
        { platform: 'POLY_LENS' as const, platformId: 'p1', name: 'X50', status: 'online' as const, rawPayload: {} },
      ]) as any
    )
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('cert missing'))
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    const result = await syncAllDevices()

    expect(result.synced).toBe(1)
    expect(result.errors.some((e) => e.includes('LogitechSync'))).toBe(true)
  })

  it('syncs Utelogy devices alongside the other adapters', async () => {
    vi.mocked(createPolyLensAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createUtelogyAdapter).mockResolvedValue(
      makeAdapter([
        {
          platform: 'UTELOGY' as const,
          platformId: 'ute-1',
          name: 'Utelogy Room Bar',
          status: 'online' as const,
          rawPayload: {},
        },
      ]) as any
    )
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    const result = await syncAllDevices()

    expect(createUtelogyAdapter).toHaveBeenCalledOnce()
    expect(prisma.device.upsert).toHaveBeenCalledTimes(1)
    expect(result.synced).toBe(1)
  })

  it('records Utelogy init failure in errors without blocking other adapters', async () => {
    vi.mocked(createPolyLensAdapter).mockResolvedValue(
      makeAdapter([
        { platform: 'POLY_LENS' as const, platformId: 'p1', name: 'X50', status: 'online' as const, rawPayload: {} },
      ]) as any
    )
    vi.mocked(createYealinkAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createLogiSyncAdapter).mockRejectedValue(new Error('no creds'))
    vi.mocked(createUtelogyAdapter).mockRejectedValue(new Error('no api key'))
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    const result = await syncAllDevices()

    expect(result.synced).toBe(1)
    expect(result.errors.some((e) => e.includes('Utelogy'))).toBe(true)
  })
})
```

- [ ] **Step 2.2: Run test to verify new tests fail**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/sync.test.ts 2>&1 | tail -20
```

Expected: The two new Utelogy tests FAIL (sync.ts doesn't call createUtelogyAdapter yet).

- [ ] **Step 2.3: Update sync.ts to register the Utelogy adapter**

Replace the full content of `src/lib/integrations/sync.ts` with:

```typescript
import { prisma } from "@/lib/prisma";
import { NormalizedDevice } from "./types";
import { createPolyLensAdapter } from "./poly-lens";
import { createYealinkAdapter } from "./yealink";
import { createLogiSyncAdapter } from "./logitech-sync";
import { createUtelogyAdapter } from "./utelogy";

async function upsertDevice(device: NormalizedDevice): Promise<void> {
  const { platform, platformId, name, model, firmware, ipAddress, macAddress, status, lastSeenAt, rawPayload } = device;

  await prisma.device.upsert({
    where: {
      platform_platformId: { platform, platformId },
    },
    create: {
      platform,
      platformId,
      name,
      model: model ?? null,
      firmware: firmware ?? null,
      ipAddress: ipAddress ?? null,
      macAddress: macAddress ?? null,
      status,
      lastSeenAt: lastSeenAt ?? null,
      rawPayload: rawPayload as object,
    },
    update: {
      name,
      model: model ?? null,
      firmware: firmware ?? null,
      ipAddress: ipAddress ?? null,
      macAddress: macAddress ?? null,
      status,
      lastSeenAt: lastSeenAt ?? null,
      rawPayload: rawPayload as object,
    },
  });
}

export async function syncAllDevices(): Promise<{ synced: number; errors: string[] }> {
  const [polyResult, yealinkResult, logiResult, utelogyResult] = await Promise.allSettled([
    createPolyLensAdapter(),
    createYealinkAdapter(),
    createLogiSyncAdapter(),
    createUtelogyAdapter(),
  ]);

  const adapters: Array<Awaited<ReturnType<typeof createPolyLensAdapter>>> = [];
  const errors: string[] = [];

  if (polyResult.status === "fulfilled") {
    adapters.push(polyResult.value);
  } else {
    errors.push(`PolyLens adapter init failed: ${String(polyResult.reason)}`);
  }

  if (yealinkResult.status === "fulfilled") {
    adapters.push(yealinkResult.value);
  } else {
    errors.push(`Yealink adapter init failed: ${String(yealinkResult.reason)}`);
  }

  if (logiResult.status === "fulfilled") {
    adapters.push(logiResult.value);
  } else {
    errors.push(`LogitechSync adapter init failed: ${String(logiResult.reason)}`);
  }

  if (utelogyResult.status === "fulfilled") {
    adapters.push(utelogyResult.value);
  } else {
    errors.push(`Utelogy adapter init failed: ${String(utelogyResult.reason)}`);
  }

  let synced = 0;

  for (const adapter of adapters) {
    try {
      const devices = await adapter.syncDevices();
      await Promise.all(devices.map(upsertDevice));
      synced += devices.length;
    } catch (err) {
      errors.push(`Adapter sync failed: ${String(err)}`);
    }
  }

  return { synced, errors };
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/sync.test.ts 2>&1 | tail -20
```

Expected: all 5 tests in this file PASS.

---

## Task 3: Add UTELOGY to POLLED_PLATFORMS in cron route

**Files:**
- Modify: `src/app/api/cron/alerts/route.ts`
- Modify: `src/test/api/cron-alerts.test.ts`

- [ ] **Step 3.1: Write failing tests — add Utelogy mock and new test to cron-alerts.test.ts**

Replace the full content of `src/test/api/cron-alerts.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/integrations/poly-lens", () => ({ createPolyLensAdapter: vi.fn() }));
vi.mock("@/lib/integrations/yealink", () => ({ createYealinkAdapter: vi.fn() }));
vi.mock("@/lib/integrations/logitech-sync", () => ({ createLogiSyncAdapter: vi.fn() }));
vi.mock("@/lib/integrations/utelogy", () => ({ createUtelogyAdapter: vi.fn() }));
vi.mock("@/lib/integrations/credentials", () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));
vi.mock("@/lib/correlation", () => ({
  processAlert: vi.fn(),
  runAutoResolveSweep: vi.fn(),
}));

import { GET } from "@/app/api/cron/alerts/route";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { createLogiSyncAdapter } from "@/lib/integrations/logitech-sync";
import { createUtelogyAdapter } from "@/lib/integrations/utelogy";
import { getConfig, updateConfig } from "@/lib/integrations/credentials";
import { processAlert, runAutoResolveSweep } from "@/lib/correlation";

const mockPoly = vi.mocked(createPolyLensAdapter);
const mockYealink = vi.mocked(createYealinkAdapter);
const mockLogi = vi.mocked(createLogiSyncAdapter);
const mockUtelogy = vi.mocked(createUtelogyAdapter);
const mockGetConfig = vi.mocked(getConfig);
const mockUpdateConfig = vi.mocked(updateConfig);
const mockProcessAlert = vi.mocked(processAlert);
const mockSweep = vi.mocked(runAutoResolveSweep);

const CRON_SECRET = "test-cron-secret";

function makeRequest(auth?: string) {
  return new NextRequest("http://localhost/api/cron/alerts", {
    headers: auth ? { authorization: auth } : {},
  });
}

function makeAdapter(alerts: unknown[]) {
  return {
    syncDevices: vi.fn(),
    fetchRecentAlerts: vi.fn().mockResolvedValue(alerts),
    normalizeWebhookPayload: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    rebootDevice: vi.fn(),
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  mockGetConfig.mockResolvedValue({});
  mockUpdateConfig.mockResolvedValue(undefined as never);
  mockProcessAlert.mockResolvedValue({ action: "created", alertId: "a1" });
  mockSweep.mockResolvedValue({ resolved: 0 });
});

describe("GET /api/cron/alerts", () => {
  it("returns 401 without the cron bearer token", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong bearer token", async () => {
    const res = await GET(makeRequest("Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("polls Poly, Yealink, Logitech, and Utelogy and processes their alerts", async () => {
    mockPoly.mockResolvedValue(makeAdapter([{ platformAlertId: "p1" }]));
    mockYealink.mockResolvedValue(makeAdapter([{ platformAlertId: "y1" }]));
    mockLogi.mockResolvedValue(makeAdapter([{ platformAlertId: "l1" }]));
    mockUtelogy.mockResolvedValue(makeAdapter([{ platformAlertId: "u1" }]));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as {
      ok: boolean;
      results: Record<string, { processed: number; errors: string[] }>;
    };

    expect(res.status).toBe(200);
    expect(body.results.POLY_LENS.processed).toBe(1);
    expect(body.results.YEALINK_YMCS.processed).toBe(1);
    expect(body.results.LOGITECH_SYNC.processed).toBe(1);
    expect(body.results.UTELOGY.processed).toBe(1);
    expect(mockProcessAlert).toHaveBeenCalledTimes(4);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "UTELOGY",
      expect.objectContaining({ lastPolledAt: expect.any(String) })
    );
  });

  it("records an adapter init failure without blocking other platforms", async () => {
    mockPoly.mockRejectedValue(new Error("poly creds missing"));
    mockYealink.mockResolvedValue(makeAdapter([]));
    mockLogi.mockResolvedValue(makeAdapter([]));
    mockUtelogy.mockResolvedValue(makeAdapter([]));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as {
      results: Record<string, { processed: number; errors: string[] }>;
    };

    expect(res.status).toBe(200);
    expect(body.results.POLY_LENS.errors[0]).toMatch(/poly creds missing/);
    expect(body.results.YEALINK_YMCS.processed).toBe(0);
    expect(body.results.LOGITECH_SYNC.errors).toEqual([]);
    expect(body.results.UTELOGY.errors).toEqual([]);
  });

  it("runs the auto-resolve sweep and reports the count", async () => {
    mockPoly.mockResolvedValue(makeAdapter([]));
    mockYealink.mockResolvedValue(makeAdapter([]));
    mockLogi.mockResolvedValue(makeAdapter([]));
    mockUtelogy.mockResolvedValue(makeAdapter([]));
    mockSweep.mockResolvedValue({ resolved: 4 });

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as { autoResolved: number };

    expect(body.autoResolved).toBe(4);
  });
});
```

- [ ] **Step 3.2: Run test to verify the new Utelogy test fails**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/api/cron-alerts.test.ts 2>&1 | tail -20
```

Expected: the "polls Poly, Yealink, Logitech, and Utelogy" test FAILS — UTELOGY key not in results.

- [ ] **Step 3.3: Update cron/alerts/route.ts**

Replace the full content of `src/app/api/cron/alerts/route.ts` with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { createLogiSyncAdapter } from "@/lib/integrations/logitech-sync";
import { createUtelogyAdapter } from "@/lib/integrations/utelogy";
import { PlatformAdapter } from "@/lib/integrations/types";
import { getConfig, updateConfig } from "@/lib/integrations/credentials";
import { processAlert, runAutoResolveSweep } from "@/lib/correlation";

interface PollResult {
  processed: number;
  errors: string[];
}

const POLLED_PLATFORMS: ReadonlyArray<{
  platform: Platform;
  createAdapter: () => Promise<PlatformAdapter>;
}> = [
  { platform: Platform.POLY_LENS, createAdapter: createPolyLensAdapter },
  { platform: Platform.YEALINK_YMCS, createAdapter: createYealinkAdapter },
  { platform: Platform.LOGITECH_SYNC, createAdapter: createLogiSyncAdapter },
  { platform: Platform.UTELOGY, createAdapter: createUtelogyAdapter },
];

async function pollPlatform(
  platform: Platform,
  createAdapter: () => Promise<PlatformAdapter>
): Promise<PollResult> {
  try {
    const config = await getConfig(platform);
    const since = config.lastPolledAt
      ? new Date(config.lastPolledAt as string)
      : new Date(Date.now() - 10 * 60_000);

    const adapter = await createAdapter();
    const alerts = await adapter.fetchRecentAlerts(since);

    let processed = 0;
    const errors: string[] = [];
    for (const alert of alerts) {
      try {
        await processAlert(alert);
        processed++;
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    await updateConfig(platform, { lastPolledAt: new Date().toISOString() });
    return { processed, errors };
  } catch (err) {
    return { processed: 0, errors: [(err as Error).message] };
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, PollResult> = {};

  for (const { platform, createAdapter } of POLLED_PLATFORMS) {
    results[platform] = await pollPlatform(platform, createAdapter);
  }

  let autoResolved = 0;
  try {
    const sweep = await runAutoResolveSweep();
    autoResolved = sweep.resolved;
  } catch {
    // Sweep failure should not fail the whole cron run
  }

  return NextResponse.json({ ok: true, results, autoResolved });
}
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/api/cron-alerts.test.ts 2>&1 | tail -20
```

Expected: all 4 tests PASS.

---

## Task 4: PUT validation for UTELOGY in integrations route

**Files:**
- Modify: `src/app/api/integrations/route.ts`
- Modify: `src/test/api/integrations.test.ts`

- [ ] **Step 4.1: Write failing tests — add to integrations.test.ts**

Append the following new describe block to the END of `src/test/api/integrations.test.ts` (after line 350):

```typescript

describe("PUT /api/integrations — UTELOGY config validation", () => {
  it("returns 400 when config.baseUrl is not a valid URL", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "UTELOGY",
        apiKey: "test-key",
        config: { baseUrl: "not-a-url" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/baseUrl/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 200 and persists config when baseUrl is valid", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce({
      config: {},
    } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "UTELOGY",
        apiKey: "test-api-key",
        config: { baseUrl: "https://acme.utelogy.com" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockUpsert.mock.calls[0][0] as {
      update: { apiKey?: string; config?: Record<string, unknown> };
    };
    expect(upsertCall.update.apiKey).toBe("test-api-key");
    expect(upsertCall.update.config).toMatchObject({ baseUrl: "https://acme.utelogy.com" });
  });

  it("preserves other config keys when updating UTELOGY config", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce({
      config: { baseUrl: "https://old.utelogy.com", lastPolledAt: "2026-06-01T00:00:00Z" },
    } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "UTELOGY",
        config: { baseUrl: "https://new.utelogy.com" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockUpsert.mock.calls[0][0] as {
      update: { config?: Record<string, unknown> };
    };
    // lastPolledAt preserved, baseUrl updated
    expect(upsertCall.update.config).toMatchObject({
      baseUrl: "https://new.utelogy.com",
      lastPolledAt: "2026-06-01T00:00:00Z",
    });
  });
});
```

- [ ] **Step 4.2: Run tests to verify the new tests fail**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/api/integrations.test.ts 2>&1 | tail -20
```

Expected: the 3 new UTELOGY tests FAIL (no validation branch exists yet).

- [ ] **Step 4.3: Update integrations route.ts to add UTELOGY branch**

In `src/app/api/integrations/route.ts`, replace the block starting at line 81:

```typescript
  const rotatingCreds = "clientId" in updateData || "clientSecret" in updateData;
  const isLogiConfigUpdate =
    platform === Platform.LOGITECH_SYNC && body.config !== undefined;

  if (rotatingCreds || isLogiConfigUpdate) {
```

with:

```typescript
  const rotatingCreds = "clientId" in updateData || "clientSecret" in updateData;
  const isLogiConfigUpdate =
    platform === Platform.LOGITECH_SYNC && body.config !== undefined;
  const isUtelogyConfigUpdate =
    platform === Platform.UTELOGY && body.config !== undefined;

  if (isUtelogyConfigUpdate) {
    const incomingBaseUrl = body.config?.baseUrl;
    if (incomingBaseUrl !== undefined) {
      try {
        new URL(String(incomingBaseUrl));
      } catch {
        return NextResponse.json(
          { error: "Utelogy config.baseUrl must be a valid http(s) URL" },
          { status: 400 },
        );
      }
    }
    // Merge with existing config to preserve keys like lastPolledAt
    const existing = await prisma.platformCredential.findUnique({
      where: { platform },
      select: { config: true },
    });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};
    updateData.config = { ...existingConfig, ...(body.config ?? {}) };
  }

  if (rotatingCreds || isLogiConfigUpdate) {
```

- [ ] **Step 4.4: Run tests to verify they pass**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/api/integrations.test.ts 2>&1 | tail -20
```

Expected: all tests in this file PASS (the original 16 + 3 new = 19 total).

---

## Task 5: Utelogy settings card in SettingsClient

**Files:**
- Modify: `src/app/(app)/settings/SettingsClient.tsx`
- Modify: `src/test/settings-client.test.tsx`

- [ ] **Step 5.1: Write failing tests — add to settings-client.test.tsx**

Append the following new describe block to the END of `src/test/settings-client.test.tsx` (after line 57):

```typescript

describe("SettingsClient — Utelogy card", () => {
  it("renders the Utelogy section with API Key and Instance Base URL fields", () => {
    render(<SettingsClient />);

    expect(screen.getByRole("heading", { name: "Utelogy" })).toBeInTheDocument();
    expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Instance Base URL/i)).toBeInTheDocument();
  });

  it("submits Utelogy credentials (apiKey + config.baseUrl) to /api/integrations", async () => {
    const user = userEvent.setup();
    render(<SettingsClient />);

    await user.type(screen.getByLabelText(/API Key/i), "my-utelogy-key");
    await user.type(
      screen.getByLabelText(/Instance Base URL/i),
      "https://acme.utelogy.com"
    );

    const utelogyCard = screen
      .getByRole("heading", { name: "Utelogy" })
      .closest("div") as HTMLElement;
    const saveButton = Array.from(utelogyCard.querySelectorAll("button")).find((b) =>
      /save/i.test(b.textContent ?? "")
    ) as HTMLButtonElement;
    await user.click(saveButton);

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/integrations",
      expect.objectContaining({ method: "PUT" })
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    ) as { platform: string; apiKey: string; config: Record<string, string> };
    expect(body.platform).toBe("UTELOGY");
    expect(body.apiKey).toBe("my-utelogy-key");
    expect(body.config).toMatchObject({ baseUrl: "https://acme.utelogy.com" });
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/settings-client.test.tsx 2>&1 | tail -20
```

Expected: the 2 new Utelogy tests FAIL — no "Utelogy" heading rendered.

- [ ] **Step 5.3: Add Utelogy to the PLATFORMS array in SettingsClient.tsx**

In `src/app/(app)/settings/SettingsClient.tsx`, locate the `] as const;` line that ends the PLATFORMS array (line 52) and insert the Utelogy entry before it. The new PLATFORMS array should be:

```typescript
const PLATFORMS = [
  {
    id: "POLY_LENS",
    label: "Poly Lens",
    credFields: [
      { key: "clientId", label: "Client ID", type: "text" as const },
      { key: "clientSecret", label: "Client Secret", type: "password" as const },
    ],
    configFields: [
      { key: "tenantId", label: "Tenant ID (from Admin Portal → Account Settings)", type: "text" as const },
    ],
  },
  {
    id: "YEALINK_YMCS",
    label: "Yealink YMCS",
    credFields: [
      { key: "clientId", label: "Client ID", type: "text" as const },
      { key: "clientSecret", label: "Client Secret", type: "password" as const },
      { key: "webhookSecret", label: "Webhook Verification Token (from YMCS event subscription)", type: "password" as const },
    ],
    configFields: [
      { key: "region", label: "Region (us / eu / au)", type: "text" as const },
    ],
  },
  {
    id: "LOGITECH_SYNC",
    label: "Logitech Sync",
    credFields: [],
    configFields: [
      { key: "orgId", label: "Org ID (from the Sync Portal)", type: "text" as const },
      {
        key: "apiServer",
        label: "API Server (optional — defaults to https://api.sync.logitech.com/v1)",
        type: "text" as const,
      },
      {
        key: "certPem",
        label: "Client Certificate (PEM — leave blank to keep the saved one)",
        type: "textarea" as const,
      },
      {
        key: "keyPem",
        label: "Private Key (PEM — write-only, leave blank to keep the saved one)",
        type: "textarea" as const,
      },
    ],
  },
  {
    id: "UTELOGY",
    label: "Utelogy",
    credFields: [
      { key: "apiKey", label: "API Key", type: "password" as const },
    ],
    configFields: [
      {
        key: "baseUrl",
        label: "Instance Base URL (https://<tenant>.utelogy.com)",
        type: "text" as const,
      },
    ],
  },
] as const;
```

- [ ] **Step 5.4: Run test to verify it passes**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run src/test/settings-client.test.tsx 2>&1 | tail -20
```

Expected: all 4 tests PASS.

---

## Task 6: Smoke-test script

**Files:**
- Create: `scripts/smoke-utelogy.ts`

- [ ] **Step 6.1: Create the smoke test script**

Create `scripts/smoke-utelogy.ts`:

```typescript
// Run with: npx tsx scripts/smoke-utelogy.ts
// Requires in .env.local:
//   UTELOGY_BASE_URL=https://<tenant>.utelogy.com
//   UTELOGY_API_KEY=<your-api-key>

import { config } from "dotenv";
config({ path: ".env.local" });

const BASE_URL = process.env.UTELOGY_BASE_URL ?? "";
const API_KEY = process.env.UTELOGY_API_KEY ?? "";

function buildHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${API_KEY}`,
    accept: "application/json",
    "content-type": "application/json",
  };
}

async function testDeviceList(): Promise<void> {
  // TODO(verify): confirm endpoint path against the Utelogy U-API docs / a live response.
  const res = await fetch(`${BASE_URL}/api/v1/devices`, {
    headers: buildHeaders(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Device list failed ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { devices?: unknown[] };
  const devices = json.devices ?? [];
  console.log(`✓ Device list: ${devices.length} device(s) returned`);
  if (devices.length > 0) {
    console.log("First device:", JSON.stringify(devices[0], null, 2));
    console.log(
      "\n⚠ Verify field names match fetchDevicesRaw() in utelogy.ts"
    );
    console.log(
      "  Expected fields: id, name, model, firmwareVersion, macAddress, connectionStatus (or status), lastSeen"
    );
  }
}

async function main(): Promise<void> {
  if (!BASE_URL || !API_KEY) {
    console.error(
      "Missing UTELOGY_BASE_URL or UTELOGY_API_KEY in .env.local"
    );
    process.exit(1);
  }

  console.log(`=== Utelogy Smoke Test (base: ${BASE_URL}) ===\n`);

  await testDeviceList();

  console.log("\n✓ Smoke test complete.");
  console.log(
    "  If field names differ, update fetchDevicesRaw() in utelogy.ts"
  );
}

main().catch((err: unknown) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
```

- [ ] **Step 6.2: Verify the script is gitignored**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
git check-ignore scripts/smoke-utelogy.ts && echo "IGNORED" || echo "NOT IGNORED"
```

Expected: `IGNORED` (the `.gitignore` already has `scripts/smoke-*.ts`).

---

## Task 7: Sidebar connected-dot audit

**Files:**
- Read only: `src/app/(app)/layout.tsx`

- [ ] **Step 7.1: Confirm the configuredPlatforms filter covers apiKey**

Read `src/app/(app)/layout.tsx` lines 34–39 and confirm the filter expression includes `c.apiKey`. Current code should be:

```typescript
const configuredPlatforms = configuredCreds
  .filter((c) => {
    const config = (c.config as Record<string, unknown>) ?? {};
    return Boolean(c.clientId || c.apiKey || c.webhookSecret || config.certPem || config.keyPem);
  })
  .map((c) => c.platform as string);
```

`c.apiKey` IS included in the filter — Utelogy uses `apiKey` as its scalar credential, so the connected-dot will light up automatically with no code change needed.

**No code changes required for this task.**

---

## Task 8: Full suite verification + TypeScript check

- [ ] **Step 8.1: Run the targeted test files**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run \
  src/test/integrations/utelogy.test.ts \
  src/test/sync.test.ts \
  src/test/api/cron-alerts.test.ts \
  src/test/api/integrations.test.ts \
  src/test/settings-client.test.tsx \
  2>&1 | tail -10
```

Expected: all 5 test files pass.

- [ ] **Step 8.2: Run the full test suite**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx vitest run 2>&1 | tail -10
```

Expected: 54 test files passed (was 49), all tests pass (was 319).

- [ ] **Step 8.3: TypeScript check**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc
npx tsc --noEmit 2>&1
```

Expected: no output (clean).

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|-------------|------|
| `createUtelogyAdapter` with `fetchDevicesRaw` marked TODO(verify) | Task 1 |
| Credentials: scalar `apiKey` + `config.baseUrl`, valid URL validation | Task 1 |
| HTTP: Bearer apiKey, non-2xx throws with status + body snippet ≤200 chars | Task 1 |
| `syncDevices`: normalization, status mapping, MAC lowercase, fallback name | Task 1 |
| `fetchRecentAlerts`: offline-only CRITICAL alerts, `offline-<id>` alertId | Task 1 |
| webhook no-ops, reboot throws with TODO(verify) | Task 1 |
| Register in sync.ts as 4th adapter, error msg "Utelogy adapter init failed:" | Task 2 |
| UTELOGY in POLLED_PLATFORMS, cron test updated | Task 3 |
| PUT: 400 for invalid baseUrl, 200 persists config, preserves other keys | Task 4 |
| Settings card: apiKey credField, baseUrl configField, test saves PUT | Task 5 |
| smoke-utelogy.ts modeled on smoke-yealink.ts | Task 6 |
| gitignore check (scripts/smoke-*.ts) | Task 6 |
| Sidebar connected-dot covers apiKey — confirmed yes, no change | Task 7 |
| Existing tests don't break (mock blocks extended) | Tasks 2, 3 |

**Placeholder scan:** None found. All code blocks are complete and exact.

**Type consistency:**
- `createUtelogyAdapter` returns `Promise<PlatformAdapter>` — consistent with logitech-sync.ts pattern.
- `Platform.UTELOGY` is used throughout (already in Prisma schema per spec).
- `fetchDevicesRaw(baseUrl: string, apiKey: string)` — parameter signature consistent between implementation and usage.
- Error message in sync.ts uses `"Utelogy adapter init failed:"` — tests check `e.includes('Utelogy')`.
