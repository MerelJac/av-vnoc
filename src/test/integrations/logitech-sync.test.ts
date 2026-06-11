import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({ getCredential: vi.fn() }));
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock("@/lib/integrations/logi-sync-client", () => ({
  createLogiSyncClient: () => ({ get: mockGet, post: mockPost }),
}));

import { getCredential } from "@/lib/integrations/credentials";
import { createLogiSyncAdapter } from "@/lib/integrations/logitech-sync";

const mockCred = vi.mocked(getCredential);

beforeEach(() => {
  vi.resetAllMocks();
});

const VALID_CRED = {
  config: {
    orgId: "org-1",
    apiServer: "https://api.sync.logitech.com/v1",
    certPem: "C",
    keyPem: "K",
  },
};

describe("createLogiSyncAdapter", () => {
  it("rejects when credentials are missing", async () => {
    mockCred.mockResolvedValueOnce(null);
    await expect(createLogiSyncAdapter()).rejects.toThrow(/not configured/i);
  });

  it("rejects when cert material is incomplete", async () => {
    mockCred.mockResolvedValueOnce({ config: { orgId: "org-1" } } as never);
    await expect(createLogiSyncAdapter()).rejects.toThrow(/certificate|key|orgId/i);
  });
});

describe("syncDevices", () => {
  it("normalizes places+devices into NormalizedDevice[]", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockGet
      .mockResolvedValueOnce({ places: [{ id: "place-1", name: "Room A" }] })
      .mockResolvedValueOnce({
        devices: [
          {
            id: "dev-1",
            name: "Rally Bar",
            placeId: "place-1",
            connectionStatus: "online",
            model: "Rally Bar",
            firmwareVersion: "1.2.3",
          },
        ],
      });

    const adapter = await createLogiSyncAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      platform: "LOGITECH_SYNC",
      platformId: "dev-1",
      name: "Rally Bar",
      status: "online",
      model: "Rally Bar",
      firmware: "1.2.3",
    });
  });

  it("collects devices embedded in the /places response (verified endpoint)", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockGet
      .mockResolvedValueOnce({
        places: [
          {
            id: "place-1",
            name: "Boardroom",
            devices: [
              {
                id: "dev-embedded",
                name: "Rally Bar",
                connectionStatus: "online",
                model: "Rally Bar",
              },
            ],
          },
          { id: "place-2", name: "Huddle" },
        ],
      })
      .mockResolvedValueOnce({ devices: [] });

    const adapter = await createLogiSyncAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      platformId: "dev-embedded",
      name: "Rally Bar",
      status: "online",
    });
    expect((devices[0].rawPayload as Record<string, unknown>).__placeName).toBe("Boardroom");
  });

  it("merges /devices results with place-embedded devices, deduped by id", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockGet
      .mockResolvedValueOnce({
        places: [
          {
            id: "place-1",
            name: "Boardroom",
            devices: [{ id: "dev-1", name: "Rally Bar", connectionStatus: "online" }],
          },
        ],
      })
      .mockResolvedValueOnce({
        devices: [
          { id: "dev-1", name: "Rally Bar (dup)", connectionStatus: "online" },
          { id: "dev-2", name: "MeetUp", connectionStatus: "offline" },
        ],
      });

    const adapter = await createLogiSyncAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(2);
    expect(devices.map((d) => d.platformId).sort()).toEqual(["dev-1", "dev-2"]);
    // Place-embedded record wins for duplicates
    expect(devices.find((d) => d.platformId === "dev-1")?.name).toBe("Rally Bar");
  });

  it("tolerates a failing /devices endpoint when places already yielded devices", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockGet
      .mockResolvedValueOnce({
        places: [
          {
            id: "place-1",
            name: "Boardroom",
            devices: [{ id: "dev-1", name: "Rally Bar", connectionStatus: "online" }],
          },
        ],
      })
      .mockRejectedValueOnce(new Error("Logitech Sync GET /devices failed: 404"));

    const adapter = await createLogiSyncAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0].platformId).toBe("dev-1");
  });

  it("still fails when /devices errors and places had no devices", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockGet
      .mockResolvedValueOnce({ places: [{ id: "place-1", name: "Empty" }] })
      .mockRejectedValueOnce(new Error("Logitech Sync GET /devices failed: 500"));

    const adapter = await createLogiSyncAdapter();
    await expect(adapter.syncDevices()).rejects.toThrow(/500/);
  });

  it("maps disconnected to offline and unknown values to unknown", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockGet.mockResolvedValueOnce({ places: [] }).mockResolvedValueOnce({
      devices: [
        { id: "d1", name: "A", connectionStatus: "disconnected" },
        { id: "d2", name: "B", connectionStatus: "sleeping" },
      ],
    });

    const adapter = await createLogiSyncAdapter();
    const devices = await adapter.syncDevices();

    expect(devices[0].status).toBe("offline");
    expect(devices[1].status).toBe("unknown");
  });
});

describe("fetchRecentAlerts", () => {
  it("derives CRITICAL offline alerts from offline devices only", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockGet.mockResolvedValueOnce({ places: [] }).mockResolvedValueOnce({
      devices: [
        { id: "dev-up", name: "Rally Up", connectionStatus: "online" },
        { id: "dev-down", name: "Rally Down", connectionStatus: "offline" },
      ],
    });

    const adapter = await createLogiSyncAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-06-01"));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      platform: "LOGITECH_SYNC",
      platformAlertId: "offline-dev-down",
      platformDeviceId: "dev-down",
      severity: "CRITICAL",
      title: expect.stringContaining("Rally Down"),
    });
  });
});

describe("webhooks and reboot", () => {
  it("normalizeWebhookPayload returns null and verifyWebhookSignature returns false (polling-only)", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    const adapter = await createLogiSyncAdapter();
    expect(adapter.normalizeWebhookPayload({})).toBeNull();
    expect(adapter.verifyWebhookSignature("x", "y")).toBe(false);
  });

  it("rebootDevice throws a descriptive unsupported error", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    const adapter = await createLogiSyncAdapter();
    await expect(adapter.rebootDevice("dev-1")).rejects.toThrow(
      /not supported for Logitech Sync/i
    );
  });
});
