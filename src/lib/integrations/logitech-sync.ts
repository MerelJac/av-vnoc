import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential } from "./credentials";
import { createLogiSyncClient, LogiSyncClient } from "./logi-sync-client";
import { logWarn } from "@/lib/logger";

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

interface LogiPlace {
  id?: unknown;
  name?: unknown;
  devices?: Array<Record<string, unknown>>;
}

// Device discovery. `GET /places` is the endpoint verified by the Sync API
// quick-start guide (spec: docs/superpowers/specs/2026-06-10-logitech-sync-
// api-verification.md); devices commonly arrive embedded under each place.
// `/devices` is still attempted as a fallback but its failure is tolerated
// when places already produced devices.
// TODO(verify): finalize field names against the Sync Portal OpenAPI spec.
async function fetchDevicesRaw(client: LogiSyncClient): Promise<Array<Record<string, unknown>>> {
  const placesRes = await client.get<{ places?: LogiPlace[] }>("/places");
  const places = placesRes.places ?? [];

  const byId = new Map<string, Record<string, unknown>>();
  for (const place of places) {
    for (const device of place.devices ?? []) {
      const id = String(device.id);
      if (!byId.has(id)) {
        byId.set(id, {
          ...device,
          __placeName: typeof place.name === "string" ? place.name : undefined,
        });
      }
    }
  }

  try {
    const res = await client.get<{ devices?: Array<Record<string, unknown>> }>("/devices");
    for (const device of res.devices ?? []) {
      const id = String(device.id);
      if (!byId.has(id)) byId.set(id, device);
    }
  } catch (err) {
    // Endpoint unverified by the quick-start guide — tolerate its absence
    // when the places response already carried the device inventory.
    if (byId.size === 0) throw err;
    logWarn("integrations:logitech", "/devices endpoint failed; using place-embedded devices", {
      error: err as Error,
      placeDevices: byId.size,
    });
  }

  return Array.from(byId.values());
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
