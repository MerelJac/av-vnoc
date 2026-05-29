import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({
  getCredential: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock("@/lib/integrations/ymcs-client", () => ({
  acquireYmcsToken: vi.fn(),
  ymcsPost: vi.fn(),
  YmcsApiError: class YmcsApiError extends Error {},
  buildYmcsHeaders: vi.fn().mockReturnValue({}),
}));

import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { getCredential, updateConfig } from "@/lib/integrations/credentials";
import { acquireYmcsToken, ymcsPost } from "@/lib/integrations/ymcs-client";
import { Platform } from "@prisma/client";

const mockGetCredential = vi.mocked(getCredential);
const mockUpdateConfig = vi.mocked(updateConfig);
const mockAcquireToken = vi.mocked(acquireYmcsToken);
const mockYmcsPost = vi.mocked(ymcsPost);

const VALID_CRED = {
  id: "cred-1",
  platform: Platform.YEALINK_YMCS,
  clientId: "client-id",
  clientSecret: "client-secret",
  apiKey: null,
  webhookSecret: "verify-token-abc",
  config: { region: "us" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createYealinkAdapter", () => {
  it("throws when credentials are not configured", async () => {
    mockGetCredential.mockResolvedValueOnce(null);
    await expect(createYealinkAdapter()).rejects.toThrow(
      "YEALINK_YMCS credentials not configured"
    );
  });

  it("throws when clientId or clientSecret is missing", async () => {
    mockGetCredential.mockResolvedValueOnce({
      ...VALID_CRED,
      clientId: null,
      clientSecret: null,
    });
    await expect(createYealinkAdapter()).rejects.toThrow(
      "YEALINK_YMCS clientId and clientSecret are required"
    );
  });
});

describe("syncDevices", () => {
  it("fetches all pages and returns normalized devices", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    // Page 1 — 2 devices, total=3 so there's a page 2
    mockYmcsPost.mockResolvedValueOnce({
      skip: 0,
      limit: 100,
      total: 3,
      data: [
        {
          id: "dev-1",
          mac: "001565aabbcc",
          sn: "SN001",
          name: "Phone 1",
          modelId: "model-a",
          siteId: "site-1",
          programVersion: "70.83.0.68",
          deviceStatus: "online",
        },
        {
          id: "dev-2",
          mac: "001565ddeeff",
          sn: "SN002",
          name: "Phone 2",
          modelId: "model-a",
          siteId: "site-1",
          programVersion: "70.83.0.68",
          deviceStatus: "offline",
        },
      ],
    });

    // Page 2 — 1 device, done
    mockYmcsPost.mockResolvedValueOnce({
      skip: 100,
      limit: 100,
      total: 3,
      data: [
        {
          id: "dev-3",
          mac: "001565001122",
          sn: "SN003",
          name: "Room System",
          modelId: "model-b",
          siteId: "site-2",
          programVersion: "70.84.0.5",
          deviceStatus: "pending",
        },
      ],
    });

    const adapter = await createYealinkAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(3);
    expect(mockYmcsPost).toHaveBeenCalledTimes(2);

    expect(devices[0]).toMatchObject({
      platform: Platform.YEALINK_YMCS,
      platformId: "dev-1",
      name: "Phone 1",
      macAddress: "001565aabbcc",
      firmware: "70.83.0.68",
      status: "online",
    });
    expect(devices[1]).toMatchObject({ status: "offline" });
    expect(devices[2]).toMatchObject({ status: "unknown" }); // pending → unknown
  });
});

describe("fetchRecentAlerts", () => {
  it("returns only active (status=1) alarms as NormalizedAlerts", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({
      access_token: "tok",
      token_type: "bearer",
      expires_in: 86400,
    });

    mockYmcsPost.mockResolvedValueOnce({
      skip: 0,
      limit: 100,
      total: 2,
      data: [
        {
          id: "alarm-1",
          event: "Offline",
          level: 3,
          mac: "001565aabbcc",
          model: "SIP-T54S",
          ip: "10.0.0.1",
          siteName: "HQ",
          status: 1, // active
          firstAlarmTime: 1700000000000,
          lastAlarmTime: 1700000001000,
        },
        {
          id: "alarm-2",
          event: "AccountRegistrationFailed",
          level: 2,
          mac: "001565ddeeff",
          model: "SIP-T54S",
          ip: "10.0.0.2",
          siteName: "HQ",
          status: 2, // solved — must be excluded
          firstAlarmTime: 1700000000000,
          lastAlarmTime: 1700000001000,
        },
      ],
    });

    const adapter = await createYealinkAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-05-01"));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      platform: Platform.YEALINK_YMCS,
      platformAlertId: "alarm-1",
      platformDeviceId: "001565aabbcc", // MAC as device identifier
      severity: "CRITICAL",            // level 3 → CRITICAL
      title: expect.stringContaining("Offline"),
    });
  });

  it("maps severity: level 2 → HIGH, level 1 → MEDIUM", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({ access_token: "tok", token_type: "bearer", expires_in: 86400 });
    mockYmcsPost.mockResolvedValueOnce({
      skip: 0, limit: 100, total: 2,
      data: [
        { id: "a1", event: "Fault", level: 2, mac: "aaa", model: "X", ip: "", siteName: "", status: 1, firstAlarmTime: 1, lastAlarmTime: 1 },
        { id: "a2", event: "Warning", level: 1, mac: "bbb", model: "X", ip: "", siteName: "", status: 1, firstAlarmTime: 1, lastAlarmTime: 1 },
      ],
    });

    const adapter = await createYealinkAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date());

    expect(alerts[0].severity).toBe("HIGH");
    expect(alerts[1].severity).toBe("MEDIUM");
  });

  it("returns empty array when no active alarms", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({ access_token: "tok", token_type: "bearer", expires_in: 86400 });
    mockYmcsPost.mockResolvedValueOnce({ skip: 0, limit: 100, total: 0, data: [] });

    const adapter = await createYealinkAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date());
    expect(alerts).toHaveLength(0);
  });
});

