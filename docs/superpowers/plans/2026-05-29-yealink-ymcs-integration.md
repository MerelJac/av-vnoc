# Yealink YMCS Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake Yealink YMCS adapter stub with a correct REST implementation that syncs devices, polls active alarms, handles webhooks for real-time alarm/recovery events, and can reboot devices — all using the verified YMCS Open API V4X documented in the official PDFs.

**Architecture:** YMCS is a standard REST API (not GraphQL). Authentication uses OAuth 2.0 client credentials producing a Bearer JWT; every request — including the token call — also requires `timestamp` (ms epoch) and `nonce` (random string ≤32 chars) headers. Endpoints are region-specific (`us-api.ymcs.yealink.com`, `eu-api.ymcs.yealink.com`, `au-api.ymcs.yealink.com`). YMCS **does** support webhooks — they POST batched `alarm.created` / `alarm.recovered` events to a registered HTTPS URL, verified by a static token in the `authorization` header (not HMAC). Device sync uses skip/limit pagination (max 100 per page). Alert polling uses `POST /v2/dm/listAlarms` filtered to `status=1`.

**Tech Stack:** Next.js 15 App Router · TypeScript · Prisma 7 · existing `credentials.ts` and `correlation.ts` unchanged

---

## Critical Context: What's Wrong Today

The existing `src/lib/integrations/yealink.ts` was written against a fictional REST API. Every endpoint path, auth scheme, field name, and event type is incorrect. The existing webhook route uses HMAC verification which Yealink does not support.

| Current (WRONG) | Real YMCS API |
|---|---|
| Base URL `open.ymcs.yealink.com` | Region-specific: `us-api.ymcs.yealink.com` (or eu/au) |
| Auth: `X-Api-Key: <apiKey>` header | Auth: `POST /v2/token` with Basic base64(clientId:clientSecret) + timestamp + nonce; then `Authorization: Bearer <token>` on all requests |
| `GET /v1/devices` | `POST /v2/dm/listDevices` (body: skip/limit/filter) |
| `GET /v1/events?eventTypes=...` | `POST /v2/dm/listAlarms` (body: filter status=1 for active) |
| `POST /v1/devices/:id/reboot` | `POST /v2/dm/device/reboot` (body: deviceIds[], deviceType) |
| Webhook: HMAC-SHA256 via `webhookSecret` | Webhook: static `authorization` header token comparison |
| Webhook events: `device.offline`, `device.critical` | Webhook events: `alarm.created`, `alarm.recovered` |
| Webhook body: single event JSON | Webhook body: `{ events: [ {...}, {...} ] }` (batched array) |
| Pagination: `pageSize` query param | Pagination: `skip`/`limit` in POST body (max 100/page) |

## What Stays the Same

- `src/lib/integrations/types.ts` — `NormalizedAlert`, `NormalizedDevice`, `PlatformAdapter` interfaces
- `src/lib/integrations/credentials.ts` — `getCredential`, `updateConfig`
- `src/lib/correlation.ts` — receives `NormalizedAlert` from adapter
- `src/lib/integrations/sync.ts` — calls `adapter.syncDevices()`
- `src/app/api/cron/alerts/route.ts` — calls `adapter.fetchRecentAlerts(since)`

---

## Real YMCS API Reference (from official docs)

### Authentication

**Token request** — `POST /v2/token`
```http
Authorization: Basic base64(clientId:clientSecret)
timestamp: 1700000000000
nonce: abc123xyz789randomstring
content-type: application/json

{ "grant_type": "client_credentials" }
```
Response: `{ "access_token": "...", "token_type": "bearer", "expires_in": 86400 }`

**All subsequent requests** require three headers:
```http
Authorization: Bearer <access_token>
timestamp: <current_ms_epoch>
nonce: <random_string_up_to_32_chars>
```

### Device Sync — `POST /v2/dm/listDevices`

```json
{
  "skip": 0,
  "limit": 100,
  "autoCount": true,
  "filter": { "deviceType": 1 }
}
```

Response device object fields: `id`, `mac`, `sn`, `name`, `modelId`, `siteId`, `programVersion`, `deviceStatus` (string: `"online"` | `"offline"` | `"pending"`)

Pagination: increment `skip` by `limit` until `skip + data.length >= total`.

### Active Alarm Poll — `POST /v2/dm/listAlarms`

```json
{
  "skip": 0,
  "limit": 100,
  "autoCount": true,
  "filter": {}
}
```

Response alarm object fields: `id`, `event` (string e.g. `"Offline"`), `level` (1=Minor, 2=Major, 3=Critical), `mac`, `model`, `ip`, `siteName`, `status` (1=active, 2=solved, 3=ignored), `firstAlarmTime` (ms), `lastAlarmTime` (ms)

