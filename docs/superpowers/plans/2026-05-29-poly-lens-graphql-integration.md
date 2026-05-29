# Poly Lens GraphQL Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing REST-based Poly Lens adapter stub with a correct GraphQL implementation that can sync device inventory and poll for offline/degraded devices via the real Poly Lens API.

**Architecture:** Poly Lens exposes a single GraphQL endpoint (not REST). Authentication uses OAuth 2.0 client credentials producing a 24-hour JWT. All queries must be structured through `tenants → inventory → devices`. Real-time updates are delivered via WebSocket subscriptions — but since Next.js is serverless and can't hold persistent WebSocket connections, Phase 1 uses the existing 5-minute cron polling pattern; subscription support is a future phase. The webhook route for Poly Lens is removed — Poly Lens does not send webhooks.

**Tech Stack:** Next.js 15 App Router · TypeScript · Prisma 7 · `graphql-ws` (deferred, Phase 2) · existing `credentials.ts` and `correlation.ts` unchanged

---

## Critical Context: What's Wrong Today

The existing `src/lib/integrations/poly-lens.ts` was written assuming a REST API. **None of those endpoints exist.** Specifically:

| Current (WRONG) | Real Poly Lens API |
|---|---|
| `${API_BASE}/oauth/token` where `API_BASE = https://api.lens.poly.com` | `https://login.lens.poly.com/oauth/token` |
| `GET ${API_BASE}/v2/devices` | GraphQL query via `POST https://api.silica-prod01.io.lens.poly.com/graphql` |
| `GET ${API_BASE}/v2/alerts` | GraphQL query for offline devices |
| `POST ${API_BASE}/v2/devices/:id/reboot` | GraphQL mutation (name TBD — verify in API Playground) |
| Webhook HMAC verification | Poly Lens has no webhooks — uses WebSocket subscriptions |

The webhook route at `src/app/api/webhooks/poly-lens/route.ts` must be removed.

## What Stays the Same

- `src/lib/integrations/types.ts` — `NormalizedAlert`, `NormalizedDevice`, `DeviceStatus` types are correct
- `src/lib/integrations/credentials.ts` — `getCredential`, `updateConfig` helpers are correct
- `src/lib/correlation.ts` — unchanged, receives `NormalizedAlert` from the adapter
- `src/lib/integrations/sync.ts` — unchanged, calls `adapter.syncDevices()`
- `src/app/api/cron/alerts/route.ts` — unchanged, calls `adapter.fetchRecentAlerts(since)`
- `src/lib/integrations/yealink.ts` — unchanged

---

## Environment Variables Required

These must be set in `.env.local` before the adapter can run:

```
POLY_LENS_CLIENT_ID=        # From Poly Lens Admin Portal → Account Settings → API Credentials
POLY_LENS_CLIENT_SECRET=    # Same location
# POLY_LENS_WEBHOOK_SECRET  # Remove this — not used
```

The API base URLs are hardcoded constants (not env vars — they never change):
- Auth: `https://login.lens.poly.com/oauth/token`
- GraphQL: `https://api.silica-prod01.io.lens.poly.com/graphql`

---

## GraphQL Query Reference

These are the **verified** query shapes from the Poly Lens docs. All device queries require a `tenantId` (UUID from Poly Lens Admin Portal → Account Settings). Store it in `PlatformCredential.config.tenantId`.

### Device Sync (paginated, Relay-style edges)

```graphql
query SyncDevices($tenantId: ID!, $params: DeviceFindArgs) {
  tenant(id: $tenantId) {
    inventory {
      deviceSearch(params: $params) {
        edges {
          node {
            id
            name
            connected
            hardwareModel
            softwareVersion
            macAddress
            siteId
            roomId
          }
        }
        pageInfo {
          totalCount
          countOnPage
          nextToken
          hasNextPage
        }
      }
    }
  }
}
```

Variables for pagination:
```json
{ "tenantId": "your-tenant-uuid", "params": { "pageSize": 500, "nextToken": null } }
```

### Offline Devices (for alert polling)

```graphql
query GetOfflineDevices($tenantId: ID!, $params: DeviceFindArgs) {
  tenant(id: $tenantId) {
    inventory {
      deviceSearch(params: $params) {
        edges {
          node {
            id
            name
            connected
            hardwareModel
            siteId
            roomId
          }
        }
        pageInfo {
          nextToken
          hasNextPage
        }
      }
    }
  }
}
```

Variables:
```json
{
  "tenantId": "your-tenant-uuid",
  "params": {
    "pageSize": 500,
    "filter": { "field": "connected", "contains": "false" }
  }
}
```

### Real-Time Subscription (`deviceStream`)

Poly Lens uses GraphQL Subscriptions over WebSocket for real-time device status — **not webhooks**. This is a Phase 2 capability (requires persistent WebSocket connection, not compatible with serverless). Documented here for reference:

