import { describe, it, expect } from "vitest";
import { buildPortalLink } from "@/lib/portal-links";
import type { Platform } from "@prisma/client";

const base = {
  platformId: "dev-123",
  deviceRawPayload: {} as unknown,
  credentialConfig: null as Record<string, unknown> | null,
};

describe("buildPortalLink — deep-link platforms", () => {
  it("builds a Poly Lens device deep link", () => {
    const link = buildPortalLink({ ...base, platform: "POLY_LENS" as Platform });
    expect(link.isDeepLink).toBe(true);
    expect(link.url).toBe("https://lens.poly.com/devices/dev-123");
    expect(link.label).toBe("Open in Poly Lens");
  });

  it("builds a Yealink YMCS device deep link", () => {
    const link = buildPortalLink({ ...base, platform: "YEALINK_YMCS" as Platform });
    expect(link.isDeepLink).toBe(true);
    expect(link.url).toContain("ymcs.yealink.com");
    expect(link.url).toContain("dev-123");
    expect(link.label).toBe("Open in Yealink YMCS");
  });

  it("URL-encodes the device id", () => {
    const link = buildPortalLink({
      ...base,
      platform: "POLY_LENS" as Platform,
      platformId: "a b/c",
    });
    expect(link.url).toBe("https://lens.poly.com/devices/a%20b%2Fc");
  });
});

describe("buildPortalLink — portal-home fallback platforms", () => {
  it.each([
    ["NEAT_PULSE", "https://pulse.neat.no", "Open in Neat Pulse"],
    ["LOGITECH_SYNC", "https://sync.logitech.com", "Open in Logitech Sync"],
    ["CISCO_CONTROL_HUB", "https://admin.webex.com", "Open in Cisco Control Hub"],
    ["UTELOGY", "https://app.utelogy.com", "Open in Utelogy"],
  ])("falls back to portal home for %s", (platform, url, label) => {
    const link = buildPortalLink({ ...base, platform: platform as Platform });
    expect(link.isDeepLink).toBe(false);
    expect(link.url).toBe(url);
    expect(link.label).toBe(label);
  });
});

describe("buildPortalLink — config override", () => {
  it("uses portalUrlTemplate and interpolates {deviceId} and {tenantId}", () => {
    const link = buildPortalLink({
      ...base,
      platform: "POLY_LENS" as Platform,
      platformId: "dev-9",
      credentialConfig: {
        portalUrlTemplate: "https://lens.poly.com/t/{tenantId}/d/{deviceId}",
        tenantId: "tenant-42",
      },
    });
    expect(link.isDeepLink).toBe(true);
    expect(link.url).toBe("https://lens.poly.com/t/tenant-42/d/dev-9");
  });

  it("interpolates {macAddress} from device rawPayload", () => {
    const link = buildPortalLink({
      ...base,
      platform: "UTELOGY" as Platform,
      deviceRawPayload: { macAddress: "AA:BB:CC" },
      credentialConfig: { portalUrlTemplate: "https://app.utelogy.com/d/{macAddress}" },
    });
    expect(link.url).toBe("https://app.utelogy.com/d/AA%3ABB%3ACC");
  });

  it("rejects a non-https template and falls back to the code builder", () => {
    const link = buildPortalLink({
      ...base,
      platform: "POLY_LENS" as Platform,
      credentialConfig: { portalUrlTemplate: "http://evil.example/{deviceId}" },
    });
    expect(link.url).toBe("https://lens.poly.com/devices/dev-123");
    expect(link.isDeepLink).toBe(true);
  });

  it("rejects a non-https template and falls back to home for non-builder platforms", () => {
    const link = buildPortalLink({
      ...base,
      platform: "NEAT_PULSE" as Platform,
      credentialConfig: { portalUrlTemplate: "javascript:alert(1)" },
    });
    expect(link.url).toBe("https://pulse.neat.no");
    expect(link.isDeepLink).toBe(false);
  });
});
