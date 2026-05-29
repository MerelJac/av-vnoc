# VNOC Phase 2: Integration Layer (Poly Lens + Yealink YMCS)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete integration layer: shared types, PlatformAdapter interface, Poly Lens adapter, Yealink YMCS adapter, HMAC-verified webhook routes, a full device-sync endpoint (admin-triggered), and a cron polling endpoint for missed alerts.

**Architecture:** Each adapter implements the `PlatformAdapter` interface. Credentials (clientId, clientSecret, apiKey, webhookSecret) are fetched from `PlatformCredential` in the database at runtime — not from env vars — so admins can rotate them via the UI. HMAC-SHA256 signatures are verified before any payload is processed. The correlation engine (Plan 04) is called synchronously after each validated event.

**Tech Stack:** Next.js 15 App Router, Prisma 7, Node.js `crypto` (built-in), zod

**Prerequisite:** Plan 01 (data model) must be complete — `PlatformCredential`, `Device`, `WebhookEvent` models must exist.

**API Shape Assumptions:**
- Poly Lens REST API base: `https://api.lens.poly.com` (verify against actual Poly Lens API docs before deploying)
- Yealink YMCS REST API base: `https://open.ymcs.yealink.com` (verify against actual Yealink API docs before deploying)
- Both use HMAC-SHA256 webhook signatures
- Both devices endpoint returns arrays; adapt field names to actual API responses

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/lib/integrations/types.ts` | NormalizedAlert, NormalizedDevice, PlatformAdapter interface |
| Create | `src/lib/integrations/credentials.ts` | Fetch PlatformCredential from DB |
| Create | `src/lib/integrations/poly-lens.ts` | Poly Lens adapter implementation |
| Create | `src/lib/integrations/yealink.ts` | Yealink YMCS adapter implementation |
| Create | `src/lib/integrations/sync.ts` | Device sync orchestrator (all platforms) |
| Create | `src/app/api/webhooks/poly-lens/route.ts` | POST — HMAC-verified Poly Lens events |
| Create | `src/app/api/webhooks/yealink/route.ts` | POST — HMAC-verified Yealink events |
| Create | `src/app/api/integrations/sync/route.ts` | POST — trigger full inventory sync (admin only) |
| Create | `src/app/api/cron/alerts/route.ts` | GET — poll both APIs for missed alerts |

---

### Task 1: Define shared integration types

**Files:**
- Create: `src/lib/integrations/types.ts`

- [ ] **Step 1: Write tests for type guards**

Create `src/test/integration-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isNormalizedAlert, isNormalizedDevice } from '@/lib/integrations/types'

describe('isNormalizedAlert', () => {
  it('returns true for a valid alert shape', () => {
    const alert = {
      platform: 'POLY_LENS' as const,
      platformAlertId: 'alert-123',
      platformDeviceId: 'device-456',
      severity: 'HIGH' as const,
      title: 'Device offline',
      rawPayload: {},
      receivedAt: new Date(),
    }
    expect(isNormalizedAlert(alert)).toBe(true)
  })

  it('returns false when required field is missing', () => {
    expect(isNormalizedAlert({ platform: 'POLY_LENS' })).toBe(false)
  })
})