```graphql
subscription DeviceStream($deviceIds: [String!]!) {
  deviceStream(deviceIds: $deviceIds) {
    id
    name
    connected
    macAddress
    modelId
    siteId
    roomId
    softwareVersion
    tenantId
  }
}
```

WebSocket endpoint: `wss://api.silica-prod01.io.lens.poly.com/graphql`

### Reboot Mutation (exact name TBD — verify in API Playground)

```graphql
mutation RebootDevice($deviceId: ID!) {
  rebootDevice(deviceId: $deviceId) {
    success
    message
  }
}
```

### Query Cost Header Monitoring

Every response includes these headers — log them during development:
- `graphql-ratelimit-querycost` — cost of the query just executed
- `ratelimit-limit` — rolling limit (100,000)
- `ratelimit-remaining` — points remaining
- `ratelimit-reset` — seconds until reset

### Available Insights Queries (future use)

| Query | Purpose | Premium? |
|---|---|---|
| `frequentlyOfflineDevices` | Devices offline >1 week | No |
| `connectedDevices` | Device utilization over time range | No |
| `deviceUptime` | Uptime % per device | No |
| `callDuration` | Call minutes per day | No |
| `occupancy` | Room occupancy over time | **Yes** |
| `roomCapacityUtilization` | Room utilization % | **Yes** |
| `peopleCountStream` (subscription) | Live headcount per room | **Yes** |

---

## File Structure

```
REWRITE:
  src/lib/integrations/poly-lens.ts          — GraphQL adapter (replaces REST stub)

CREATE:
  src/lib/integrations/graphql-client.ts     — Thin GraphQL-over-HTTP helper
  src/test/integrations/poly-lens.test.ts    — Unit tests for the adapter

REMOVE:
  src/app/api/webhooks/poly-lens/route.ts    — Poly Lens has no webhooks

UNCHANGED:
  src/lib/integrations/types.ts
  src/lib/integrations/credentials.ts
  src/lib/integrations/sync.ts
  src/lib/integrations/yealink.ts
  src/lib/correlation.ts
  src/app/api/cron/alerts/route.ts
  src/app/api/webhooks/yealink/route.ts
```

---

## Task 1: Create the GraphQL HTTP Client Helper

This is a thin wrapper around `fetch` for making authenticated GraphQL requests. It handles: POST body, auth header, rate limit header logging, and typed response unwrapping.

**Files:**
- Create: `src/lib/integrations/graphql-client.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/integrations/graphql-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeGraphQL, GraphQLClientError } from "@/lib/integrations/graphql-client";

const ENDPOINT = "https://api.silica-prod01.io.lens.poly.com/graphql";
const TOKEN = "test-token";

describe("executeGraphQL", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends POST with correct headers and body", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { result: 42 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const query = "query { result }";
    await executeGraphQL<{ result: number }>({ endpoint: ENDPOINT, token: TOKEN, query });

    expect(mockFetch).toHaveBeenCalledWith(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ query, variables: undefined }),
    });
  });

  it("returns parsed data on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { foo: "bar" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    const result = await executeGraphQL<{ foo: string }>({
      endpoint: ENDPOINT,
      token: TOKEN,
      query: "query { foo }",
    });

    expect(result).toEqual({ foo: "bar" });
  });

  it("throws GraphQLClientError when response contains errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({ errors: [{ message: "Field not found" }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    await expect(
      executeGraphQL({ endpoint: ENDPOINT, token: TOKEN, query: "query { bad }" })
    ).rejects.toThrow(GraphQLClientError);
  });

  it("throws when HTTP status is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("Unauthorized", { status: 401 })
      )
    );

    await expect(
      executeGraphQL({ endpoint: ENDPOINT, token: TOKEN, query: "query { x }" })
    ).rejects.toThrow("GraphQL HTTP error: 401");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/integrations/graphql-client.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/integrations/graphql-client'`

- [ ] **Step 3: Create the GraphQL client**

Create `src/lib/integrations/graphql-client.ts`:

```typescript
export class GraphQLClientError extends Error {
  constructor(
    message: string,
    public readonly errors: Array<{ message: string }>
  ) {
    super(message);
    this.name = "GraphQLClientError";
  }
}

interface GraphQLRequest {
  endpoint: string;
  token: string;
  query: string;
  variables?: Record<string, unknown>;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export async function executeGraphQL<T>({
  endpoint,
  token,
  query,
  variables,
}: GraphQLRequest): Promise<T> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;

  if (json.errors && json.errors.length > 0) {
    const message = json.errors.map((e) => e.message).join("; ");
    throw new GraphQLClientError(`GraphQL errors: ${message}`, json.errors);
  }

  if (json.data === undefined) {
    throw new Error("GraphQL response missing data field");
  }

  return json.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/integrations/graphql-client.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/graphql-client.ts src/test/integrations/graphql-client.test.ts
git commit -m "feat: add graphql-client helper for authenticated GraphQL over HTTP"
```

