import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/integrations/poly-lens", () => ({ createPolyLensAdapter: vi.fn() }));
vi.mock("@/lib/integrations/yealink", () => ({ createYealinkAdapter: vi.fn() }));
vi.mock("@/lib/integrations/logitech-sync", () => ({ createLogiSyncAdapter: vi.fn() }));
vi.mock("@/lib/integrations/credentials", () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));
vi.mock("@/lib/correlation", () => ({
  processAlert: vi.fn(),
  runAutoResolveSweep: vi.fn(),
}));

import { GET } from "@/app/api/cron/alerts/route";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { createLogiSyncAdapter } from "@/lib/integrations/logitech-sync";
import { getConfig, updateConfig } from "@/lib/integrations/credentials";
import { processAlert, runAutoResolveSweep } from "@/lib/correlation";

const mockPoly = vi.mocked(createPolyLensAdapter);
const mockYealink = vi.mocked(createYealinkAdapter);
const mockLogi = vi.mocked(createLogiSyncAdapter);
const mockGetConfig = vi.mocked(getConfig);
const mockUpdateConfig = vi.mocked(updateConfig);
const mockProcessAlert = vi.mocked(processAlert);
const mockSweep = vi.mocked(runAutoResolveSweep);

const CRON_SECRET = "test-cron-secret";

function makeRequest(auth?: string) {
  return new NextRequest("http://localhost/api/cron/alerts", {
    headers: auth ? { authorization: auth } : {},
  });
}

function makeAdapter(alerts: unknown[]) {
  return {
    syncDevices: vi.fn(),
    fetchRecentAlerts: vi.fn().mockResolvedValue(alerts),
    normalizeWebhookPayload: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    rebootDevice: vi.fn(),
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
  mockGetConfig.mockResolvedValue({});
  mockUpdateConfig.mockResolvedValue(undefined as never);
  mockProcessAlert.mockResolvedValue({ action: "created", alertId: "a1" });
  mockSweep.mockResolvedValue({ resolved: 0 });
});

describe("GET /api/cron/alerts", () => {
  it("returns 401 without the cron bearer token", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong bearer token", async () => {
    const res = await GET(makeRequest("Bearer nope"));
    expect(res.status).toBe(401);
  });

  it("polls Poly, Yealink, and Logitech and processes their alerts", async () => {
    mockPoly.mockResolvedValue(makeAdapter([{ platformAlertId: "p1" }]));
    mockYealink.mockResolvedValue(makeAdapter([{ platformAlertId: "y1" }]));
    mockLogi.mockResolvedValue(makeAdapter([{ platformAlertId: "l1" }]));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as {
      ok: boolean;
      results: Record<string, { processed: number; errors: string[] }>;
    };

    expect(res.status).toBe(200);
    expect(body.results.POLY_LENS.processed).toBe(1);
    expect(body.results.YEALINK_YMCS.processed).toBe(1);
    expect(body.results.LOGITECH_SYNC.processed).toBe(1);
    expect(mockProcessAlert).toHaveBeenCalledTimes(3);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "LOGITECH_SYNC",
      expect.objectContaining({ lastPolledAt: expect.any(String) })
    );
  });

  it("records an adapter init failure without blocking other platforms", async () => {
    mockPoly.mockRejectedValue(new Error("poly creds missing"));
    mockYealink.mockResolvedValue(makeAdapter([]));
    mockLogi.mockResolvedValue(makeAdapter([]));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as {
      results: Record<string, { processed: number; errors: string[] }>;
    };

    expect(res.status).toBe(200);
    expect(body.results.POLY_LENS.errors[0]).toMatch(/poly creds missing/);
    expect(body.results.YEALINK_YMCS.processed).toBe(0);
    expect(body.results.LOGITECH_SYNC.errors).toEqual([]);
  });

  it("runs the auto-resolve sweep and reports the count", async () => {
    mockPoly.mockResolvedValue(makeAdapter([]));
    mockYealink.mockResolvedValue(makeAdapter([]));
    mockLogi.mockResolvedValue(makeAdapter([]));
    mockSweep.mockResolvedValue({ resolved: 4 });

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as { autoResolved: number };

    expect(body.autoResolved).toBe(4);
  });
});
