import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential, updateConfig } from "./credentials";
import { executeGraphQL } from "./graphql-client";

const AUTH_ENDPOINT = "https://login.lens.poly.com/oauth/token";
const GRAPHQL_ENDPOINT = "https://api.silica-prod01.io.lens.poly.com/graphql";

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
              site { id name }
              room { id name }
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
              site { id }
              room { id }
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

interface PolyDevice {
  id: string;
  name: string;
  connected: boolean;
  hardwareModel: string | null;
  softwareVersion: string | null;
  macAddress: string | null;
  site: { id: string; name: string } | null;
  room: { id: string } | null;
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

function toDeviceStatus(connected: boolean): DeviceStatus {
  return connected ? "online" : "offline";
}

async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresInMs: number }> {
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
  return {
    accessToken: json.access_token,
    expiresInMs: json.expires_in * 1000,
  };
}

// Fetches all pages of a device query, following nextToken pagination.
// Poly Lens uses Relay-style edges/node rather than items arrays.
async function fetchAllDevicePages(
  token: string,
  tenantId: string,
  query: string,
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
        params: { pageSize: 500, nextToken },
      },
    });

    const page: DevicesPage = data.tenant.inventory.deviceSearch;
    devices.push(...page.edges.map((e: DeviceEdge) => e.node));
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
      const result = await getAccessToken(clientId, clientSecret);
      accessToken = result.accessToken;
      tokenExpiresAt = now + result.expiresInMs - bufferMs;
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

    // Poly Lens has no time-filtered alert endpoint. We fetch all devices and
    // post-filter for connected=false in JS on each cron cycle. The `since`
    // param is accepted for interface compatibility but unused — correlation.ts
    // dedup prevents duplicate tickets.
    async fetchRecentAlerts(_since: Date): Promise<NormalizedAlert[]> {
      const token = await ensureToken();
      const allDevices = await fetchAllDevicePages(token, tenantId, OFFLINE_DEVICES_QUERY);
      const offline = allDevices.filter((d) => !d.connected);
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