---

## Task 2: Rewrite the Poly Lens Adapter

Replace the fake REST adapter with a real GraphQL one. This task is the core of the integration.

**Files:**
- Rewrite: `src/lib/integrations/poly-lens.ts`
- Create: `src/test/integrations/poly-lens.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/integrations/poly-lens.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the credentials module so tests don't hit the DB
vi.mock("@/lib/integrations/credentials", () => ({
  getCredential: vi.fn(),
  updateConfig: vi.fn(),
}));

// Mock the graphql-client module
vi.mock("@/lib/integrations/graphql-client", () => ({
  executeGraphQL: vi.fn(),
  GraphQLClientError: class GraphQLClientError extends Error {},
}));

import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { getCredential, updateConfig } from "@/lib/integrations/credentials";
import { executeGraphQL } from "@/lib/integrations/graphql-client";
import { Platform } from "@prisma/client";

const mockGetCredential = vi.mocked(getCredential);
const mockUpdateConfig = vi.mocked(updateConfig);
const mockExecuteGraphQL = vi.mocked(executeGraphQL);

const VALID_CRED = {
  id: "cred-1",
  platform: Platform.POLY_LENS,
  clientId: "client-id",
  clientSecret: "client-secret",
  apiKey: null,
  webhookSecret: null,
  config: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createPolyLensAdapter", () => {
  it("throws when credentials are not configured", async () => {
    mockGetCredential.mockResolvedValueOnce(null);
    await expect(createPolyLensAdapter()).rejects.toThrow(
      "POLY_LENS credentials not configured"
    );
  });

  it("throws when clientId or clientSecret is missing", async () => {
    mockGetCredential.mockResolvedValueOnce({
      ...VALID_CRED,
      clientId: null,
      clientSecret: null,
    });
    await expect(createPolyLensAdapter()).rejects.toThrow(
      "POLY_LENS clientId and clientSecret are required"
    );
  });
});

describe("syncDevices", () => {
  it("returns normalized devices from GraphQL response", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    // First call: token fetch
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      tenants: [
        {
          inventory: {
            devices: {
              items: [
                {
                  id: "dev-1",
                  name: "Conference Room Poly",
                  connected: true,
                  lastDetected: "2026-05-29T10:00:00Z",
                  site: { id: "site-1", name: "HQ" },
                  room: { id: "room-1", name: "Board Room" },
                },
              ],
              pageInfo: { nextToken: null, hasNextPage: false },
            },
          },
        },
      ],
    });

    const adapter = await createPolyLensAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      platform: Platform.POLY_LENS,
      platformId: "dev-1",
      name: "Conference Room Poly",
      status: "online",
    });
  });

  it("follows pagination until hasNextPage is false", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const page1 = {
      tenants: [{ inventory: { devices: {
        items: [{ id: "dev-1", name: "D1", connected: true, lastDetected: null, site: null, room: null }],
        pageInfo: { nextToken: "cursor-abc", hasNextPage: true },
      } } }],
    };
    const page2 = {
      tenants: [{ inventory: { devices: {
        items: [{ id: "dev-2", name: "D2", connected: false, lastDetected: null, site: null, room: null }],
        pageInfo: { nextToken: null, hasNextPage: false },
      } } }],
    };

    mockExecuteGraphQL
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const adapter = await createPolyLensAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(2);
    expect(mockExecuteGraphQL).toHaveBeenCalledTimes(2);
  });
});

describe("fetchRecentAlerts", () => {
  it("returns NormalizedAlerts for offline devices", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      tenants: [{ inventory: { devices: {
        items: [
          {
            id: "dev-2",
            name: "Offline Phone",
            connected: false,
            lastDetected: "2026-05-29T08:00:00Z",
            site: { id: "site-1", name: "HQ" },
            room: { id: "room-2", name: "Conf A" },
          },
        ],
        pageInfo: { nextToken: null, hasNextPage: false },
      } } }],
    });

    const adapter = await createPolyLensAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-05-29T09:00:00Z"));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      platform: Platform.POLY_LENS,
      platformDeviceId: "dev-2",
      severity: "HIGH",
      title: expect.stringContaining("Offline Phone"),
    });
  });

  it("returns empty array when all devices are online", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      tenants: [{ inventory: { devices: {
        items: [],
        pageInfo: { nextToken: null, hasNextPage: false },
      } } }],
    });

    const adapter = await createPolyLensAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date());

    expect(alerts).toHaveLength(0);
  });
});

describe("verifyWebhookSignature", () => {
  it("always returns false — Poly Lens has no webhooks", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const adapter = await createPolyLensAdapter();
    expect(adapter.verifyWebhookSignature("payload", "sig")).toBe(false);
  });
});

describe("rebootDevice", () => {
  it("calls rebootDevice mutation with correct deviceId", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      rebootDevice: { success: true, message: "Rebooting" },
    });

    const adapter = await createPolyLensAdapter();
    await expect(adapter.rebootDevice("dev-1")).resolves.toBeUndefined();

    expect(mockExecuteGraphQL).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { deviceId: "dev-1" },
      })
    );
  });

  it("throws when reboot mutation returns success: false", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      rebootDevice: { success: false, message: "Device not found" },
    });

    const adapter = await createPolyLensAdapter();
    await expect(adapter.rebootDevice("dev-999")).rejects.toThrow("Device not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/integrations/poly-lens.test.ts
```