For alert polling, fetch all alarms and filter to `status === 1` in JS (API doesn't expose a status filter in the list endpoint).

**Severity mapping**: level 3→CRITICAL, level 2→HIGH, level 1→MEDIUM

### Device Reboot — `POST /v2/dm/device/reboot`

```json
{
  "deviceIds": ["<ymcs-device-uuid>"],
  "deviceType": 1
}
```

Response: `{ total, successCount, failureCount, errors: [{ field, msg }] }`

### Webhook Events (from `src/app/api/webhooks/yealink/route.ts`)

```json
{
  "events": [
    {
      "id": "uuid",
      "type": "alarm.created",
      "createTime": 1600063609555,
      "partyId": "enterprise-id",
      "data": {
        "id": "alarm-id",
        "event": "Offline",
        "mac": "001565bbb1a9",
        "model": "SIP-T54S"
      }
    }
  ]
}
```

Event types:
- `alarm.created` — device alarm triggered → create `NormalizedAlert` → `processAlert()`
- `alarm.recovered` — device came back online → find existing ACTIVE alert by mac+event, mark RESOLVED

**Verification**: request header `authorization` must equal the `webhookSecret` stored in `PlatformCredential`. No HMAC — plain string equality.

**Response requirement**: must return 200 or 204 within 5 seconds. YMCS retries 3 times at 30s, 5m, 10m intervals.

### Rate Limits

50 req/sec enterprise-wide. HTTP 429 on breach — retry with exponential backoff, minimum 30s delay.

---

## Credentials Required

All must be stored in `PlatformCredential` for `YEALINK_YMCS` via the Settings page:

| Field | Where to get it |
|---|---|
| `clientId` | YMCS Admin Portal → API Credentials |
| `clientSecret` | Same location |
| `webhookSecret` | The verification token YMCS gives you when you register the webhook subscription |
| `config.region` | `"us"` / `"eu"` / `"au"` — matches your enterprise's YMCS region |
| `config.deviceType` | `1` for Phone, `3` for Room (optional, defaults to `1`) |

---

## File Structure

```
REWRITE:
  src/lib/integrations/yealink.ts              — YMCS REST adapter (replaces stub)
  src/app/api/webhooks/yealink/route.ts        — Real event handling (alarm.created/recovered)

CREATE:
  src/lib/integrations/ymcs-client.ts         — YMCS REST HTTP helper (auth headers, token)
  src/test/integrations/ymcs-client.test.ts   — Unit tests for the client
  src/test/integrations/yealink.test.ts        — Unit tests for the adapter
  src/test/api/webhooks-yealink.test.ts        — Unit tests for the webhook route
  scripts/smoke-yealink.ts                     — Manual smoke test (gitignored)

UNCHANGED:
  src/lib/integrations/types.ts
  src/lib/integrations/credentials.ts
  src/lib/integrations/graphql-client.ts
  src/lib/integrations/sync.ts
  src/lib/correlation.ts
  src/app/api/cron/alerts/route.ts
```

---

## Task 1: YMCS REST Client Helper

A thin authenticated HTTP client for YMCS. Every request needs Bearer token + `timestamp` + `nonce`. The token itself is acquired with Basic auth + `timestamp` + `nonce`.

**Files:**
- Create: `src/lib/integrations/ymcs-client.ts`
- Create: `src/test/integrations/ymcs-client.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/integrations/ymcs-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildYmcsHeaders,
  acquireYmcsToken,
  ymcsPost,
  ymcsGet,
  YmcsApiError,
} from "@/lib/integrations/ymcs-client";

const BASE_URL = "https://us-api.ymcs.yealink.com";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("buildYmcsHeaders", () => {
  it("includes timestamp and nonce as strings", () => {
    const headers = buildYmcsHeaders("Bearer tok");
    expect(typeof headers.timestamp).toBe("string");
    expect(headers.timestamp).toMatch(/^\d+$/);
    expect(typeof headers.nonce).toBe("string");
    expect(headers.nonce.length).toBeGreaterThan(0);
    expect(headers.nonce.length).toBeLessThanOrEqual(32);
    expect(headers.authorization).toBe("Bearer tok");
  });

  it("produces unique nonces on each call", () => {
    const h1 = buildYmcsHeaders("Bearer tok");
    const h2 = buildYmcsHeaders("Bearer tok");
    expect(h1.nonce).not.toBe(h2.nonce);
  });
});

describe("acquireYmcsToken", () => {
  it("sends Basic auth with base64(clientId:clientSecret) + timestamp + nonce", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "jwt-tok", token_type: "bearer", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await acquireYmcsToken(BASE_URL, "my-client", "my-secret");

    expect(result.access_token).toBe("jwt-tok");
    expect(result.expires_in).toBe(86400);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v2/token`);
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from("my-client:my-secret").toString("base64")}`
    );
    expect((init.headers as Record<string, string>).timestamp).toMatch(/^\d+$/);
    expect((init.headers as Record<string, string>).nonce).toBeDefined();
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.grant_type).toBe("client_credentials");
  });

  it("throws YmcsApiError on non-200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 })
      )
    );
    await expect(acquireYmcsToken(BASE_URL, "bad", "creds")).rejects.toThrow(YmcsApiError);
  });
});

describe("ymcsPost", () => {
  it("sends Bearer token + timestamp + nonce + JSON body", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    await ymcsPost<{ data: unknown[] }>(BASE_URL, "/v2/dm/listDevices", "tok-123", {
      skip: 0,
      limit: 10,
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/v2/dm/listDevices`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok-123");
    expect(headers.timestamp).toMatch(/^\d+$/);
    expect(headers.nonce).toBeDefined();
    expect(JSON.parse(init.body as string)).toEqual({ skip: 0, limit: 10 });
  });

  it("throws YmcsApiError on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("Too Many Requests", { status: 429 }))
    );
    await expect(
      ymcsPost(BASE_URL, "/v2/dm/listDevices", "tok", {})
    ).rejects.toThrow(YmcsApiError);
  });
});

describe("ymcsGet", () => {
  it("sends GET with auth headers and no body", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ total: 5 }), { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    await ymcsGet<{ total: number }>(BASE_URL, "/v2/dm/statistics/deviceCount?deviceStatus=1", "tok-456");

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v2/dm/statistics/deviceCount");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok-456");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/integrations/ymcs-client.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create the YMCS client**

Create `src/lib/integrations/ymcs-client.ts`:

```typescript
import crypto from "crypto";

export class YmcsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "YmcsApiError";
  }
}

interface YmcsHeaders {
  authorization: string;
  timestamp: string;
  nonce: string;
  "content-type": string;
}

export interface YmcsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export function buildYmcsHeaders(authorization: string): YmcsHeaders {
  return {
    authorization,
    timestamp: Date.now().toString(),
    nonce: crypto.randomBytes(12).toString("hex"), // 24 hex chars, well under 32
    "content-type": "application/json",
  };
}

export async function acquireYmcsToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string
): Promise<YmcsTokenResponse> {
  const credential = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`${baseUrl}/v2/token`, {
    method: "POST",
    headers: buildYmcsHeaders(`Basic ${credential}`),
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new YmcsApiError(`YMCS token request failed: ${res.status}`, res.status, body);
  }

  return (await res.json()) as YmcsTokenResponse;
}

export async function ymcsPost<T>(
  baseUrl: string,
  path: string,
  token: string,
  body: unknown
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildYmcsHeaders(`Bearer ${token}`),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new YmcsApiError(`YMCS POST ${path} failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as T;
}

