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

const PLATFORM_VALUES = new Set<string>([
  "POLY_LENS",
  "YEALINK_YMCS",
  "NEAT_PULSE",
  "LOGITECH_SYNC",
  "CISCO_CONTROL_HUB",
  "UTELOGY",
]);

const ALERT_SEVERITY_VALUES = new Set<string>([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNormalizedAlert(value: unknown): value is NormalizedAlert {
  if (!isRecord(value)) return false;

  return (
    typeof value.platform === "string" &&
    PLATFORM_VALUES.has(value.platform) &&
    typeof value.platformAlertId === "string" &&
    typeof value.platformDeviceId === "string" &&
    typeof value.severity === "string" &&
    ALERT_SEVERITY_VALUES.has(value.severity) &&
    typeof value.title === "string" &&
    "rawPayload" in value &&
    value.receivedAt instanceof Date
  );
}

const DEVICE_STATUS_VALUES = new Set<string>(["online", "offline", "unknown"]);

export function isNormalizedDevice(value: unknown): value is NormalizedDevice {
  if (!isRecord(value)) return false;

  return (
    typeof value.platform === "string" &&
    PLATFORM_VALUES.has(value.platform) &&
    typeof value.platformId === "string" &&
    typeof value.name === "string" &&
    typeof value.status === "string" &&
    DEVICE_STATUS_VALUES.has(value.status) &&
    "rawPayload" in value
  );
}