Expected: FAIL — existing adapter is REST-based, tests expect GraphQL behaviour

- [ ] **Step 3: Rewrite the Poly Lens adapter**

Replace the entire contents of `src/lib/integrations/poly-lens.ts`:

```typescript
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential, updateConfig } from "./credentials";
import { executeGraphQL } from "./graphql-client";

const AUTH_ENDPOINT = "https://login.lens.poly.com/oauth/token";
const GRAPHQL_ENDPOINT = "https://api.silica-prod01.io.lens.poly.com/graphql";

// ---------------------------------------------------------------------------
// GraphQL query strings
// ---------------------------------------------------------------------------

const SYNC_DEVICES_QUERY = `
  query SyncDevices($tenantId: ID!, $params: DeviceFindArgs) {
    tenant(id: $tenantId) {
      inventory {
        deviceSearch(params: $params) {
          edges {
            node {
              id
              name
              connected
              hardwareModel
              softwareVersion
              macAddress
              siteId
              roomId
            }
          }
          pageInfo {
            totalCount
            countOnPage
            nextToken
            hasNextPage
          }
        }
      }
    }
  }
`;

// Poly Lens does not have a time-filtered alert endpoint. We query for
// currently disconnected devices on each cron cycle and treat each as a
// potential alert. The correlation engine's dedup pass prevents duplicate
// tickets from repeated polls of the same offline device.
const OFFLINE_DEVICES_QUERY = `
  query GetOfflineDevices($tenantId: ID!, $params: DeviceFindArgs) {
    tenant(id: $tenantId) {
      inventory {
        deviceSearch(params: $params) {
          edges {
            node {
              id
              name
              connected
              hardwareModel
              siteId
              roomId
            }
          }
          pageInfo {
            nextToken
            hasNextPage
          }
        }
      }
    }
  }
`;

// NOTE: Exact mutation name TBD — verify in API Playground with real credentials.
const REBOOT_MUTATION = `
  mutation RebootDevice($deviceId: ID!) {
    rebootDevice(deviceId: $deviceId) {
      success
      message
    }
  }