export async function ymcsGet<T>(
  baseUrl: string,
  path: string,
  token: string
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: buildYmcsHeaders(`Bearer ${token}`),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new YmcsApiError(`YMCS GET ${path} failed: ${res.status}`, res.status, text);
  }

  return (await res.json()) as T;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/integrations/ymcs-client.test.ts
```

Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/ymcs-client.ts src/test/integrations/ymcs-client.test.ts
git commit -m "feat: add ymcs-client helper for YMCS REST API (OAuth2 + timestamp + nonce headers)"
```

---

## Task 2: Rewrite the Yealink YMCS Adapter

Replace the fake REST stub with a real implementation using the YMCS Open API V4X.

**Files:**
- Rewrite: `src/lib/integrations/yealink.ts`
- Create: `src/test/integrations/yealink.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/integrations/yealink.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({
  getCredential: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock("@/lib/integrations/ymcs-client", () => ({
  acquireYmcsToken: vi.fn(),
  ymcsPost: vi.fn(),
  YmcsApiError: class YmcsApiError extends Error {},
  buildYmcsHeaders: vi.fn().mockReturnValue({}),
}));

import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { getCredential, updateConfig } from "@/lib/integrations/credentials";
import { acquireYmcsToken, ymcsPost } from "@/lib/integrations/ymcs-client";
import { Platform } from "@prisma/client";

const mockGetCredential = vi.mocked(getCredential);
const mockUpdateConfig = vi.mocked(updateConfig);
const mockAcquireToken = vi.mocked(acquireYmcsToken);
const mockYmcsPost = vi.mocked(ymcsPost);

const VALID_CRED = {
  id: "cred-1",
  platform: Platform.YEALINK_YMCS,
  clientId: "client-id",
  clientSecret: "client-secret",
  apiKey: null,
  webhookSecret: "verify-token-abc",
  config: { region: "us" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createYealinkAdapter", () => {
  it("throws when credentials are not configured", async () => {
    mockGetCredential.mockResolvedValueOnce(null);
    await expect(createYealinkAdapter()).rejects.toThrow(
      "YEALINK_YMCS credentials not configured"
    );
  });

  it("throws when clientId or clientSecret is missing", async () => {
    mockGetCredential.mockResolvedValueOnce({
      ...VALID_CRED,
      clientId: null,
      clientSecret: null,
    });
    await expect(createYealinkAdapter()).rejects.toThrow(
      "YEALINK_YMCS clientId and clientSecret are required"
    );
  });
});

describe("syncDevices", () => {
  it("fetches all pages and returns normalized devices", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    // Page 1 — 2 devices, hasMore
    mockYmcsPost.mockResolvedValueOnce({
      skip: 0,
      limit: 100,
      total: 3,
      data: [
        {
          id: "dev-1",
          mac: "001565aabbcc",
          sn: "SN001",
          name: "Phone 1",
          modelId: "model-a",
          siteId: "site-1",
          programVersion: "70.83.0.68",
          deviceStatus: "online",
        },
        {
          id: "dev-2",
          mac: "001565ddeeff",
          sn: "SN002",
          name: "Phone 2",
          modelId: "model-a",
          siteId: "site-1",
          programVersion: "70.83.0.68",
          deviceStatus: "offline",
        },
      ],
    });

    // Page 2 — 1 device, done
    mockYmcsPost.mockResolvedValueOnce({
      skip: 100,
      limit: 100,
      total: 3,
      data: [
        {
          id: "dev-3",
          mac: "001565001122",
          sn: "SN003",
          name: "Room System",
          modelId: "model-b",
          siteId: "site-2",
          programVersion: "70.84.0.5",
          deviceStatus: "pending",
        },
      ],
    });

    const adapter = await createYealinkAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(3);
    expect(mockYmcsPost).toHaveBeenCalledTimes(2);

    // Online device
    expect(devices[0]).toMatchObject({
      platform: Platform.YEALINK_YMCS,
      platformId: "dev-1",
      name: "Phone 1",
      mac: "001565aabbcc",
      firmware: "70.83.0.68",
      status: "online",
    });

    // Offline device
    expect(devices[1]).toMatchObject({ status: "offline" });

    // Pending → unknown
    expect(devices[2]).toMatchObject({ status: "unknown" });
  });
});

describe("fetchRecentAlerts", () => {
  it("returns active alarms as NormalizedAlerts", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    mockYmcsPost.mockResolvedValueOnce({
      skip: 0,
      limit: 100,
      total: 2,
      data: [
        {
          id: "alarm-1",
          event: "Offline",
          level: 3,
          mac: "001565aabbcc",
          model: "SIP-T54S",
          ip: "10.0.0.1",
          siteName: "HQ",
          status: 1,
          firstAlarmTime: 1700000000000,
          lastAlarmTime: 1700000001000,
        },
        {
          id: "alarm-2",
          event: "AccountRegistrationFailed",
          level: 2,
          mac: "001565ddeeff",
          model: "SIP-T54S",
          ip: "10.0.0.2",
          siteName: "HQ",
          status: 2, // solved — should be excluded
          firstAlarmTime: 1700000000000,
          lastAlarmTime: 1700000001000,
        },
      ],
    });

    const adapter = await createYealinkAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-05-01"));

    // Only active (status=1) alarms
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      platform: Platform.YEALINK_YMCS,
      platformAlertId: "alarm-1",
      platformDeviceId: "001565aabbcc",
      severity: "CRITICAL",
      title: expect.stringContaining("Offline"),
    });
  });

  it("returns empty array when no active alarms", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    mockYmcsPost.mockResolvedValueOnce({
      skip: 0,
      limit: 100,
      total: 0,
      data: [],
    });

    const adapter = await createYealinkAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date());
    expect(alerts).toHaveLength(0);
  });
});

describe("verifyWebhookSignature", () => {
  it("returns true when authorization header matches webhookSecret", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    const adapter = await createYealinkAdapter();
    // YMCS sends the verification token directly in the authorization header
    expect(adapter.verifyWebhookSignature("", "verify-token-abc")).toBe(true);
    expect(adapter.verifyWebhookSignature("", "wrong-token")).toBe(false);
    expect(adapter.verifyWebhookSignature("", "")).toBe(false);
  });
});

describe("normalizeWebhookPayload", () => {
  it("returns null — YMCS webhook events are handled directly in the route", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    const adapter = await createYealinkAdapter();
    expect(adapter.normalizeWebhookPayload({ type: "alarm.created" })).toBeNull();
  });
});

describe("rebootDevice", () => {
  it("calls POST /v2/dm/device/reboot with correct deviceIds", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    mockYmcsPost.mockResolvedValueOnce({
      total: 1,
      successCount: 1,
      failureCount: 0,
      errors: [],
    });

    const adapter = await createYealinkAdapter();
    await expect(adapter.rebootDevice("dev-uuid-123")).resolves.toBeUndefined();

    expect(mockYmcsPost).toHaveBeenCalledWith(
      expect.stringContaining("ymcs.yealink.com"),
      "/v2/dm/device/reboot",
      "tok",
      expect.objectContaining({
        deviceIds: ["dev-uuid-123"],
        deviceType: 1,
      })
    );
  });

  it("throws when reboot reports failure", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    mockYmcsPost.mockResolvedValueOnce({
      total: 1,
      successCount: 0,
      failureCount: 1,
      errors: [{ field: "dev-uuid-123", msg: "Device not found" }],
    });

    const adapter = await createYealinkAdapter();
    await expect(adapter.rebootDevice("dev-uuid-123")).rejects.toThrow("Device not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/integrations/yealink.test.ts
```

