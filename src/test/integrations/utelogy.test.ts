import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({ getCredential: vi.fn() }));

import { getCredential } from "@/lib/integrations/credentials";
import { createUtelogyAdapter } from "@/lib/integrations/utelogy";

const mockCred = vi.mocked(getCredential);
const mockFetch = vi.fn();

const VALID_CRED = {
  apiKey: "ute-key-123",
  config: { baseUrl: "https://acme.utelogy.com" },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mockFetch);
});

function devicesResponse(devices: unknown[]) {
  return new Response(JSON.stringify({ devices }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createUtelogyAdapter", () => {
  it("rejects when credentials are missing", async () => {
    mockCred.mockResolvedValueOnce(null);
    await expect(createUtelogyAdapter()).rejects.toThrow(/not configured/i);
  });

  it("rejects when apiKey or baseUrl is missing", async () => {
    mockCred.mockResolvedValueOnce({ apiKey: null, config: { baseUrl: "https://x.y" } } as never);
    await expect(createUtelogyAdapter()).rejects.toThrow(/apiKey|baseUrl/i);

    mockCred.mockResolvedValueOnce({ apiKey: "k", config: {} } as never);
    await expect(createUtelogyAdapter()).rejects.toThrow(/apiKey|baseUrl/i);
  });

  it("rejects an invalid baseUrl", async () => {
    mockCred.mockResolvedValueOnce({ apiKey: "k", config: { baseUrl: "not-a-url" } } as never);
    await expect(createUtelogyAdapter()).rejects.toThrow(/baseUrl/i);
  });
});

describe("syncDevices", () => {
  it("fetches devices with bearer auth and normalizes them", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce(
      devicesResponse([
        {
          id: "ud-1",
          name: "Boardroom Codec",
          model: "Room Kit",
          firmwareVersion: "11.5",
          macAddress: "AA:BB:CC:DD:EE:FF",
          connectionStatus: "online",
          lastSeen: "2026-06-10T12:00:00Z",
        },
        { id: "ud-2", name: "Lobby Display", connectionStatus: "disconnected" },
        { id: "ud-3", name: "Hux", status: "sleeping" },
      ])
    );

    const adapter = await createUtelogyAdapter();
    const devices = await adapter.syncDevices();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://acme.utelogy.com/api/v1/devices");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ute-key-123");

    expect(devices).toHaveLength(3);
    expect(devices[0]).toMatchObject({
      platform: "UTELOGY",
      platformId: "ud-1",
      name: "Boardroom Codec",
      model: "Room Kit",
      firmware: "11.5",
      macAddress: "aa:bb:cc:dd:ee:ff",
      status: "online",
    });
    expect(devices[1].status).toBe("offline");
    expect(devices[2].status).toBe("unknown");
  });

  it("throws with status on non-2xx", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 403 }));

    const adapter = await createUtelogyAdapter();
    await expect(adapter.syncDevices()).rejects.toThrow(/403/);
  });
});

describe("fetchRecentAlerts", () => {
  it("derives CRITICAL offline alerts from offline devices only", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    mockFetch.mockResolvedValueOnce(
      devicesResponse([
        { id: "up", name: "Up Device", connectionStatus: "online" },
        { id: "down", name: "Down Device", connectionStatus: "offline" },
      ])
    );

    const adapter = await createUtelogyAdapter();
    const alerts = await adapter.fetchRecentAlerts(new Date("2026-06-01"));

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      platform: "UTELOGY",
      platformAlertId: "offline-down",
      platformDeviceId: "down",
      severity: "CRITICAL",
      title: expect.stringContaining("Down Device"),
    });
  });
});

describe("webhooks and reboot", () => {
  it("is a polling-only adapter (webhook no-ops, reboot unsupported)", async () => {
    mockCred.mockResolvedValueOnce(VALID_CRED as never);
    const adapter = await createUtelogyAdapter();

    expect(adapter.normalizeWebhookPayload({})).toBeNull();
    expect(adapter.verifyWebhookSignature("x", "y")).toBe(false);
    await expect(adapter.rebootDevice("ud-1")).rejects.toThrow(/not supported for Utelogy/i);
  });
});