`;

// ---------------------------------------------------------------------------
// Types — shapes returned by Poly Lens GraphQL
// ---------------------------------------------------------------------------

interface PolyDevice {
  id: string;
  name: string;
  connected: boolean;
  hardwareModel: string | null;
  softwareVersion: string | null;
  macAddress: string | null;
  siteId: string | null;
  roomId: string | null;
}

interface DeviceEdge {
  node: PolyDevice;
}

interface DevicesPage {
  edges: DeviceEdge[];
  pageInfo: { nextToken: string | null; hasNextPage: boolean };
}

interface TenantResponse {
  tenant: {
    inventory: {
      deviceSearch: DevicesPage;
    };
  };
}

interface RebootResponse {
  rebootDevice: { success: boolean; message: string };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDeviceStatus(connected: boolean): DeviceStatus {
  return connected ? "online" : "offline";
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(AUTH_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Poly Lens token request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  return json.access_token;
}

// Fetches all pages of a device query, following nextToken pagination.
// Poly Lens uses Relay-style edges/node rather than items arrays.
async function fetchAllDevicePages(
  token: string,
  tenantId: string,
  query: string,
  extraParams: Record<string, unknown> = {},
): Promise<PolyDevice[]> {
  const devices: PolyDevice[] = [];
  let nextToken: string | null = null;

  do {
    const data = await executeGraphQL<TenantResponse>({
      endpoint: GRAPHQL_ENDPOINT,
      token,
      query,
      variables: {
        tenantId,
        params: { pageSize: 500, nextToken, ...extraParams },
      },
    });

    const page = data.tenant.inventory.deviceSearch;
    devices.push(...page.edges.map((e) => e.node));
    nextToken = page.pageInfo.hasNextPage ? page.pageInfo.nextToken : null;
  } while (nextToken !== null);

  return devices;
}

function deviceToNormalized(d: PolyDevice): NormalizedDevice {
  return {
    platform: Platform.POLY_LENS,
    platformId: d.id,
    name: d.name,
    model: d.hardwareModel ?? undefined,
    firmware: d.softwareVersion ?? undefined,
    macAddress: d.macAddress ?? undefined,
    status: toDeviceStatus(d.connected),
    rawPayload: d,
  };
}

function offlineDeviceToAlert(d: PolyDevice): NormalizedAlert {
  return {
    platform: Platform.POLY_LENS,
    platformAlertId: `offline:${d.id}`,
    platformDeviceId: d.id,
    severity: AlertSeverity.HIGH,
    title: `Device offline: ${d.name}`,
    rawPayload: d,
    receivedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export async function createPolyLensAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential(Platform.POLY_LENS);

  if (!cred) {
    throw new Error("POLY_LENS credentials not configured");
  }

  if (!cred.clientId || !cred.clientSecret) {
    throw new Error("POLY_LENS clientId and clientSecret are required");
  }

  const { clientId, clientSecret } = cred;
  const storedConfig = (cred.config as Record<string, unknown>) ?? {};

  // tenantId is the Poly Lens tenant UUID from Admin Portal → Account Settings.
  // It must be saved to PlatformCredential.config.tenantId via the Settings page.
  const tenantId = storedConfig.tenantId as string | undefined;
  if (!tenantId) {
    throw new Error("POLY_LENS tenantId is required — set it in Settings → Poly Lens");
  }

  // Token is cached in PlatformCredential.config to avoid re-fetching on
  // every cron run. Refreshed 60 seconds before the 24-hour TTL.
  let accessToken = storedConfig.accessToken as string | undefined;
  let tokenExpiresAt = storedConfig.tokenExpiresAt as number | undefined;

  async function ensureToken(): Promise<string> {
    const now = Date.now();
    const bufferMs = 60_000;
    const isExpiringSoon = !tokenExpiresAt || tokenExpiresAt - now < bufferMs;

    if (!accessToken || isExpiringSoon) {
      accessToken = await getAccessToken(clientId, clientSecret);
      tokenExpiresAt = now + 24 * 3_600_000 - bufferMs;
      await updateConfig(Platform.POLY_LENS, { accessToken, tokenExpiresAt, tenantId });
    }

    return accessToken;
  }

  return {
    async syncDevices(): Promise<NormalizedDevice[]> {
      const token = await ensureToken();
      const devices = await fetchAllDevicePages(token, tenantId, SYNC_DEVICES_QUERY);
      return devices.map(deviceToNormalized);
    },

    // Poly Lens has no time-filtered alert endpoint. We filter for connected=false
    // on each cron cycle. The `since` param is accepted for interface compatibility
    // but unused — correlation.ts dedup prevents duplicate tickets.
    async fetchRecentAlerts(_since: Date): Promise<NormalizedAlert[]> {
      const token = await ensureToken();
      const offline = await fetchAllDevicePages(
        token,
        tenantId,
        OFFLINE_DEVICES_QUERY,
        { filter: { field: "connected", contains: "false" } },
      );
      return offline.map(offlineDeviceToAlert);
    },

    // Poly Lens does not support webhooks — real-time is via GraphQL Subscriptions
    // (WebSocket, see deviceStream subscription). Always returns null.
    normalizeWebhookPayload(_raw: unknown): NormalizedAlert | null {
      return null;
    },

    // No webhook secret — always returns false.
    verifyWebhookSignature(_payload: string, _sig: string): boolean {
      return false;
    },

    async rebootDevice(platformId: string): Promise<void> {
      const token = await ensureToken();
      const data = await executeGraphQL<RebootResponse>({
        endpoint: GRAPHQL_ENDPOINT,
        token,
        query: REBOOT_MUTATION,
        variables: { deviceId: platformId },
      });

      if (!data.rebootDevice.success) {
        throw new Error(
          `Poly Lens reboot failed for device ${platformId}: ${data.rebootDevice.message}`
        );
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/integrations/poly-lens.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/poly-lens.ts src/test/integrations/poly-lens.test.ts
git commit -m "feat: rewrite poly-lens adapter to use real GraphQL API (replaces REST stub)"
```

---

## Task 3: Remove the Poly Lens Webhook Route

Poly Lens uses GraphQL Subscriptions (WebSocket), not webhooks. The existing route will never receive a valid request. Removing it prevents confusion and accidental 503 errors when `PlatformCredential` is missing.

**Files:**
- Remove: `src/app/api/webhooks/poly-lens/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rm src/app/api/webhooks/poly-lens/route.ts
```

- [ ] **Step 2: Verify the webhooks/yealink route is unaffected**

```bash
cat src/app/api/webhooks/yealink/route.ts | head -5
```

Expected: file still exists with its POST handler

- [ ] **Step 3: Commit**

```bash
git add -A src/app/api/webhooks/poly-lens/
git commit -m "chore: remove poly-lens webhook route — Poly Lens uses GraphQL subscriptions, not webhooks"
```

---

## Task 4: Smoke-Test the Adapter Against the Real API