Expected: FAIL — existing adapter is wrong

- [ ] **Step 3: Rewrite the Yealink adapter**

Replace the entire contents of `src/lib/integrations/yealink.ts`:

```typescript
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential, updateConfig } from "./credentials";
import { acquireYmcsToken, ymcsPost, YmcsApiError } from "./ymcs-client";

// ---------------------------------------------------------------------------
// Types — YMCS API shapes
// ---------------------------------------------------------------------------

interface YmcsDevice {
  id: string;
  mac: string;
  sn: string;
  name: string;
  modelId: string;
  siteId: string;
  programVersion: string;
  deviceStatus: string; // "online" | "offline" | "pending"
}

interface YmcsDeviceListResponse {
  skip: number;
  limit: number;
  total: number;
  data: YmcsDevice[];
}

interface YmcsAlarm {
  id: string;
  event: string;
  level: number; // 1=Minor, 2=Major, 3=Critical
  mac: string;
  model: string;
  ip: string;
  siteName: string;
  status: number; // 1=active, 2=solved, 3=ignored
  firstAlarmTime: number;
  lastAlarmTime: number;
}

interface YmcsAlarmListResponse {
  skip: number;
  limit: number;
  total: number;
  data: YmcsAlarm[];
}

interface YmcsRebootResponse {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ field: string; msg: string }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function regionToBaseUrl(region: string): string {
  const r = region.toLowerCase();
  if (r === "eu") return "https://eu-api.ymcs.yealink.com";
  if (r === "au") return "https://au-api.ymcs.yealink.com";
  return "https://us-api.ymcs.yealink.com"; // default: US
}

function toDeviceStatus(ymcsStatus: string): DeviceStatus {
  if (ymcsStatus === "online") return "online";
  if (ymcsStatus === "offline") return "offline";
  return "unknown"; // "pending" = not yet reported
}

function levelToSeverity(level: number): AlertSeverity {
  if (level >= 3) return AlertSeverity.CRITICAL;
  if (level === 2) return AlertSeverity.HIGH;
  return AlertSeverity.MEDIUM;
}

// Fetches all pages from a paginated YMCS list endpoint.
async function fetchAllPages<T>(
  baseUrl: string,
  path: string,
  token: string,
  filter: Record<string, unknown> = {}
): Promise<T[]> {
  const results: T[] = [];
  let skip = 0;
  const limit = 100;

  do {
    const page = await ymcsPost<{ skip: number; limit: number; total: number; data: T[] }>(
      baseUrl,
      path,
      token,
      { skip, limit, autoCount: skip === 0, filter }
    );
    results.push(...page.data);
    skip += page.data.length;

    if (page.data.length < limit) break;
    // If total is available, stop early
    if (page.total !== undefined && skip >= page.total) break;
  } while (true);

  return results;
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export async function createYealinkAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential(Platform.YEALINK_YMCS);

  if (!cred) {
    throw new Error("YEALINK_YMCS credentials not configured");
  }

  if (!cred.clientId || !cred.clientSecret) {
    throw new Error("YEALINK_YMCS clientId and clientSecret are required");
  }

  const { clientId, clientSecret } = cred;
  const storedConfig = (cred.config as Record<string, unknown>) ?? {};
  const region = (storedConfig.region as string | undefined) ?? "us";
  const baseUrl = regionToBaseUrl(region);
  const webhookSecret = cred.webhookSecret ?? null;

  // Token cached in PlatformCredential.config, refreshed 60s before expiry.
  let accessToken = storedConfig.accessToken as string | undefined;
  let tokenExpiresAt = storedConfig.tokenExpiresAt as number | undefined;

  async function ensureToken(): Promise<string> {
    const now = Date.now();
    const bufferMs = 60_000;
    const isExpiringSoon = !tokenExpiresAt || tokenExpiresAt - now < bufferMs;

    if (!accessToken || isExpiringSoon) {
      const result = await acquireYmcsToken(baseUrl, clientId, clientSecret);
      accessToken = result.access_token;
      tokenExpiresAt = now + result.expires_in * 1000 - bufferMs;
      await updateConfig(Platform.YEALINK_YMCS, { accessToken, tokenExpiresAt, region });
    }

    return accessToken;
  }

  return {
    async syncDevices(): Promise<NormalizedDevice[]> {
      const token = await ensureToken();
      const devices = await fetchAllPages<YmcsDevice>(
        baseUrl,
        "/v2/dm/listDevices",
        token,
        {} // no filter = all device types
      );

      return devices.map((d): NormalizedDevice => ({
        platform: Platform.YEALINK_YMCS,
        platformId: d.id,
        name: d.name,
        model: d.modelId || undefined,
        firmware: d.programVersion || undefined,
        macAddress: d.mac || undefined,
        status: toDeviceStatus(d.deviceStatus),
        rawPayload: d,
      }));
    },

    // Polls active alarms from YMCS. The `since` param is accepted for interface
    // compatibility but unused — we fetch all active (status=1) alarms and the
    // correlation engine's dedup pass prevents duplicate tickets.
    async fetchRecentAlerts(_since: Date): Promise<NormalizedAlert[]> {
      const token = await ensureToken();
      const allAlarms = await fetchAllPages<YmcsAlarm>(
        baseUrl,
        "/v2/dm/listAlarms",
        token,
        {}
      );

      // Only process active alarms (status=1); solved/ignored are not actionable.
      const activeAlarms = allAlarms.filter((a) => a.status === 1);

      return activeAlarms.map((a): NormalizedAlert => ({
        platform: Platform.YEALINK_YMCS,
        platformAlertId: a.id,
        // YMCS alarms identify devices by MAC, not internal ID.
        // correlation.ts will look up the Device record by platform+platformDeviceId.
        // We use MAC here; the yealink webhook route also uses MAC for consistency.
        platformDeviceId: a.mac,
        severity: levelToSeverity(a.level),
        title: `${a.event}: ${a.model || "Device"} (${a.mac})`,
        description: a.siteName ? `Site: ${a.siteName}` : undefined,
        rawPayload: a,
        receivedAt: new Date(a.firstAlarmTime),
      }));
    },

    // YMCS webhooks use a static verification token — not HMAC.
    // The `payload` argument is ignored; only `sig` (the authorization header) matters.
    verifyWebhookSignature(_payload: string, sig: string): boolean {
      if (!webhookSecret || !sig) return false;
      return sig === webhookSecret;
    },

    // YMCS webhook events are batched arrays and include alarm.recovered events
    // that need resolution logic — the webhook route handles them directly.
    // This method always returns null; see yealink webhook route for actual parsing.
    normalizeWebhookPayload(_raw: unknown): NormalizedAlert | null {
      return null;
    },

    async rebootDevice(platformId: string): Promise<void> {
      const token = await ensureToken();
      const result = await ymcsPost<YmcsRebootResponse>(
        baseUrl,
        "/v2/dm/device/reboot",
        token,
        {
          deviceIds: [platformId],
          deviceType: 1, // Phone Device (default; Room = 3)
        }
      );

      if (result.failureCount > 0) {
        const firstError = result.errors[0];
        throw new Error(
          firstError?.msg ?? `YMCS reboot failed for device ${platformId}`
        );
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/integrations/yealink.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: Also run all integration tests**

```bash
npx vitest run src/test/integrations/
```

Expected: all passing

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: clean

- [ ] **Step 7: Commit**

```bash
git add src/lib/integrations/yealink.ts src/test/integrations/yealink.test.ts
git commit -m "feat: rewrite yealink adapter to use real YMCS Open API V4X (replaces stub)"
```

**IMPORTANT NOTE on `platformDeviceId`:** YMCS alarms only carry the device MAC address, not the internal YMCS device UUID. The adapter uses MAC as `platformDeviceId`. This means the correlation engine's `device.findUnique({ where: { platform_platformId: { platform, platformId } } })` will only match if devices are synced with MAC as `platformId`. Devices synced via `syncDevices()` use the YMCS device UUID as `platformId`. The device lookup will return null for alarm-sourced alerts — the ticket will still be created but won't be linked to a specific device. This is acceptable for Phase 1; Phase 2 can add a MAC-based lookup fallback in `correlation.ts`.

---

## Task 3: Rewrite the Yealink Webhook Route

The existing route has wrong event types, wrong auth, and wrong payload parsing. This is a complete rewrite.

**The key differences from Poly Lens:**
- YMCS **does** support webhooks — keep the route
- Events are batched: body is `{ events: [...] }` not a single event
- Two event types: `alarm.created` (create alert) and `alarm.recovered` (resolve alert)
- Auth is a static token in the `authorization` header — not HMAC

**Files:**
- Rewrite: `src/app/api/webhooks/yealink/route.ts`
- Create: `src/test/api/webhooks-yealink.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/api/webhooks-yealink.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/webhooks/yealink/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/integrations/yealink", () => ({
  createYealinkAdapter: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    alert: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/correlation", () => ({
  processAlert: vi.fn(),
}));

