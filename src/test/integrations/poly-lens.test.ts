import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({
  getCredential: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock("@/lib/integrations/graphql-client", () => ({
  executeGraphQL: vi.fn(),
  GraphQLClientError: class GraphQLClientError extends Error {},
}));

import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { getCredential, updateConfig } from "@/lib/integrations/credentials";
import { executeGraphQL } from "@/lib/integrations/graphql-client";
import { Platform } from "@prisma/client";

const mockGetCredential = vi.mocked(getCredential);
const mockUpdateConfig = vi.mocked(updateConfig);
const mockExecuteGraphQL = vi.mocked(executeGraphQL);

const VALID_CRED = {
  id: "cred-1",
  platform: Platform.POLY_LENS,
  clientId: "client-id",
  clientSecret: "client-secret",
  apiKey: null,
  webhookSecret: null,
  config: { tenantId: "tenant-uuid" },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createPolyLensAdapter", () => {
  it("throws when credentials are not configured", async () => {
    mockGetCredential.mockResolvedValueOnce(null);
    await expect(createPolyLensAdapter()).rejects.toThrow(
      "POLY_LENS credentials not configured"
    );
  });

  it("throws when clientId or clientSecret is missing", async () => {
    mockGetCredential.mockResolvedValueOnce({
      ...VALID_CRED,
      clientId: null,
      clientSecret: null,
    });
    await expect(createPolyLensAdapter()).rejects.toThrow(
      "POLY_LENS clientId and clientSecret are required"
    );
  });

  it("throws when tenantId is missing from config", async () => {
    mockGetCredential.mockResolvedValueOnce({
      ...VALID_CRED,
      config: {},
    });
    await expect(createPolyLensAdapter()).rejects.toThrow(
      "POLY_LENS tenantId is required"
    );
  });
});

describe("syncDevices", () => {
  it("returns normalized devices from GraphQL response", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      tenant: {
        inventory: {
          deviceSearch: {
            edges: [
              {
                node: {
                  id: "dev-1",
                  name: "Conference Room Poly",
                  connected: true,
                  hardwareModel: "Studio X50",
                  softwareVersion: "3.14.0",
                  macAddress: "aa:bb:cc:dd:ee:ff",
                  siteId: "site-1",
                  roomId: "room-1",
                },
              },
            ],
            pageInfo: { nextToken: null, hasNextPage: false },
          },
        },
      },
    });

    const adapter = await createPolyLensAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({
      platform: Platform.POLY_LENS,
      platformId: "dev-1",
      name: "Conference Room Poly",
      status: "online",
      model: "Studio X50",
      firmware: "3.14.0",
      macAddress: "aa:bb:cc:dd:ee:ff",
    });
  });

  it("follows pagination until hasNextPage is false", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const page1 = {
      tenant: {
        inventory: {
          deviceSearch: {
            edges: [{ node: { id: "dev-1", name: "D1", connected: true, hardwareModel: null, softwareVersion: null, macAddress: null, siteId: null, roomId: null } }],
            pageInfo: { nextToken: "cursor-abc", hasNextPage: true },
          },
        },
      },
    };
    const page2 = {
      tenant: {
        inventory: {
          deviceSearch: {
            edges: [{ node: { id: "dev-2", name: "D2", connected: false, hardwareModel: null, softwareVersion: null, macAddress: null, siteId: null, roomId: null } }],
            pageInfo: { nextToken: null, hasNextPage: false },
          },
        },
      },
    };

    mockExecuteGraphQL
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);

    const adapter = await createPolyLensAdapter();
    const devices = await adapter.syncDevices();

    expect(devices).toHaveLength(2);
    expect(mockExecuteGraphQL).toHaveBeenCalledTimes(2);
  });
});

describe("fetchRecentAlerts", () => {
  it("returns NormalizedAlerts for offline devices", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      tenant: {
        inventory: {
          deviceSearch: {
            edges: [
              {
                node: {
                  id: "dev-2",
                  name: "Offline Phone",
                  connected: false,
                  hardwareModel: "VVX 500",
                  siteId: "site-1",
                  roomId: "room-2",
                },
              },
            ],
            pageInfo: { nextToken: null, hasNextPage: false },
          },
        },
      },
    });

    const adapter = await createPolyLensAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-05-29T09:00:00Z"));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      platform: Platform.POLY_LENS,
      platformDeviceId: "dev-2",
      platformAlertId: "offline:dev-2",
      severity: "HIGH",
      title: expect.stringContaining("Offline Phone"),
    });
  });

  it("returns empty array when no offline devices", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      tenant: {
        inventory: {
          deviceSearch: {
            edges: [],
            pageInfo: { nextToken: null, hasNextPage: false },
          },
        },
      },
    });

    const adapter = await createPolyLensAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date());

    expect(alerts).toHaveLength(0);
  });
});

describe("verifyWebhookSignature", () => {
  it("always returns false — Poly Lens has no webhooks", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const adapter = await createPolyLensAdapter();
    expect(adapter.verifyWebhookSignature("payload", "sig")).toBe(false);
  });
});

describe("rebootDevice", () => {
  it("calls rebootDevice mutation with correct deviceId", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      rebootDevice: { success: true, message: "Rebooting" },
    });

    const adapter = await createPolyLensAdapter();
    await expect(adapter.rebootDevice("dev-1")).resolves.toBeUndefined();

    expect(mockExecuteGraphQL).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: { deviceId: "dev-1" },
      })
    );
  });

  it("throws when reboot mutation returns success: false", async () => {
    mockGetCredential.mockResolvedValue(VALID_CRED);

    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "tok", expires_in: 86400 }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    mockExecuteGraphQL.mockResolvedValueOnce({
      rebootDevice: { success: false, message: "Device not found" },
    });

    const adapter = await createPolyLensAdapter();
    await expect(adapter.rebootDevice("dev-999")).rejects.toThrow("Device not found");
  });
});
