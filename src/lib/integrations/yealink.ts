import crypto from "crypto";
import { Platform, AlertSeverity } from "@prisma/client";
import { NormalizedAlert, NormalizedDevice, PlatformAdapter, DeviceStatus } from "./types";
import { getCredential, updateConfig } from "./credentials";
import { acquireYmcsToken, ymcsPost } from "./ymcs-client";

interface YmcsDevice {
  id: string;
  mac: string;
  sn: string;
  name: string;
  modelId: string;
  siteId: string;
  programVersion: string;
  deviceStatus: string;
}

interface YmcsAlarm {
  id: string;
  event: string;
  level: number;
  mac: string;
  model: string;
  ip: string;
  siteName: string;
  status: number;
  firstAlarmTime: number;
  lastAlarmTime: number;
}

interface YmcsRebootResponse {
  total: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ field: string; msg: string }>;
}

function regionToBaseUrl(region: string): string {
  const r = region.toLowerCase();
  if (r === "eu") return "https://eu-api.ymcs.yealink.com";
  if (r === "au") return "https://au-api.ymcs.yealink.com";
  return "https://us-api.ymcs.yealink.com";
}

function toDeviceStatus(ymcsStatus: string): DeviceStatus {
  if (ymcsStatus === "online") return "online";
  if (ymcsStatus === "offline") return "offline";
  return "unknown";
}

function levelToSeverity(level: number): AlertSeverity {
  if (level >= 3) return AlertSeverity.CRITICAL;
  if (level === 2) return AlertSeverity.HIGH;
  return AlertSeverity.MEDIUM;
}

async function fetchAllPages<T>(
  baseUrl: string,
  path: string,
  token: string,
  filter: Record<string, unknown> = {}
): Promise<T[]> {
  const results: T[] = [];
  let skip = 0;
  const limit = 100;
  let total: number | undefined;

  do {
    const page = await ymcsPost<{ skip: number; limit: number; total: number; data: T[] }>(
      baseUrl,
      path,
      token,
      { skip, limit, autoCount: skip === 0, filter }
    );
    results.push(...page.data);
    skip += page.data.length;

    if (total === undefined) {
      total = page.total;
    }

    // Stop when we have no more items or we've collected everything
    if (page.data.length === 0) break;
    if (total !== undefined && skip >= total) break;
  } while (true);

  return results;
}

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
      const devices = await fetchAllPages<YmcsDevice>(baseUrl, "/v2/dm/listDevices", token, {});

      return devices.map((d): NormalizedDevice => ({
        platform: Platform.YEALINK_YMCS,
        platformId: d.id,
        name: d.name,
        model: d.modelId || undefined,
        firmware: d.programVersion || undefined,
        // Lowercased so correlation.ts can MAC-match alarms with exact equality
        macAddress: d.mac ? d.mac.toLowerCase() : undefined,
        status: toDeviceStatus(d.deviceStatus),
        rawPayload: d,
      }));
    },

    async fetchRecentAlerts(_since: Date): Promise<NormalizedAlert[]> {
      const token = await ensureToken();
      // YMCS listAlarms has no time-range filter — we fetch all alarms and filter
      // status=1 in JS. correlation.ts dedup prevents re-processing old alarms.
      const allAlarms = await fetchAllPages<YmcsAlarm>(baseUrl, "/v2/dm/listAlarms", token, {});
      const activeAlarms = allAlarms.filter((a) => a.status === 1);

      return activeAlarms.map((a): NormalizedAlert => ({
        platform: Platform.YEALINK_YMCS,
        platformAlertId: a.id,
        // YMCS alarms only carry the device MAC, not the YMCS device UUID that
        // syncDevices stores as platformId. correlation.ts will not find a device
        // match for these alerts (deviceId will be null on the resulting ticket).
        // Phase 2 fix: add MAC-based device lookup in correlation.ts.
        platformDeviceId: a.mac,
        severity: levelToSeverity(a.level),
        title: `${a.event}: ${a.model || "Device"} (${a.mac})`,
        description: a.siteName ? `Site: ${a.siteName}` : undefined,
        rawPayload: a,
        receivedAt: new Date(a.firstAlarmTime),
      }));
    },

    verifyWebhookSignature(_payload: string, sig: string): boolean {
      if (!webhookSecret || !sig) return false;
      // Pad both buffers to a fixed size so timingSafeEqual runs unconditionally,
      // preventing length-based timing side-channels.
      const a = Buffer.alloc(256);
      const b = Buffer.alloc(256);
      Buffer.from(sig).copy(a);
      Buffer.from(webhookSecret).copy(b);
      return crypto.timingSafeEqual(a, b);
    },

    normalizeWebhookPayload(_raw: unknown): NormalizedAlert | null {
      return null;
    },

    async rebootDevice(platformId: string): Promise<void> {
      const token = await ensureToken();
      const result = await ymcsPost<YmcsRebootResponse>(
        baseUrl,
        "/v2/dm/device/reboot",
        token,
        { deviceIds: [platformId], deviceType: 1 }
      );

      if (result.failureCount > 0) {
        const firstError = result.errors[0];
        throw new Error(firstError?.msg ?? `YMCS reboot failed for device ${platformId}`);
      }
    },
  };
}
