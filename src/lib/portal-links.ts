import { Platform } from "@prisma/client";

export interface PortalLinkContext {
  platform: Platform;
  platformId: string;
  deviceRawPayload: unknown;
  credentialConfig: Record<string, unknown> | null; // PlatformCredential.config — SERVER ONLY
}

export interface PortalLink {
  url: string;
  isDeepLink: boolean;
  label: string;
}

const PLATFORM_LABELS: Record<Platform, string> = {
  POLY_LENS: "Poly Lens",
  YEALINK_YMCS: "Yealink YMCS",
  NEAT_PULSE: "Neat Pulse",
  LOGITECH_SYNC: "Logitech Sync",
  CISCO_CONTROL_HUB: "Cisco Control Hub",
  UTELOGY: "Utelogy",
};

// Portal front doors — the graceful fallback when we cannot build a device link.
const PORTAL_HOME: Record<Platform, string> = {
  POLY_LENS: "https://lens.poly.com",
  YEALINK_YMCS: "https://ymcs.yealink.com",
  NEAT_PULSE: "https://pulse.neat.no",
  LOGITECH_SYNC: "https://sync.logitech.com",
  CISCO_CONTROL_HUB: "https://admin.webex.com",
  UTELOGY: "https://app.utelogy.com",
};

type DeepLinkBuilder = (ctx: PortalLinkContext) => string | null;

// Device-page builders for the platforms we integrate with today.
// NOTE: the exact paths are behind authenticated portals and pending live
// verification. `config.portalUrlTemplate` is the no-deploy correction path.
const DEEP_LINK_BUILDERS: Partial<Record<Platform, DeepLinkBuilder>> = {
  POLY_LENS: (ctx) => `https://lens.poly.com/devices/${encodeURIComponent(ctx.platformId)}`,
  YEALINK_YMCS: (ctx) =>
    `https://ymcs.yealink.com/console/devices/detail?id=${encodeURIComponent(ctx.platformId)}`,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(source: Record<string, unknown> | null, key: string): string {
  if (source && typeof source[key] === "string") return source[key] as string;
  return "";
}

// Replaces {deviceId}/{tenantId}/{macAddress} tokens. Returns the URL only if it
// is https (otherwise null, so the caller falls through to safer defaults).
function interpolateTemplate(template: string, ctx: PortalLinkContext): string | null {
  const tenantId = stringField(ctx.credentialConfig, "tenantId");
  const rawPayload = isRecord(ctx.deviceRawPayload) ? ctx.deviceRawPayload : null;
  const macAddress = stringField(rawPayload, "macAddress");

  const url = template
    .replaceAll("{deviceId}", encodeURIComponent(ctx.platformId))
    .replaceAll("{tenantId}", encodeURIComponent(tenantId))
    .replaceAll("{macAddress}", encodeURIComponent(macAddress));

  return url.startsWith("https://") ? url : null;
}

// Total function: always returns a usable PortalLink and never throws.
export function buildPortalLink(ctx: PortalLinkContext): PortalLink {
  const label = `Open in ${PLATFORM_LABELS[ctx.platform]}`;

  // 1. Admin override template (no-deploy correction path).
  const template = ctx.credentialConfig?.portalUrlTemplate;
  if (typeof template === "string" && template.length > 0) {
    const url = interpolateTemplate(template, ctx);
    if (url) return { url, isDeepLink: true, label };
  }

  // 2. Code builder for platforms we know.
  const built = DEEP_LINK_BUILDERS[ctx.platform]?.(ctx) ?? null;
  if (built) return { url: built, isDeepLink: true, label };

  // 3. Portal-home fallback.
  return { url: PORTAL_HOME[ctx.platform], isDeepLink: false, label };
}