describe('isNormalizedDevice', () => {
  it('returns true for a valid device shape', () => {
    const device = {
      platform: 'POLY_LENS' as const,
      platformId: 'device-1',
      name: 'Poly Studio X50',
      status: 'online' as const,
      rawPayload: {},
    }
    expect(isNormalizedDevice(device)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/integration-types.test.ts
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create src/lib/integrations/types.ts**

```typescript
import { Platform, AlertSeverity } from "@prisma/client";

export interface NormalizedAlert {
  platform: Platform;
  platformAlertId: string;
  platformDeviceId: string;
  severity: AlertSeverity;
  title: string;
  description?: string;
  rawPayload: unknown;
  receivedAt: Date;
}

export interface NormalizedDevice {
  platform: Platform;
  platformId: string;
  name: string;
  model?: string;
  firmware?: string;
  ipAddress?: string;
  macAddress?: string;
  status: "online" | "offline" | "unknown";
  lastSeenAt?: Date;
  rawPayload: unknown;
}

export interface PlatformAdapter {
  syncDevices(): Promise<NormalizedDevice[]>;
  fetchRecentAlerts(since: Date): Promise<NormalizedAlert[]>;
  normalizeWebhookPayload(raw: unknown): NormalizedAlert | null;
  verifyWebhookSignature(payload: string, sig: string): boolean;
  rebootDevice(platformId: string): Promise<void>;
}

export function isNormalizedAlert(value: unknown): value is NormalizedAlert {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.platform === "string" &&
    typeof v.platformAlertId === "string" &&
    typeof v.platformDeviceId === "string" &&
    typeof v.severity === "string" &&
    typeof v.title === "string" &&
    v.receivedAt instanceof Date
  );
}

export function isNormalizedDevice(value: unknown): value is NormalizedDevice {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.platform === "string" &&
    typeof v.platformId === "string" &&
    typeof v.name === "string" &&
    typeof v.status === "string"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/test/integration-types.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/types.ts src/test/integration-types.test.ts
git commit -m "feat: add integration types and PlatformAdapter interface"
```

---

### Task 2: Create PlatformCredential helper

**Files:**
- Create: `src/lib/integrations/credentials.ts`

- [ ] **Step 1: Write test for credential fetch**

Create `src/test/credentials.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    platformCredential: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
import { getCredential, getWebhookSecret } from '@/lib/integrations/credentials'

describe('getCredential', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the credential for a platform', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'cred-1',
      platform: 'POLY_LENS',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      apiKey: null,
      webhookSecret: 'wh-secret',
      config: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const cred = await getCredential('POLY_LENS')
    expect(cred?.clientId).toBe('client-id')
    expect(prisma.platformCredential.findUnique).toHaveBeenCalledWith({
      where: { platform: 'POLY_LENS' },
    })
  })

  it('returns null when credential not found', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue(null)
    const cred = await getCredential('POLY_LENS')
    expect(cred).toBeNull()
  })
})

describe('getWebhookSecret', () => {
  beforeEach(() => vi.clearAllMocks())

  it('throws when no credential configured', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue(null)
    await expect(getWebhookSecret('POLY_LENS')).rejects.toThrow(
      'POLY_LENS credentials not configured'
    )
  })

  it('throws when webhookSecret is null', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: null, config: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    await expect(getWebhookSecret('POLY_LENS')).rejects.toThrow(
      'POLY_LENS webhook secret not configured'
    )
  })

  it('returns the webhook secret when configured', async () => {
    vi.mocked(prisma.platformCredential.findUnique).mockResolvedValue({
      id: 'c1', platform: 'POLY_LENS', clientId: null, clientSecret: null,
      apiKey: null, webhookSecret: 'secret-xyz', config: null,
      createdAt: new Date(), updatedAt: new Date(),
    })
    const secret = await getWebhookSecret('POLY_LENS')
    expect(secret).toBe('secret-xyz')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/credentials.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create src/lib/integrations/credentials.ts**

```typescript
import { prisma } from "@/lib/prisma";
import { Platform, PlatformCredential } from "@prisma/client";

export async function getCredential(
  platform: Platform
): Promise<PlatformCredential | null> {
  return prisma.platformCredential.findUnique({ where: { platform } });
}

export async function getWebhookSecret(platform: Platform): Promise<string> {
  const cred = await getCredential(platform);
  if (!cred) throw new Error(`${platform} credentials not configured`);
  if (!cred.webhookSecret) throw new Error(`${platform} webhook secret not configured`);
  return cred.webhookSecret;
}

export async function getConfig(platform: Platform): Promise<Record<string, unknown>> {
  const cred = await getCredential(platform);
  return (cred?.config as Record<string, unknown>) ?? {};
}

export async function updateConfig(
  platform: Platform,
  patch: Record<string, unknown>
): Promise<void> {
  const existing = await getConfig(platform);
  await prisma.platformCredential.upsert({
    where: { platform },
    create: { platform, config: { ...existing, ...patch } },
    update: { config: { ...existing, ...patch } },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/test/credentials.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/credentials.ts src/test/credentials.test.ts
git commit -m "feat: add PlatformCredential helper (getCredential, getWebhookSecret)"
```

---

### Task 3: Implement Poly Lens adapter

**Files:**
- Create: `src/lib/integrations/poly-lens.ts`

**Note:** The Poly Lens API field names below are based on publicly documented API patterns. Verify against the official Poly Lens API reference (`https://api.lens.poly.com/docs`) and adjust field names if different.

- [ ] **Step 1: Write tests for Poly Lens adapter**

Create `src/test/poly-lens.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('@/lib/integrations/credentials', () => ({
  getCredential: vi.fn(),
  getWebhookSecret: vi.fn(),
}))

import { getCredential, getWebhookSecret } from '@/lib/integrations/credentials'
import { createPolyLensAdapter } from '@/lib/integrations/poly-lens'

const mockCred = {
  id: 'c1', platform: 'POLY_LENS' as const,
  clientId: 'cid', clientSecret: 'csecret',
  apiKey: null, webhookSecret: 'wh-secret',
  config: { accessToken: 'tok', tokenExpiresAt: Date.now() + 3600_000 },
  createdAt: new Date(), updatedAt: new Date(),
}

describe('Poly Lens adapter - normalizeWebhookPayload', () => {
  beforeEach(() => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    vi.mocked(getWebhookSecret).mockResolvedValue('wh-secret')
  })

  it('normalizes a device.status.changed offline event', async () => {
    const adapter = await createPolyLensAdapter()
    const raw = {
      eventType: 'device.status.changed',
      eventId: 'evt-001',
      device: {
        id: 'poly-device-1',
        displayName: 'Poly Studio X50',
        status: 'offline',
      },
      timestamp: '2026-05-27T10:00:00Z',
    }

    const result = adapter.normalizeWebhookPayload(raw)
    expect(result).not.toBeNull()
    expect(result?.platform).toBe('POLY_LENS')
    expect(result?.platformAlertId).toBe('evt-001')
    expect(result?.platformDeviceId).toBe('poly-device-1')
    expect(result?.severity).toBe('HIGH')
    expect(result?.title).toContain('offline')
  })

  it('returns null for non-alert events (device.config.changed)', async () => {
    const adapter = await createPolyLensAdapter()
    const raw = {
      eventType: 'device.config.changed',
      eventId: 'evt-002',
      device: { id: 'poly-device-1', displayName: 'X50', status: 'online' },
      timestamp: '2026-05-27T10:01:00Z',
    }
    expect(adapter.normalizeWebhookPayload(raw)).toBeNull()
  })
})

describe('Poly Lens adapter - verifyWebhookSignature', () => {
  it('returns true for a valid HMAC-SHA256 signature', async () => {
    vi.mocked(getWebhookSecret).mockResolvedValue('wh-secret')
    const adapter = await createPolyLensAdapter()

    const payload = JSON.stringify({ eventType: 'device.status.changed' })
    const sig = crypto.createHmac('sha256', 'wh-secret').update(payload).digest('hex')

    expect(adapter.verifyWebhookSignature(payload, sig)).toBe(true)
  })

  it('returns false for an invalid signature', async () => {
    vi.mocked(getWebhookSecret).mockResolvedValue('wh-secret')
    const adapter = await createPolyLensAdapter()

    expect(adapter.verifyWebhookSignature('payload', 'bad-sig')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/poly-lens.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create src/lib/integrations/poly-lens.ts**

```typescript
import crypto from "crypto";
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter } from "./types";
import { getCredential, getWebhookSecret, updateConfig } from "./credentials";

const API_BASE =
  process.env.POLY_LENS_API_BASE ?? "https://api.lens.poly.com";

// Maps Poly Lens device status to AlertSeverity
function statusToSeverity(status: string): AlertSeverity | null {
  switch (status.toLowerCase()) {
    case "offline":
      return "HIGH";
    case "critical":
      return "CRITICAL";
    case "warning":
      return "MEDIUM";
    default:
      return null;
  }
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Poly Lens auth failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

export async function createPolyLensAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential("POLY_LENS");
  const webhookSecret = cred?.webhookSecret ?? "";

  // Cached token logic — re-fetch when expired
  const config = (cred?.config as Record<string, unknown>) ?? {};
  let accessToken = config.accessToken as string | undefined;
  const tokenExpiresAt = (config.tokenExpiresAt as number | undefined) ?? 0;

  async function ensureToken(): Promise<string> {
    if (!accessToken || Date.now() >= tokenExpiresAt - 60_000) {
      if (!cred?.clientId || !cred?.clientSecret) {
        throw new Error("Poly Lens clientId/clientSecret not configured");
      }
      accessToken = await getAccessToken(cred.clientId, cred.clientSecret);
      await updateConfig("POLY_LENS", {
        accessToken,
        tokenExpiresAt: Date.now() + 3600_000,
      });
    }
    return accessToken!;
  }

  return {
    async syncDevices(): Promise<NormalizedDevice[]> {
      const token = await ensureToken();
      const res = await fetch(`${API_BASE}/v2/devices?limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Poly Lens syncDevices failed: ${res.status}`);
      const json = await res.json();

      // Adapt to NormalizedDevice — field names based on Poly Lens API docs
      return (json.devices ?? json.items ?? []).map((d: Record<string, unknown>) => ({
        platform: "POLY_LENS" as Platform,
        platformId: String(d.id),
        name: String(d.displayName ?? d.name ?? "Unknown"),
        model: d.model ? String(d.model) : undefined,
        firmware: d.firmwareVersion ? String(d.firmwareVersion) : undefined,
        ipAddress: d.ipAddress ? String(d.ipAddress) : undefined,
        macAddress: d.macAddress ? String(d.macAddress) : undefined,
        status: (d.status === "online" ? "online" : d.status === "offline" ? "offline" : "unknown") as
          "online" | "offline" | "unknown",
        lastSeenAt: d.lastSeenAt ? new Date(String(d.lastSeenAt)) : undefined,
        rawPayload: d,
      }));
    },

    async fetchRecentAlerts(since: Date): Promise<NormalizedAlert[]> {
      const token = await ensureToken();
      const res = await fetch(
        `${API_BASE}/v2/alerts?since=${since.toISOString()}&limit=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Poly Lens fetchRecentAlerts failed: ${res.status}`);
      const json = await res.json();

      return (json.alerts ?? json.items ?? [])
        .map((a: Record<string, unknown>) => {
          const severity = statusToSeverity(String(a.severity ?? a.status ?? ""));
          if (!severity) return null;
          return {
            platform: "POLY_LENS" as Platform,
            platformAlertId: String(a.id),
            platformDeviceId: String(a.deviceId ?? a.device?.id ?? ""),
            severity,
            title: String(a.title ?? a.message ?? "Alert"),
            description: a.description ? String(a.description) : undefined,
            rawPayload: a,
            receivedAt: new Date(String(a.createdAt ?? a.timestamp ?? new Date())),
          };
        })
        .filter(Boolean) as NormalizedAlert[];
    },

    normalizeWebhookPayload(raw: unknown): NormalizedAlert | null {
      if (typeof raw !== "object" || raw === null) return null;
      const payload = raw as Record<string, unknown>;

      const alertEvents = ["device.status.changed", "device.alert.created"];
      if (!alertEvents.includes(String(payload.eventType))) return null;

      const device = payload.device as Record<string, unknown> | undefined;
      if (!device) return null;

      const severity = statusToSeverity(String(device.status ?? ""));
      if (!severity) return null;

      return {
        platform: "POLY_LENS",
        platformAlertId: String(payload.eventId),
        platformDeviceId: String(device.id),
        severity,
        title: `Device ${device.status}: ${device.displayName ?? device.name ?? device.id}`,
        description: undefined,
        rawPayload: raw,
        receivedAt: new Date(String(payload.timestamp ?? new Date())),
      };
    },

    verifyWebhookSignature(payload: string, sig: string): boolean {
      if (!webhookSecret) return false;
      try {
        const expected = crypto
          .createHmac("sha256", webhookSecret)
          .update(payload)
          .digest("hex");
        return crypto.timingSafeEqual(
          Buffer.from(sig, "hex"),
          Buffer.from(expected, "hex")
        );
      } catch {
        return false;
      }
    },

    async rebootDevice(platformId: string): Promise<void> {
      const token = await ensureToken();
      const res = await fetch(`${API_BASE}/v2/devices/${platformId}/reboot`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Poly Lens reboot failed: ${res.status}`);
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/test/poly-lens.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/poly-lens.ts src/test/poly-lens.test.ts
git commit -m "feat: add Poly Lens adapter (sync, alerts, webhook verify, reboot)"
```

---

### Task 4: Implement Yealink YMCS adapter

**Files:**
- Create: `src/lib/integrations/yealink.ts`

**Note:** Yealink YMCS API uses API key auth via `X-Api-Key` header. Field names are assumed based on Yealink developer portal patterns — verify against official Yealink YMCS API docs before deploying.

- [ ] **Step 1: Write tests**

Create `src/test/yealink.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('@/lib/integrations/credentials', () => ({
  getCredential: vi.fn(),
  getWebhookSecret: vi.fn(),
}))

import { getCredential, getWebhookSecret } from '@/lib/integrations/credentials'
import { createYealinkAdapter } from '@/lib/integrations/yealink'

const mockCred = {
  id: 'c2', platform: 'YEALINK_YMCS' as const,
  clientId: null, clientSecret: null,
  apiKey: 'yk-api-key', webhookSecret: 'yk-wh-secret',
  config: null, createdAt: new Date(), updatedAt: new Date(),
}

describe('Yealink adapter - normalizeWebhookPayload', () => {
  beforeEach(() => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    vi.mocked(getWebhookSecret).mockResolvedValue('yk-wh-secret')
  })

  it('normalizes a device offline event', async () => {
    const adapter = await createYealinkAdapter()
    const raw = {
      eventId: 'yk-evt-001',
      eventType: 'device.offline',
      device: { deviceId: 'yk-device-1', deviceName: 'Yealink CP960', status: 'offline' },
      occurredAt: '2026-05-27T10:00:00Z',
    }

    const result = adapter.normalizeWebhookPayload(raw)
    expect(result).not.toBeNull()
    expect(result?.platform).toBe('YEALINK_YMCS')
    expect(result?.platformAlertId).toBe('yk-evt-001')
    expect(result?.platformDeviceId).toBe('yk-device-1')
    expect(result?.severity).toBe('HIGH')
  })

  it('returns null for non-alert events', async () => {
    const adapter = await createYealinkAdapter()
    const raw = {
      eventId: 'yk-evt-002',
      eventType: 'device.registered',
      device: { deviceId: 'yk-device-1', status: 'online' },
      occurredAt: '2026-05-27T10:01:00Z',
    }
    expect(adapter.normalizeWebhookPayload(raw)).toBeNull()
  })
})

describe('Yealink adapter - verifyWebhookSignature', () => {
  it('returns true for valid signature', async () => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    const adapter = await createYealinkAdapter()

    const payload = JSON.stringify({ eventType: 'device.offline' })
    const sig = crypto.createHmac('sha256', 'yk-wh-secret').update(payload).digest('hex')

    expect(adapter.verifyWebhookSignature(payload, sig)).toBe(true)
  })

  it('returns false for invalid signature', async () => {
    vi.mocked(getCredential).mockResolvedValue(mockCred)
    const adapter = await createYealinkAdapter()
    expect(adapter.verifyWebhookSignature('payload', 'bad')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/yealink.test.ts
```

- [ ] **Step 3: Create src/lib/integrations/yealink.ts**

```typescript
import crypto from "crypto";
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter } from "./types";
import { getCredential } from "./credentials";

const API_BASE =
  process.env.YEALINK_API_BASE ?? "https://open.ymcs.yealink.com";

const ALERT_EVENT_TYPES = new Set([
  "device.offline",
  "device.critical",
  "device.warning",
  "device.fault",
]);

function yealinkEventToSeverity(eventType: string): AlertSeverity | null {
  if (eventType === "device.offline") return "HIGH";
  if (eventType === "device.critical") return "CRITICAL";
  if (eventType === "device.warning") return "MEDIUM";
  if (eventType === "device.fault") return "MEDIUM";
  return null;
}

export async function createYealinkAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential("YEALINK_YMCS");
  const apiKey = cred?.apiKey ?? "";
  const webhookSecret = cred?.webhookSecret ?? "";

  const authHeaders = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };

  return {
    async syncDevices(): Promise<NormalizedDevice[]> {
      if (!apiKey) throw new Error("Yealink YMCS apiKey not configured");
      const res = await fetch(`${API_BASE}/v1/devices?pageSize=500`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`Yealink syncDevices failed: ${res.status}`);
      const json = await res.json();

      return (json.devices ?? json.data ?? []).map((d: Record<string, unknown>) => ({
        platform: "YEALINK_YMCS" as Platform,
        platformId: String(d.deviceId ?? d.id),
        name: String(d.deviceName ?? d.name ?? "Unknown"),
        model: d.model ? String(d.model) : undefined,
        firmware: d.firmwareVersion ? String(d.firmwareVersion) : undefined,
        ipAddress: d.ipAddress ? String(d.ipAddress) : undefined,
        macAddress: d.macAddress ? String(d.macAddress) : undefined,
        status: (d.status === "online"
          ? "online"
          : d.status === "offline"
          ? "offline"
          : "unknown") as "online" | "offline" | "unknown",
        lastSeenAt: d.lastSeen ? new Date(String(d.lastSeen)) : undefined,
        rawPayload: d,
      }));
    },

    async fetchRecentAlerts(since: Date): Promise<NormalizedAlert[]> {
      if (!apiKey) throw new Error("Yealink YMCS apiKey not configured");
      const res = await fetch(
        `${API_BASE}/v1/events?startTime=${since.getTime()}&eventTypes=device.offline,device.critical,device.warning,device.fault&pageSize=200`,
        { headers: authHeaders }
      );
      if (!res.ok) throw new Error(`Yealink fetchRecentAlerts failed: ${res.status}`);
      const json = await res.json();

      return (json.events ?? json.data ?? [])
        .map((e: Record<string, unknown>) => {
          const severity = yealinkEventToSeverity(String(e.eventType ?? ""));
          if (!severity) return null;
          const device = (e.device ?? {}) as Record<string, unknown>;
          return {
            platform: "YEALINK_YMCS" as Platform,
            platformAlertId: String(e.eventId ?? e.id),
            platformDeviceId: String(device.deviceId ?? device.id ?? ""),
            severity,
            title: String(e.message ?? `${e.eventType}: ${device.deviceName ?? device.id}`),
            description: e.detail ? String(e.detail) : undefined,
            rawPayload: e,
            receivedAt: new Date(String(e.occurredAt ?? e.timestamp ?? new Date())),
          };
        })
        .filter(Boolean) as NormalizedAlert[];
    },

    normalizeWebhookPayload(raw: unknown): NormalizedAlert | null {
      if (typeof raw !== "object" || raw === null) return null;
      const payload = raw as Record<string, unknown>;

      const eventType = String(payload.eventType ?? "");
      if (!ALERT_EVENT_TYPES.has(eventType)) return null;

      const device = (payload.device ?? {}) as Record<string, unknown>;
      const severity = yealinkEventToSeverity(eventType);
      if (!severity) return null;

      return {
        platform: "YEALINK_YMCS",
        platformAlertId: String(payload.eventId),
        platformDeviceId: String(device.deviceId ?? device.id ?? ""),
        severity,
        title: `${eventType}: ${device.deviceName ?? device.deviceId ?? "Unknown device"}`,
        description: undefined,
        rawPayload: raw,
        receivedAt: new Date(String(payload.occurredAt ?? payload.timestamp ?? new Date())),
      };
    },

    verifyWebhookSignature(payload: string, sig: string): boolean {
      if (!webhookSecret) return false;
      try {
        const expected = crypto
          .createHmac("sha256", webhookSecret)
          .update(payload)
          .digest("hex");
        return crypto.timingSafeEqual(
          Buffer.from(sig, "hex"),
          Buffer.from(expected, "hex")
        );
      } catch {
        return false;
      }
    },

    async rebootDevice(platformId: string): Promise<void> {
      if (!apiKey) throw new Error("Yealink YMCS apiKey not configured");
      const res = await fetch(`${API_BASE}/v1/devices/${platformId}/reboot`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`Yealink reboot failed: ${res.status}`);
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:run -- src/test/yealink.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/yealink.ts src/test/yealink.test.ts
git commit -m "feat: add Yealink YMCS adapter (sync, alerts, webhook verify, reboot)"
```

---

### Task 5: Create device sync orchestrator

**Files:**
- Create: `src/lib/integrations/sync.ts`

- [ ] **Step 1: Write test for device upsert**

Create `src/test/sync.test.ts`:

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

import { prisma } from '@/lib/prisma'
import { createPolyLensAdapter } from '@/lib/integrations/poly-lens'
import { createYealinkAdapter } from '@/lib/integrations/yealink'
import { syncAllDevices } from '@/lib/integrations/sync'

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

    vi.mocked(prisma.device.upsert).mockResolvedValue({} as any)

    await syncAllDevices()

    expect(prisma.device.upsert).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/sync.test.ts
```

- [ ] **Step 3: Create src/lib/integrations/sync.ts**

```typescript
import { prisma } from "@/lib/prisma";
import { NormalizedDevice } from "./types";
import { createPolyLensAdapter } from "./poly-lens";
import { createYealinkAdapter } from "./yealink";

async function upsertDevice(device: NormalizedDevice): Promise<void> {
  await prisma.device.upsert({
    where: {
      platform_platformId: {
        platform: device.platform,
        platformId: device.platformId,
      },
    },
    create: {
      platform: device.platform,
      platformId: device.platformId,
      name: device.name,
      model: device.model ?? null,
      firmware: device.firmware ?? null,
      ipAddress: device.ipAddress ?? null,
      macAddress: device.macAddress ?? null,
      status: device.status,
      lastSeenAt: device.lastSeenAt ?? null,
      rawPayload: device.rawPayload as object,
    },
    update: {
      name: device.name,
      model: device.model ?? null,
      firmware: device.firmware ?? null,
      ipAddress: device.ipAddress ?? null,
      macAddress: device.macAddress ?? null,
      status: device.status,
      lastSeenAt: device.lastSeenAt ?? null,
      rawPayload: device.rawPayload as object,
    },
  });
}

export async function syncAllDevices(): Promise<{ synced: number; errors: string[] }> {
  const errors: string[] = [];
  let synced = 0;

  const adapters = await Promise.allSettled([
    createPolyLensAdapter().then((a) => ({ name: "POLY_LENS", adapter: a })),
    createYealinkAdapter().then((a) => ({ name: "YEALINK_YMCS", adapter: a })),
  ]);

  for (const result of adapters) {
    if (result.status === "rejected") {
      errors.push(`Adapter init failed: ${result.reason}`);
      continue;
    }

    const { name, adapter } = result.value;
    try {
      const devices = await adapter.syncDevices();
      await Promise.all(devices.map(upsertDevice));
      synced += devices.length;
    } catch (err) {
      errors.push(`${name} sync failed: ${(err as Error).message}`);
    }
  }

  return { synced, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/test/sync.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/sync.ts src/test/sync.test.ts
git commit -m "feat: add device sync orchestrator (upserts devices from all adapters)"
```

---

### Task 6: Create Poly Lens webhook route

**Files:**
- Create: `src/app/api/webhooks/poly-lens/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { getWebhookSecret } from "@/lib/integrations/credentials";

export async function POST(req: NextRequest) {
  // Preserve raw body for signature verification
  const rawBody = await req.text();

  // Verify HMAC-SHA256 signature
  const sig = req.headers.get("x-poly-signature") ?? "";
  let adapter;
  try {
    adapter = await createPolyLensAdapter();
  } catch (err) {
    return NextResponse.json({ error: "Adapter unavailable" }, { status: 503 });
  }

  if (!adapter.verifyWebhookSignature(rawBody, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payloadObj = payload as Record<string, unknown>;
  const eventId = String(payloadObj.eventId ?? "");

  // Dedup at webhook level
  const existing = await prisma.webhookEvent.findUnique({
    where: { platform_eventId: { platform: "POLY_LENS", eventId } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Persist raw event
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      platform: "POLY_LENS",
      eventId,
      payload: payload as object,
    },
  });

  // Normalize and process
  const normalized = adapter.normalizeWebhookPayload(payload);
  if (!normalized) {
    // Non-alert event — mark processed and return
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    // Import correlation engine lazily to avoid circular deps
    const { processAlert } = await import("@/lib/correlation");
    await processAlert(normalized);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { error: (err as Error).message },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Note: `@/lib/correlation` does not exist yet (Plan 04). The import is dynamic/lazy — TypeScript may warn. Add `// @ts-expect-error -- implemented in Plan 04` temporarily if needed.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/poly-lens/route.ts
git commit -m "feat: add Poly Lens webhook route (HMAC-verified)"
```

---

### Task 7: Create Yealink webhook route

**Files:**
- Create: `src/app/api/webhooks/yealink/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createYealinkAdapter } from "@/lib/integrations/yealink";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("x-yealink-signature") ?? "";

  let adapter;
  try {
    adapter = await createYealinkAdapter();
  } catch {
    return NextResponse.json({ error: "Adapter unavailable" }, { status: 503 });
  }

  if (!adapter.verifyWebhookSignature(rawBody, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payloadObj = payload as Record<string, unknown>;
  const eventId = String(payloadObj.eventId ?? "");

  const existing = await prisma.webhookEvent.findUnique({
    where: { platform_eventId: { platform: "YEALINK_YMCS", eventId } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      platform: "YEALINK_YMCS",
      eventId,
      payload: payload as object,
    },
  });

  const normalized = adapter.normalizeWebhookPayload(payload);
  if (!normalized) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const { processAlert } = await import("@/lib/correlation");
    await processAlert(normalized);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { error: (err as Error).message },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/yealink/route.ts
git commit -m "feat: add Yealink webhook route (HMAC-verified)"
```

---

### Task 8: Create full-sync admin endpoint

**Files:**
- Create: `src/app/api/integrations/sync/route.ts`

- [ ] **Step 1: Create the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { syncAllDevices } from "@/lib/integrations/sync";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncAllDevices();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/integrations/sync/route.ts
git commit -m "feat: add full device-sync admin endpoint (POST /api/integrations/sync)"
```

---

### Task 9: Create cron polling endpoint

**Files:**
- Create: `src/app/api/cron/alerts/route.ts`

- [ ] **Step 1: Create the cron route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { getConfig, updateConfig } from "@/lib/integrations/credentials";
import { processAlert } from "@/lib/correlation";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, { processed: number; errors: string[] }> = {};

  // Poll Poly Lens
  try {
    const config = await getConfig("POLY_LENS");
    const since = config.lastPolledAt
      ? new Date(config.lastPolledAt as string)
      : new Date(Date.now() - 10 * 60_000); // default: last 10 minutes

    const adapter = await createPolyLensAdapter();
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

    await updateConfig("POLY_LENS", { lastPolledAt: new Date().toISOString() });
    results["POLY_LENS"] = { processed, errors };
  } catch (err) {
    results["POLY_LENS"] = { processed: 0, errors: [(err as Error).message] };
  }

  // Poll Yealink YMCS
  try {
    const config = await getConfig("YEALINK_YMCS");
    const since = config.lastPolledAt
      ? new Date(config.lastPolledAt as string)
      : new Date(Date.now() - 10 * 60_000);

    const adapter = await createYealinkAdapter();
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

    await updateConfig("YEALINK_YMCS", { lastPolledAt: new Date().toISOString() });
    results["YEALINK_YMCS"] = { processed, errors };
  } catch (err) {
    results["YEALINK_YMCS"] = { processed: 0, errors: [(err as Error).message] };
  }

  return NextResponse.json({ ok: true, results });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/cron/alerts/route.ts
git commit -m "feat: add cron polling endpoint for missed alerts (GET /api/cron/alerts)"
```

---

## Completion Check

After all tasks:

- [ ] `npm run test:run` — all tests pass
- [ ] `npx tsc --noEmit` — no TypeScript errors (except the temporary Plan 04 placeholder)
- [ ] `curl -X POST http://localhost:3000/api/integrations/sync` with a superAdmin session — returns `{ ok: true, synced: 0, errors: [] }` (no credentials configured yet)
- [ ] `curl -X POST http://localhost:3000/api/webhooks/poly-lens` without a signature — returns `401 Invalid signature`

**Next plan:** `2026-05-27-vnoc-04-correlation-engine.md` — dedup, flap suppression, pattern grouping, ticket auto-creation.