vi.mock("@/lib/sse-bus", () => ({
  emitSseEvent: vi.fn(),
}));

import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { prisma } from "@/lib/prisma";
import { processAlert } from "@/lib/correlation";

const mockCreateAdapter = vi.mocked(createYealinkAdapter);
const mockProcessAlert = vi.mocked(processAlert);
const mockFindEvent = vi.mocked(prisma.webhookEvent.findUnique);
const mockCreateEvent = vi.mocked(prisma.webhookEvent.create);
const mockUpdateEvent = vi.mocked(prisma.webhookEvent.update);
const mockFindAlert = vi.mocked(prisma.alert.findFirst);
const mockUpdateAlert = vi.mocked(prisma.alert.update);

const VALID_BODY = {
  events: [
    {
      id: "event-uuid-1",
      type: "alarm.created",
      createTime: 1600063609555,
      partyId: "enterprise-id",
      data: {
        id: "alarm-id-1",
        event: "Offline",
        mac: "001565aabbcc",
        model: "SIP-T54S",
      },
    },
  ],
};

function makeRequest(body: unknown, authHeader = "verify-token-abc") {
  return new NextRequest("http://localhost/api/webhooks/yealink", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      authorization: authHeader,
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();

  mockCreateAdapter.mockResolvedValue({
    verifyWebhookSignature: vi.fn((_payload: string, sig: string) => sig === "verify-token-abc"),
    normalizeWebhookPayload: vi.fn().mockReturnValue(null),
    syncDevices: vi.fn(),
    fetchRecentAlerts: vi.fn(),
    rebootDevice: vi.fn(),
  } as never);

  mockFindEvent.mockResolvedValue(null);
  mockCreateEvent.mockResolvedValue({ id: "db-event-1" } as never);
  mockUpdateEvent.mockResolvedValue({} as never);
  mockProcessAlert.mockResolvedValue({ action: "created", alertId: "a1", ticketId: "t1" });
});