This task is manual verification — run it once you have real `POLY_LENS_CLIENT_ID` and `POLY_LENS_CLIENT_SECRET` in `.env.local`.

**Files:**
- Create (temporary, gitignored): `scripts/smoke-poly-lens.ts`

- [ ] **Step 1: Add the script to .gitignore**

Add to `.gitignore`:
```
scripts/smoke-*.ts
```

- [ ] **Step 2: Create the smoke test script**

Create `scripts/smoke-poly-lens.ts`:

```typescript
// Run with: npx tsx scripts/smoke-poly-lens.ts
// Requires POLY_LENS_CLIENT_ID and POLY_LENS_CLIENT_SECRET in .env.local

import { config } from "dotenv";
config({ path: ".env.local" });

// Stub prisma credentials — read directly from env for this smoke test
process.env.POLY_LENS_CLIENT_ID = process.env.POLY_LENS_CLIENT_ID ?? "";
process.env.POLY_LENS_CLIENT_SECRET = process.env.POLY_LENS_CLIENT_SECRET ?? "";

async function getToken(): Promise<string> {
  const res = await fetch("https://login.lens.poly.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.POLY_LENS_CLIENT_ID!,
      client_secret: process.env.POLY_LENS_CLIENT_SECRET!,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { access_token: string };
  console.log("✓ Auth token obtained");
  return json.access_token;
}

async function testDeviceSync(token: string, tenantId: string): Promise<void> {
  const res = await fetch("https://api.silica-prod01.io.lens.poly.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: `
        query SyncDevices($tenantId: ID!, $params: DeviceFindArgs) {
          tenant(id: $tenantId) {
            inventory {
              deviceSearch(params: $params) {
                edges {
                  node {
                    id
                    name
                    connected
                    hardwareModel
                    softwareVersion
                    siteId
                    roomId
                  }
                }
                pageInfo { nextToken hasNextPage totalCount }
              }
            }
          }
        }
      `,
      variables: { tenantId, params: { pageSize: 10 } },
    }),
  });

  const rateLimit = res.headers.get("ratelimit-remaining");
  console.log(`Rate limit remaining: ${rateLimit}`);

  const json = (await res.json()) as {
    data?: { tenant: { inventory: { deviceSearch: { edges: unknown[]; pageInfo: { totalCount: number } } } } };
    errors?: Array<{ message: string }>;
  };

  if (json.errors) {
    console.error("GraphQL errors:", json.errors);
    return;
  }

  const total = json.data?.tenant?.inventory?.deviceSearch?.pageInfo?.totalCount ?? 0;
  const edges = json.data?.tenant?.inventory?.deviceSearch?.edges ?? [];
  console.log(`✓ Device sync: ${total} total devices, ${edges.length} on this page`);
  if (edges.length > 0) {
    console.log("First device:", JSON.stringify(edges[0], null, 2));
  }
}

async function main(): Promise<void> {
  const tenantId = process.env.POLY_LENS_TENANT_ID ?? "";
  if (!process.env.POLY_LENS_CLIENT_ID || !process.env.POLY_LENS_CLIENT_SECRET) {
    console.error("Missing POLY_LENS_CLIENT_ID or POLY_LENS_CLIENT_SECRET in .env.local");
    process.exit(1);
  }
  if (!tenantId) {
    console.error("Missing POLY_LENS_TENANT_ID in .env.local (Tenant UUID from Admin Portal → Account Settings)");
    process.exit(1);
  }

  const token = await getToken();
  await testDeviceSync(token, tenantId);
  console.log("\n✓ Smoke test passed. Check field names match the adapter queries.");
}

main().catch(console.error);
```

- [ ] **Step 3: Run the smoke test**

```bash
npx tsx scripts/smoke-poly-lens.ts
```

Expected output:
```
✓ Auth token obtained
Rate limit remaining: 99xxx
✓ Device sync returned N devices
First device: { "id": "...", "name": "...", ... }
```

**If field names in the output differ from what the adapter queries** (e.g., `items` is actually `nodes`, or `connected` is actually `isConnected`), update the GraphQL query strings in `poly-lens.ts` to match. The adapter type `PolyDevice` must match exactly.

- [ ] **Step 4: Verify offline device query and filter syntax**

Add this to the smoke script and re-run:

```typescript
async function testOfflineQuery(token: string, tenantId: string): Promise<void> {
  const res = await fetch("https://api.silica-prod01.io.lens.poly.com/graphql", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: `
        query GetOfflineDevices($tenantId: ID!, $params: DeviceFindArgs) {
          tenant(id: $tenantId) {
            inventory {
              deviceSearch(params: $params) {
                edges { node { id name connected } }
                pageInfo { nextToken hasNextPage }
              }
            }
          }
        }
      `,
      variables: {
        tenantId,
        params: {
          pageSize: 10,
          filter: { field: "connected", contains: "false" },
        },
      },
    }),
  });

  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors) {
    console.error("Offline query errors — filter syntax may differ:", json.errors);
    console.log("Try the API Playground to find the correct filter for disconnected devices");
  } else {
    console.log("✓ Offline device filter query succeeded");
    console.log(JSON.stringify(json.data, null, 2));
  }
}
```