describe("verifyWebhookSignature", () => {
  it("returns true when sig matches webhookSecret (static token comparison)", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({ access_token: "tok", token_type: "bearer", expires_in: 86400 });

    const adapter = await createYealinkAdapter();
    expect(adapter.verifyWebhookSignature("", "verify-token-abc")).toBe(true);
    expect(adapter.verifyWebhookSignature("", "wrong-token")).toBe(false);
    expect(adapter.verifyWebhookSignature("", "")).toBe(false);
  });
});

describe("normalizeWebhookPayload", () => {
  it("always returns null — webhook route handles events directly", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({ access_token: "tok", token_type: "bearer", expires_in: 86400 });

    const adapter = await createYealinkAdapter();
    expect(adapter.normalizeWebhookPayload({ type: "alarm.created" })).toBeNull();
  });
});

describe("rebootDevice", () => {
  it("calls POST /v2/dm/device/reboot with deviceIds array", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({ access_token: "tok", token_type: "bearer", expires_in: 86400 });
    mockYmcsPost.mockResolvedValueOnce({ total: 1, successCount: 1, failureCount: 0, errors: [] });

    const adapter = await createYealinkAdapter();
    await expect(adapter.rebootDevice("dev-uuid-123")).resolves.toBeUndefined();

    expect(mockYmcsPost).toHaveBeenCalledWith(
      expect.stringContaining("ymcs.yealink.com"),
      "/v2/dm/device/reboot",
      "tok",
      expect.objectContaining({ deviceIds: ["dev-uuid-123"], deviceType: 1 })
    );
  });

  it("throws when reboot reports failure", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);
    mockAcquireToken.mockResolvedValueOnce({ access_token: "tok", token_type: "bearer", expires_in: 86400 });
    mockYmcsPost.mockResolvedValueOnce({
      total: 1, successCount: 0, failureCount: 1,
      errors: [{ field: "dev-uuid-123", msg: "Device not found" }],
    });

    const adapter = await createYealinkAdapter();
    await expect(adapter.rebootDevice("dev-uuid-123")).rejects.toThrow("Device not found");
  });
});