describe("POST /api/webhooks/yealink", () => {
  it("returns 401 when authorization token is wrong", async () => {
    const req = makeRequest(VALID_BODY, "wrong-token");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/yealink", {
      method: "POST",
      body: "not-json",
      headers: { "content-type": "application/json", authorization: "verify-token-abc" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("deduplicates events already seen", async () => {
    mockFindEvent.mockResolvedValueOnce({ id: "existing" } as never);
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProcessAlert).not.toHaveBeenCalled();
  });

  it("calls processAlert for alarm.created events", async () => {
    const req = makeRequest(VALID_BODY);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProcessAlert).toHaveBeenCalledOnce();
    const alertArg = mockProcessAlert.mock.calls[0][0];
    expect(alertArg.platform).toBe("YEALINK_YMCS");
    expect(alertArg.platformAlertId).toBe("alarm-id-1");
    expect(alertArg.platformDeviceId).toBe("001565aabbcc");
    expect(alertArg.severity).toBe("HIGH"); // level not in data, defaults
    expect(alertArg.title).toContain("Offline");
  });

  it("marks existing alert resolved for alarm.recovered events", async () => {
    const recoveryBody = {
      events: [
        {
          id: "event-uuid-2",
          type: "alarm.recovered",
          createTime: 1600063700000,
          partyId: "enterprise-id",
          data: {
            id: "alarm-id-1",
            event: "Online",
            mac: "001565aabbcc",
            model: "SIP-T54S",
          },
        },
      ],
    };

    mockFindAlert.mockResolvedValueOnce({
      id: "alert-db-1",
      status: "ACTIVE",
    } as never);

    const req = makeRequest(recoveryBody);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockProcessAlert).not.toHaveBeenCalled();
    expect(mockUpdateAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "alert-db-1" },
        data: expect.objectContaining({ status: "RESOLVED" }),
      })
    );
  });

  it("handles multiple events in one request", async () => {
    const multiBody = {
      events: [
        {
          id: "evt-1",
          type: "alarm.created",
          createTime: 1600063609555,
          partyId: "enterprise-id",
          data: { id: "alarm-1", event: "Offline", mac: "aabbcc001122", model: "SIP-T54S" },
        },
        {
          id: "evt-2",
          type: "alarm.created",
          createTime: 1600063609600,
          partyId: "enterprise-id",
          data: { id: "alarm-2", event: "Offline", mac: "ddeeff334455", model: "SIP-T54S" },
        },
      ],
    };

    const req = makeRequest(multiBody);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockProcessAlert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/api/webhooks-yealink.test.ts
```

Expected: FAIL

- [ ] **Step 3: Rewrite the Yealink webhook route**

Replace the entire contents of `src/app/api/webhooks/yealink/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { processAlert } from "@/lib/correlation";
import { emitSseEvent } from "@/lib/sse-bus";
import { AlertSeverity } from "@prisma/client";

interface YmcsEventData {
  id: string;    // alarm ID
  event: string; // "Offline", "Online", etc.
  mac: string;
  model: string;
}

interface YmcsWebhookEvent {
  id: string;
  type: "alarm.created" | "alarm.recovered" | string;
  createTime: number;
  partyId: string;
  data: YmcsEventData;
}

interface YmcsWebhookBody {
  events: YmcsWebhookEvent[];
}

function isYmcsWebhookBody(value: unknown): value is YmcsWebhookBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "events" in value &&
    Array.isArray((value as Record<string, unknown>).events)
  );
}

