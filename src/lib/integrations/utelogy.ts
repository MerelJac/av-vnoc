import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential } from "./credentials";

interface UtelogyConfig {
  baseUrl: string;
  apiKey: string;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readConfig(apiKey: string | null, raw: unknown): UtelogyConfig {
  const config = (raw ?? {}) as Record<string, unknown>;
  const baseUrl = typeof config.baseUrl === "string" ? config.baseUrl.replace(/\/$/, "") : "";

  if (!apiKey || !baseUrl || !isHttpUrl(baseUrl)) {
    throw new Error(
      "Utelogy requires an apiKey and a valid instance baseUrl (https://<tenant>.utelogy.com)"
    );
  }
  return { baseUrl, apiKey };
}

function toStatus(value: unknown): DeviceStatus {
  if (value === "online" || value === "connected") return "online";
  if (value === "offline" || value === "disconnected") return "offline";
  return "unknown";
}

async function utelogyGet<T>(cfg: UtelogyConfig, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Utelogy GET ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// TODO(verify): confirm the endpoint path and field names against the Utelogy
// U-API docs / a live response once credentials are available. All endpoint
// mapping is isolated here, exactly like logitech-sync.ts.
async function fetchDevicesRaw(cfg: UtelogyConfig): Promise<Array<Record<string, unknown>>> {
  const res = await utelogyGet<{ devices?: Array<Record<string, unknown>> }>(
    cfg,
    "/api/v1/devices"
  );
  return res.devices ?? [];
}

export async function createUtelogyAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential(Platform.UTELOGY);
  if (!cred) throw new Error("Utelogy credentials not configured");
  const cfg = readConfig(cred.apiKey, cred.config);

  async function syncDevices(): Promise<NormalizedDevice[]> {
    const raw = await fetchDevicesRaw(cfg);
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
    // No verified alert feed yet — derive alerts from currently-offline
    // devices; the correlation engine dedups repeats (same as Logitech Sync).
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
    // Polling-only adapter: no verified webhook support in U-API.
    normalizeWebhookPayload: () => null,
    verifyWebhookSignature: () => false,
    rebootDevice: async () => {
      // TODO(verify): implement if the U-API exposes a device command endpoint.
      throw new Error("Reboot not supported for Utelogy");
    },
  };
}