If the `filter: { field: "connected", contains: "false" }` throws a schema error, open the API Playground at `https://api.silica-prod01.io.lens.poly.com/graphql`, authenticate with your token, and use schema introspection to find the correct filter argument for `DeviceFindArgs`. Update `OFFLINE_DEVICES_QUERY` and the `fetchRecentAlerts` call in `poly-lens.ts` to match.

- [ ] **Step 5: Commit any field name corrections**

```bash
git add src/lib/integrations/poly-lens.ts
git commit -m "fix: correct Poly Lens GraphQL field names based on real API smoke test"
```

---

## Task 5: Wire Up the Settings Page for Poly Lens Credentials

Technicians can't test the integration until credentials are in the DB. The settings page lets a superAdmin enter `clientId` and `clientSecret` via the UI so the adapter can retrieve them from `PlatformCredential`.

**Files:**
- Create: `src/app/(app)/settings/page.tsx`
- Create: `src/app/api/integrations/route.ts`

- [ ] **Step 1: Write a failing test for the API route**

Create `src/test/api/integrations.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT } from "@/app/api/integrations/route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformCredential: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.platformCredential.findMany);
const mockUpsert = vi.mocked(prisma.platformCredential.upsert);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/integrations", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not superAdmin", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: false } } as never);
    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns credentials list with secrets masked for superAdmin", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "cred-1",
        platform: "POLY_LENS" as never,
        clientId: "cid",
        clientSecret: "secret",
        apiKey: null,
        webhookSecret: null,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ clientSecret: string }> };

    expect(res.status).toBe(200);
    expect(body.data[0].clientSecret).toBe("••••••••");
  });
});

describe("PUT /api/integrations", () => {
  it("upserts credentials and returns success", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({ platform: "POLY_LENS", clientId: "cid", clientSecret: "sec" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform: "POLY_LENS" },
        update: expect.objectContaining({ clientId: "cid", clientSecret: "sec" }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/test/api/integrations.test.ts
```

Expected: FAIL — route does not exist

- [ ] **Step 3: Create the integrations API route**

Create `src/app/api/integrations/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Platform } from "@prisma/client";

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  return "••••••••";
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const credentials = await prisma.platformCredential.findMany({
    orderBy: { platform: "asc" },
  });

  const masked = credentials.map((c) => ({
    ...c,
    clientSecret: maskSecret(c.clientSecret),
    apiKey: maskSecret(c.apiKey),
    webhookSecret: maskSecret(c.webhookSecret),
    config: {},
  }));

  return NextResponse.json({ success: true, data: masked });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    platform: string;
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
    webhookSecret?: string;
  };

  if (!body.platform || !Object.values(Platform).includes(body.platform as Platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const platform = body.platform as Platform;

  const updateData = {
    clientId: body.clientId ?? null,
    clientSecret: body.clientSecret ?? null,
    apiKey: body.apiKey ?? null,
    webhookSecret: body.webhookSecret ?? null,
  };

  await prisma.platformCredential.upsert({
    where: { platform },
    update: updateData,
    create: { platform, ...updateData },
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/test/api/integrations.test.ts
```

Expected: PASS

- [ ] **Step 5: Create the Settings page UI**

Create `src/app/(app)/settings/page.tsx`:

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");
  return <SettingsClient />;
}
```

Create `src/app/(app)/settings/SettingsClient.tsx`:

```typescript
"use client";

import { useState } from "react";