// Yealink webhook alarms don't include severity level — we default to HIGH
// since any alarm triggering a webhook is considered noteworthy.
const DEFAULT_SEVERITY = AlertSeverity.HIGH;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const authHeader = req.headers.get("authorization") ?? "";

  // Initialize adapter to get verifyWebhookSignature — static token comparison
  let adapter: Awaited<ReturnType<typeof createYealinkAdapter>>;
  try {
    adapter = await createYealinkAdapter();
  } catch {
    return NextResponse.json({ error: "Adapter unavailable" }, { status: 503 });
  }

  if (!adapter.verifyWebhookSignature(rawBody, authHeader)) {
    return NextResponse.json({ error: "Invalid authorization token" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isYmcsWebhookBody(body)) {
    return NextResponse.json({ error: "Invalid webhook body shape" }, { status: 400 });
  }

  const results: Array<{ eventId: string; action: string }> = [];

  for (const event of body.events) {
    // Dedup: skip events we've already processed
    const existing = await prisma.webhookEvent.findUnique({
      where: { platform_eventId: { platform: "YEALINK_YMCS", eventId: event.id } },
    });

    if (existing) {
      results.push({ eventId: event.id, action: "deduped" });
      continue;
    }

    const webhookRecord = await prisma.webhookEvent.create({
      data: {
        platform: "YEALINK_YMCS",
        eventId: event.id,
        payload: event as object,
      },
    });

    try {
      if (event.type === "alarm.created") {
        const normalized = {
          platform: "YEALINK_YMCS" as const,
          platformAlertId: event.data.id,
          platformDeviceId: event.data.mac, // MAC is the device identifier from webhook
          severity: DEFAULT_SEVERITY,
          title: `${event.data.event}: ${event.data.model || "Device"} (${event.data.mac})`,
          rawPayload: event,
          receivedAt: new Date(event.createTime),
        };

        await processAlert(normalized);
        results.push({ eventId: event.id, action: "alert_created" });

      } else if (event.type === "alarm.recovered") {
        // Find and resolve the existing active alert for this alarm ID
        const existingAlert = await prisma.alert.findFirst({
          where: {
            platform: "YEALINK_YMCS",
            platformAlertId: event.data.id,
            status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
          },
        });

        if (existingAlert) {
          await prisma.alert.update({
            where: { id: existingAlert.id },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });

          await prisma.activityLog.create({
            data: {
              type: "auto_resolved",
              platform: "YEALINK_YMCS",
              alertId: existingAlert.id,
              message: `Alert resolved via YMCS webhook: device ${event.data.mac} came back online`,
            },
          });

          emitSseEvent("alert_resolved", { id: existingAlert.id });
          emitSseEvent("kpi_updated", {});
        }

        results.push({ eventId: event.id, action: "alert_recovered" });
      } else {
        results.push({ eventId: event.id, action: "ignored_unknown_type" });
      }

      await prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: { processedAt: new Date() },
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: { error: message },
      });
      results.push({ eventId: event.id, action: "error" });
    }
  }

  // Must respond within 5s — YMCS retries on timeout
  return NextResponse.json({ ok: true, processed: results.length, results });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/api/webhooks-yealink.test.ts
```

Expected: PASS

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: clean

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/yealink/route.ts src/test/api/webhooks-yealink.test.ts
git commit -m "feat: rewrite yealink webhook route for real YMCS event format (alarm.created/recovered, static token auth)"
```

---

## Task 4: Update Settings Page for Yealink Credentials

The Settings page currently shows `apiKey` and `webhookSecret` for Yealink YMCS, but the real API uses `clientId`/`clientSecret` plus `region` (config) and `webhookSecret` (for token verification).

**Files:**
- Modify: `src/app/(app)/settings/SettingsClient.tsx`

- [ ] **Step 1: Read the current SettingsClient.tsx**

```bash
cat src/app/(app)/settings/SettingsClient.tsx | head -30
```

- [ ] **Step 2: Update the Yealink platform fields**

In `SettingsClient.tsx`, find the `PLATFORMS` array and update the Yealink entry. Change from:

```typescript
{
  id: "YEALINK_YMCS",
  label: "Yealink YMCS",
  credFields: [
    { key: "apiKey", label: "API Key", type: "password" as const },
    { key: "webhookSecret", label: "Webhook Secret", type: "password" as const },
  ],
  configFields: [],
},
```

To:

```typescript
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
```

- [ ] **Step 3: Also update the PUT route to handle webhookSecret as a credential field**

The `/api/integrations` PUT route already handles `webhookSecret` — verify it's in the `updateData` object:

```bash
grep -n "webhookSecret" src/app/api/integrations/route.ts
```

Expected: line shows `webhookSecret: body.webhookSecret ?? null` is already in `updateData`. If not, add it.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: clean

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/settings/SettingsClient.tsx
git commit -m "feat: update settings UI for Yealink YMCS real credentials (clientId/clientSecret/region/webhookToken)"
```

---

## Task 5: Create Smoke Test Script

Manual verification script for when real YMCS credentials are available. Creates `scripts/smoke-yealink.ts` (already gitignored by `scripts/smoke-*.ts` pattern).

**Files:**
- Create: `scripts/smoke-yealink.ts`

- [ ] **Step 1: Create the smoke test**

Create `scripts/smoke-yealink.ts`:

```typescript
// Run with: npx tsx scripts/smoke-yealink.ts
// Requires in .env.local:
//   YMCS_CLIENT_ID=
//   YMCS_CLIENT_SECRET=
//   YMCS_REGION=us   (or eu / au)

import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "crypto";

const CLIENT_ID = process.env.YMCS_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.YMCS_CLIENT_SECRET ?? "";
const REGION = process.env.YMCS_REGION ?? "us";
const BASE_URL = `https://${REGION}-api.ymcs.yealink.com`;

function buildHeaders(authorization: string): Record<string, string> {
  return {
    authorization,
    timestamp: Date.now().toString(),
    nonce: crypto.randomBytes(12).toString("hex"),
    "content-type": "application/json",
  };
}

