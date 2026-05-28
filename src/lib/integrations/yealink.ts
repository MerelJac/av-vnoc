import crypto from "crypto";
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential } from "./credentials";

const API_BASE = process.env.YEALINK_API_BASE ?? "https://open.ymcs.yealink.com";

const ALERT_EVENT_TYPES = new Set([
  "device.offline",
  "device.critical",
  "device.warning",
  "device.fault",
]);

function yealinkEventToSeverity(eventType: string): AlertSeverity | null {
  if (eventType === "device.offline") return AlertSeverity.HIGH;
  if (eventType === "device.critical") return AlertSeverity.CRITICAL;
  if (eventType === "device.warning") return AlertSeverity.MEDIUM;
  if (eventType === "device.fault") return AlertSeverity.MEDIUM;
  return null;
}

function toDeviceStatus(status: string): DeviceStatus {
  const lower = status.toLowerCase();
  if (lower === "online") return "online";
  if (lower === "offline") return "offline";
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createYealinkAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential(Platform.YEALINK_YMCS);

  if (!cred) {
    throw new Error("YEALINK_YMCS credentials not configured");
  }

  const apiKey = cred.apiKey;
  const webhookSecret = cred.webhookSecret ?? undefined;

  if (!apiKey) {
    throw new Error("YEALINK_YMCS apiKey is required");
  }

  return {
    async syncDevices(): Promise<NormalizedDevice[]> {
      const res = await fetch(`${API_BASE}/v1/devices?pageSize=500`, {
        headers: { "X-Api-Key": apiKey },
      });

      if (!res.ok) {
        throw new Error(`Yealink syncDevices failed: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as Record<string, unknown>;
      const items = (json.devices ?? json.data ?? []) as Record<string, unknown>[];

      return items.map((d): NormalizedDevice => ({
        platform: Platform.YEALINK_YMCS,
        platformId: String(d.deviceId ?? d.id),
        name: String(d.deviceName ?? d.name ?? d.deviceId ?? d.id),
        model: d.model != null ? String(d.model) : undefined,
        firmware: d.firmwareVersion != null ? String(d.firmwareVersion) : undefined,
        ipAddress: d.ipAddress != null ? String(d.ipAddress) : undefined,
        macAddress: d.macAddress != null ? String(d.macAddress) : undefined,
        status: toDeviceStatus(String(d.status ?? "unknown")),
        lastSeenAt: d.lastSeen != null ? new Date(String(d.lastSeen)) : undefined,
        rawPayload: d,
      }));
    },

    async fetchRecentAlerts(since: Date): Promise<NormalizedAlert[]> {
      const eventTypesParam = Array.from(ALERT_EVENT_TYPES).join(",");
      const res = await fetch(
        `${API_BASE}/v1/events?startTime=${since.getTime()}&eventTypes=${eventTypesParam}&pageSize=200`,
        { headers: { "X-Api-Key": apiKey } },
      );

      if (!res.ok) {
        throw new Error(`Yealink fetchRecentAlerts failed: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as Record<string, unknown>;
      const items = (json.events ?? json.data ?? []) as Record<string, unknown>[];

      const alerts: NormalizedAlert[] = [];
      for (const e of items) {
        const eventType = String(e.eventType ?? "");
        const severity = yealinkEventToSeverity(eventType);
        if (severity === null) continue;

        const device = isRecord(e.device) ? e.device : {};
        const deviceId = String(device.deviceId ?? device.id ?? "");
        const deviceName = String(device.deviceName ?? device.name ?? deviceId);

        alerts.push({
          platform: Platform.YEALINK_YMCS,
          platformAlertId: String(e.eventId ?? e.id ?? ""),
          platformDeviceId: deviceId,
          severity,
          title: `${eventType}: ${deviceName}`,
          rawPayload: e,
          receivedAt: new Date(),
        });
      }

      return alerts;
    },

    normalizeWebhookPayload(raw: unknown): NormalizedAlert | null {
      if (!isRecord(raw)) return null;

      const eventType = String(raw.eventType ?? "");
      if (!ALERT_EVENT_TYPES.has(eventType)) return null;

      const severity = yealinkEventToSeverity(eventType);
      if (severity === null) return null;

      const device = isRecord(raw.device) ? raw.device : {};
      const deviceId = String(device.deviceId ?? device.id ?? "");
      const deviceName = String(device.deviceName ?? device.name ?? deviceId ?? "Unknown device");

      return {
        platform: Platform.YEALINK_YMCS,
        platformAlertId: String(raw.eventId ?? ""),
        platformDeviceId: deviceId,
        severity,
        title: `${eventType}: ${deviceName}`,
        rawPayload: raw,
        receivedAt: raw.occurredAt != null ? new Date(String(raw.occurredAt)) : new Date(),
      };
    },

    verifyWebhookSignature(payload: string, sig: string): boolean {
      if (!webhookSecret) return false;

      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      if (sig.length !== expected.length) return false;

      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    },

    async rebootDevice(platformId: string): Promise<void> {
      const res = await fetch(`${API_BASE}/v1/devices/${platformId}/reboot`, {
        method: "POST",
        headers: { "X-Api-Key": apiKey },
      });

      if (!res.ok) {
        throw new Error(`Yealink rebootDevice failed for ${platformId}: ${res.status} ${res.statusText}`);
      }
    },
  };
}