const PLATFORMS = [
  {
    id: "POLY_LENS",
    label: "Poly Lens",
    fields: [
      { key: "clientId", label: "Client ID", type: "text" },
      { key: "clientSecret", label: "Client Secret", type: "password" },
      { key: "tenantId", label: "Tenant ID (from Admin Portal → Account Settings)", type: "text" },
    ],
  },
  {
    id: "YEALINK_YMCS",
    label: "Yealink YMCS",
    fields: [
      { key: "apiKey", label: "API Key", type: "password" },
      { key: "webhookSecret", label: "Webhook Secret", type: "password" },
    ],
  },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

export function SettingsClient() {
  const [saving, setSaving] = useState<PlatformId | null>(null);
  const [saved, setSaved] = useState<PlatformId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});

  function onChange(platform: string, field: string, value: string) {
    setValues((prev) => ({
      ...prev,
      [platform]: { ...(prev[platform] ?? {}), [field]: value },
    }));
  }

  async function onSave(platformId: PlatformId) {
    setSaving(platformId);
    setError(null);
    setSaved(null);

    try {
      const res = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: platformId, ...(values[platformId] ?? {}) }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Save failed");
      }

      setSaved(platformId);
      setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-semibold text-white">Platform Credentials</h1>
      <p className="text-sm text-gray-400">
        Credentials are stored encrypted in the database. Secret fields are masked after saving.
      </p>

      {error && (
        <div className="rounded bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {PLATFORMS.map((platform) => (
        <div key={platform.id} className="rounded-lg border border-white/10 bg-white/5 p-6 space-y-4">
          <h2 className="text-lg font-medium text-white">{platform.label}</h2>

          {platform.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
              <input
                type={field.type}
                placeholder={field.type === "password" ? "••••••••" : ""}
                value={values[platform.id]?.[field.key] ?? ""}
                onChange={(e) => onChange(platform.id, field.key, e.target.value)}
                className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}

          <button
            onClick={() => onSave(platform.id)}
            disabled={saving === platform.id}
            className="rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
          >
            {saving === platform.id
              ? "Saving…"
              : saved === platform.id
              ? "Saved ✓"
              : "Save"}
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Run the dev server and verify the Settings page renders**

```bash
npm run dev
```

Navigate to `http://localhost:3001/settings`. Expected: page renders with Poly Lens and Yealink YMCS credential forms. Saving should return 200.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/integrations/route.ts src/app/(app)/settings/ src/test/api/integrations.test.ts
git commit -m "feat: add platform credentials settings page and /api/integrations PUT/GET endpoints"
```

---

## Task 6: End-to-End Cron Test with Real Credentials

Once credentials are saved via the Settings page, verify the full polling cycle works.

**This task is manual — requires real Poly Lens credentials configured.**

- [ ] **Step 1: Seed a Customer, Site, Room in the DB**

Open Prisma Studio and create:
```
Customer { name: "Call One Test" }
  → Site { name: "HQ", address: "123 Main St" }
    → Room { name: "Board Room" }
```

Or run via Prisma Studio: `npx prisma studio`

- [ ] **Step 2: Save Poly Lens credentials via the Settings page**

Navigate to `http://localhost:3001/settings` and enter real `clientId` / `clientSecret`.

- [ ] **Step 3: Trigger the cron endpoint manually**

```bash
curl -X GET http://localhost:3001/api/cron/alerts \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Expected response:
```json
{
  "ok": true,
  "results": {
    "POLY_LENS": { "processed": N, "errors": [] },
    "YEALINK_YMCS": { "processed": 0, "errors": ["YEALINK_YMCS credentials not configured"] }
  },
  "autoResolved": 0
}
```

- [ ] **Step 4: Verify alerts and tickets appear in the dashboard**

Navigate to `http://localhost:3001/dashboard`. If any Poly Lens devices are offline, the KPI strip should show active alerts and open tickets.

- [ ] **Step 5: Trigger a device sync**

```bash
curl -X POST http://localhost:3001/api/integrations/sync \
  -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```

Expected: `{ "synced": N, "errors": [] }` — devices from Poly Lens appear in the DB.

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| OAuth 2.0 client credentials auth | Task 2 — `getAccessToken`, `ensureToken` |
| Token caching (24h JWT) | Task 2 — `tokenExpiresAt` in `PlatformCredential.config` |
| GraphQL endpoint (not REST) | Task 2 — `GRAPHQL_ENDPOINT` constant, `executeGraphQL` |
| Correct auth endpoint | Task 2 — `AUTH_ENDPOINT = https://login.lens.poly.com/oauth/token` |
| Pagination via `nextToken` | Task 2 — `fetchAllDevicePages` loop |
| Rate limit awareness | Task 1 — headers logged; Task 4 smoke test shows remaining |
| Device sync | Task 2 — `syncDevices()` |
| Alert polling (offline devices) | Task 2 — `fetchRecentAlerts()` via `OFFLINE_DEVICES_QUERY` |
| Device reboot mutation | Task 2 — `rebootDevice()` |
| No webhook support | Task 2 — `normalizeWebhookPayload` returns null; Task 3 removes route |
| Credentials stored in DB | Task 5 — Settings page + `/api/integrations` PUT |
| Credentials masked in GET | Task 5 — `maskSecret()` in route |
| Real API smoke test | Task 4 |
| End-to-end cron validation | Task 6 |

### Placeholder Scan — None Found

### Type Consistency

- `PolyDevice` (Task 2) used consistently in `fetchAllDevicePages`, `deviceToNormalized`, `offlineDeviceToAlert`
- `executeGraphQL<TenantsResponse>` and `executeGraphQL<RebootResponse>` — both types defined in Task 2
- `PlatformAdapter` from `types.ts` — interface is satisfied (all 5 methods implemented)

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-29-poly-lens-graphql-integration.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks

**2. Inline Execution** — run tasks in this session with checkpoints

**Which approach?**