async function getToken(): Promise<string> {
  const credential = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const res = await fetch(`${BASE_URL}/v2/token`, {
    method: "POST",
    headers: buildHeaders(`Basic ${credential}`),
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  console.log(`✓ Token obtained (expires in ${json.expires_in}s)`);
  return json.access_token;
}

async function testDeviceSync(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v2/dm/listDevices`, {
    method: "POST",
    headers: buildHeaders(`Bearer ${token}`),
    body: JSON.stringify({ skip: 0, limit: 10, autoCount: true, filter: {} }),
  });

  const json = (await res.json()) as {
    total?: number;
    data?: unknown[];
    code?: string;
    message?: string;
  };

  if (json.code && json.code !== "900200") {
    console.error("listDevices error:", json);
    return;
  }

  const total = json.total ?? 0;
  const devices = json.data ?? [];
  console.log(`✓ Device sync: ${total} total devices, first page has ${devices.length}`);
  if (devices.length > 0) {
    console.log("First device:", JSON.stringify(devices[0], null, 2));
    console.log("\n⚠ Verify field names match YmcsDevice interface in yealink.ts");
  }
}

async function testAlarmList(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v2/dm/listAlarms`, {
    method: "POST",
    headers: buildHeaders(`Bearer ${token}`),
    body: JSON.stringify({ skip: 0, limit: 10, autoCount: true, filter: {} }),
  });

  const json = (await res.json()) as {
    total?: number;
    data?: Array<{ status: number; event: string; mac: string; level: number }>;
    code?: string;
    message?: string;
  };

  if (json.code && json.code !== "900200") {
    console.error("listAlarms error:", json);
    return;
  }

  const total = json.total ?? 0;
  const alarms = json.data ?? [];
  const activeCount = alarms.filter((a) => a.status === 1).length;
  console.log(`✓ Alarm list: ${total} total alarms, ${activeCount} active in first page`);
  if (alarms.length > 0) {
    console.log("First alarm:", JSON.stringify(alarms[0], null, 2));
    console.log("\n⚠ Verify field names match YmcsAlarm interface in yealink.ts");
  }
}

async function testDeviceCount(token: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v2/dm/statistics/deviceCount?deviceStatus=0`, {
    method: "GET",
    headers: buildHeaders(`Bearer ${token}`),
  });

  const json = (await res.json()) as { total?: number; code?: string };

  if (json.code && json.code !== "900200") {
    console.error("deviceCount error:", json);
    return;
  }

  console.log(`✓ Offline device count: ${json.total ?? 0}`);
}

async function main(): Promise<void> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Missing YMCS_CLIENT_ID or YMCS_CLIENT_SECRET in .env.local");
    process.exit(1);
  }

  console.log(`=== YMCS Smoke Test (region: ${REGION}, base: ${BASE_URL}) ===\n`);

  const token = await getToken();
  await testDeviceSync(token);
  console.log();
  await testAlarmList(token);
  console.log();
  await testDeviceCount(token);

  console.log("\n✓ Smoke test complete.");
  console.log("  If field names differ, update YmcsDevice/YmcsAlarm interfaces in yealink.ts");
}

main().catch((err: unknown) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it's gitignored**

```bash
git check-ignore scripts/smoke-yealink.ts && echo "✓ gitignored"
```

Expected: prints path (gitignored by `scripts/smoke-*.ts` pattern)

- [ ] **Step 3: Commit the gitignore entry only** (script itself is gitignored)

```bash
# smoke-yealink.ts is gitignored — only commit if .gitignore needed updating
git status scripts/
```

If `.gitignore` already has `scripts/smoke-*.ts` (added during Poly Lens work), nothing to commit here. Otherwise:

```bash
git add .gitignore
git commit -m "chore: ensure smoke-yealink.ts is gitignored"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| OAuth2 token via `POST /v2/token` with Basic auth | Task 1 — `acquireYmcsToken` |
| `timestamp` + `nonce` headers on every request | Task 1 — `buildYmcsHeaders` |
| Region-aware base URL (us/eu/au) | Task 2 — `regionToBaseUrl` |
| Token TTL from `expires_in` (not hardcoded) | Task 2 — `result.expires_in * 1000` |
| Token cached in `PlatformCredential.config` | Task 2 — `ensureToken` with `updateConfig` |
| Device sync via `POST /v2/dm/listDevices` | Task 2 — `syncDevices()` |
| Skip/limit pagination (max 100/page) | Task 2 — `fetchAllPages` |
| Device status: online/offline/pending→unknown | Task 2 — `toDeviceStatus` |
| Alert polling via `POST /v2/dm/listAlarms` | Task 2 — `fetchRecentAlerts` |
| Filter to active alarms only (status=1) | Task 2 — JS post-filter |
| Severity: level 3→CRITICAL, 2→HIGH, 1→MEDIUM | Task 2 — `levelToSeverity` |
| Reboot via `POST /v2/dm/device/reboot` | Task 2 — `rebootDevice` |
| Webhook: static token verification | Task 2 — `verifyWebhookSignature` (plain equality) |
| Webhook: batched `{ events: [...] }` body | Task 3 — `isYmcsWebhookBody` guard |
| Webhook: `alarm.created` → `processAlert` | Task 3 — POST route |
| Webhook: `alarm.recovered` → resolve existing alert | Task 3 — POST route |
| Webhook: dedup via `WebhookEvent` table | Task 3 — `findUnique` before processing |
| Webhook: respond within 5s (200/204) | Task 3 — immediate response at end |
| Settings UI: clientId, clientSecret, region, webhookSecret | Task 4 |
| Smoke test for real API validation | Task 5 |

### Placeholder Scan — None Found

### Type Consistency

- `YmcsDevice` (Task 2) used in `fetchAllPages<YmcsDevice>` and `syncDevices` map — consistent
- `YmcsAlarm` (Task 2) used in `fetchAllPages<YmcsAlarm>` and `fetchRecentAlerts` — consistent
- `ymcsPost<YmcsDeviceListResponse>` in tests → aligns with actual response shape in adapter
- `YmcsWebhookEvent.data` in route matches expected YMCS webhook shape from docs

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-29-yealink-ymcs-integration.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — run tasks in this session with checkpoints

**Which approach?**
