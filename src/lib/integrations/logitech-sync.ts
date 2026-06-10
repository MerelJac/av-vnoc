import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential } from "./credentials";
import { createLogiSyncClient, LogiSyncClient } from "./logi-sync-client";

const DEFAULT_API_SERVER = "https://api.sync.logitech.com/v1";

interface LogiConfig {
  orgId: string;
  apiServer: string;
  certPem: string;
  keyPem: string;
}

function readConfig(raw: unknown): LogiConfig {
  const c = (raw ?? {}) as Record<string, unknown>;
  const orgId = typeof c.orgId === "string" ? c.orgId : "";
  const certPem = typeof c.certPem === "string" ? c.certPem : "";
  const keyPem = typeof c.keyPem === "string" ? c.keyPem : "";
  const apiServer =
    typeof c.apiServer === "string" && c.apiServer ? c.apiServer : DEFAULT_API_SERVER;
  if (!orgId || !certPem || !keyPem) {
    throw new Error(
      "Logitech Sync requires orgId, certificate (certPem) and private key (keyPem)"
    );
  }
  return { orgId, certPem, keyPem, apiServer };
}

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
    return raw.map((d): NormalizedDevice => ({
      platform: Platform.LOGITECH_SYNC,
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
    // Sync Cloud has no time-filtered alert feed or webhooks; derive alerts
    // from currently-offline devices — the correlation engine dedups repeats.
    const devices = await syncDevices();
    return devices
      .filter((d) => d.status === "offline")
      .map((d): NormalizedAlert => ({
        platform: Platform.LOGITECH_SYNC,
        platformAlertId: `offline-${d.platformId}`,
        platformDeviceId: d.platformId,
        severity: AlertSeverity.CRITICAL,
        title: `${d.name} offline`,
        description: `Logitech Sync reports ${d.name} as offline`,
        rawPayload: d.rawPayload,
        receivedAt: new Date(),
      }));
  }

  return {
    syncDevices,
    fetchRecentAlerts,
    // Polling-only adapter: Sync Cloud offers no webhooks.
    normalizeWebhookPayload: () => null,
    verifyWebhookSignature: () => false,
    rebootDevice: async () => {
      // TODO(verify): implement if the OpenAPI spec exposes a device command endpoint.
      throw new Error("Reboot not supported for Logitech Sync");
    },
  };
}
