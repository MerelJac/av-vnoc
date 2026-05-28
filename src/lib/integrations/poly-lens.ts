import crypto from "crypto";
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential, updateConfig } from "./credentials";

const API_BASE = process.env.POLY_LENS_API_BASE ?? "https://api.lens.poly.com";

const ALERT_EVENT_TYPES = new Set(["device.status.changed", "device.alert.created"]);

function statusToSeverity(status: string): AlertSeverity | null {
  switch (status.toLowerCase()) {
    case "offline":
      return AlertSeverity.HIGH;
    case "critical":
      return AlertSeverity.CRITICAL;
    case "warning":
      return AlertSeverity.MEDIUM;
    default:
      return null;
  }
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

async function getAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Poly Lens token request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  return json.access_token as string;
}

export async function createPolyLensAdapter(): Promise<PlatformAdapter> {
  const cred = await getCredential(Platform.POLY_LENS);

  if (!cred) {
    throw new Error("POLY_LENS credentials not configured");
  }

  const resolvedCred = cred;
  const config = (resolvedCred.config as Record<string, unknown>) ?? {};
  let accessToken = config.accessToken as string | undefined;
  let tokenExpiresAt = config.tokenExpiresAt as number | undefined;
  const webhookSecret = resolvedCred.webhookSecret ?? undefined;

  async function ensureToken(): Promise<string> {
    const now = Date.now();
    const isExpiringSoon = !tokenExpiresAt || tokenExpiresAt - now < 60_000;

    if (!accessToken || isExpiringSoon) {
      if (!resolvedCred.clientId || !resolvedCred.clientSecret) {
        throw new Error("POLY_LENS clientId and clientSecret are required for token refresh");
      }
      accessToken = await getAccessToken(resolvedCred.clientId, resolvedCred.clientSecret);
      tokenExpiresAt = now + 3_600_000;
      await updateConfig(Platform.POLY_LENS, { accessToken, tokenExpiresAt });
    }

    return accessToken;
  }

  return {
    async syncDevices(): Promise<NormalizedDevice[]> {
      const token = await ensureToken();
      const res = await fetch(`${API_BASE}/v2/devices?limit=500`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Poly Lens syncDevices failed: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as Record<string, unknown>;
      const items = (json.devices ?? json.items ?? []) as Record<string, unknown>[];

      return items.map((d): NormalizedDevice => ({
        platform: Platform.POLY_LENS,
        platformId: String(d.id),
        name: String(d.displayName ?? d.name ?? d.id),
        model: d.model != null ? String(d.model) : undefined,
        firmware: d.firmwareVersion != null ? String(d.firmwareVersion) : undefined,
        ipAddress: d.ipAddress != null ? String(d.ipAddress) : undefined,
        macAddress: d.macAddress != null ? String(d.macAddress) : undefined,
        status: toDeviceStatus(String(d.status ?? "unknown")),
        lastSeenAt: d.lastSeenAt != null ? new Date(String(d.lastSeenAt)) : undefined,
        rawPayload: d,
      }));
    },

    async fetchRecentAlerts(since: Date): Promise<NormalizedAlert[]> {
      const token = await ensureToken();
      const res = await fetch(
        `${API_BASE}/v2/alerts?since=${since.toISOString()}&limit=200`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.ok) {
        throw new Error(`Poly Lens fetchRecentAlerts failed: ${res.status} ${res.statusText}`);
      }

      const json = (await res.json()) as Record<string, unknown>;
      const items = (json.alerts ?? json.items ?? []) as Record<string, unknown>[];

      const alerts: NormalizedAlert[] = [];
      for (const a of items) {
        const severity = statusToSeverity(String(a.status ?? ""));
        if (severity === null) continue;

        const device = isRecord(a.device) ? a.device : {};
        const deviceId = String(a.deviceId ?? device.id ?? "");
        const deviceName = String(device.displayName ?? device.name ?? deviceId);

        alerts.push({
          platform: Platform.POLY_LENS,
          platformAlertId: String(a.id ?? a.alertId ?? ""),
          platformDeviceId: deviceId,
          severity,
          title: `Device ${String(a.status ?? "")}: ${deviceName}`,
          description: a.message != null ? String(a.message) : undefined,
          rawPayload: a,
          receivedAt: new Date(),
        });
      }

      return alerts;
    },

    normalizeWebhookPayload(raw: unknown): NormalizedAlert | null {
      if (!isRecord(raw)) return null;

      const eventType = String(raw.eventType ?? "");
      if (!ALERT_EVENT_TYPES.has(eventType)) return null;

      const device = isRecord(raw.device) ? raw.device : {};
      const deviceStatus = String(device.status ?? "");
      const severity = statusToSeverity(deviceStatus);
      if (severity === null) return null;

      const deviceId = String(device.id ?? "");
      const deviceName = String(device.displayName ?? device.name ?? device.id ?? deviceId);

      return {
        platform: Platform.POLY_LENS,
        platformAlertId: String(raw.eventId ?? ""),
        platformDeviceId: deviceId,
        severity,
        title: `Device ${deviceStatus}: ${deviceName}`,
        rawPayload: raw,
        receivedAt: raw.timestamp != null ? new Date(String(raw.timestamp)) : new Date(),
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
      const token = await ensureToken();
      const res = await fetch(`${API_BASE}/v2/devices/${platformId}/reboot`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Poly Lens rebootDevice failed for ${platformId}: ${res.status} ${res.statusText}`);
      }
    },
  };
}
