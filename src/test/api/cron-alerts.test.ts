import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/integrations/poly-lens", () => ({ createPolyLensAdapter: vi.fn() }));
vi.mock("@/lib/integrations/yealink", () => ({ createYealinkAdapter: vi.fn() }));
vi.mock("@/lib/integrations/logitech-sync", () => ({ createLogiSyncAdapter: vi.fn() }));
vi.mock("@/lib/integrations/utelogy", () => ({ createUtelogyAdapter: vi.fn() }));
vi.mock("@/lib/integrations/credentials", () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));
vi.mock("@/lib/correlation", () => ({
  processAlert: vi.fn(),
  runAutoResolveSweep: vi.fn(),
}));
vi.mock("@/lib/sla-warnings", () => ({
  runSlaWarningSweep: vi.fn(),
}));

import { GET } from "@/app/api/cron/alerts/route";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { createLogiSyncAdapter } from "@/lib/integrations/logitech-sync";
import { createUtelogyAdapter } from "@/lib/integrations/utelogy";
import { getConfig, updateConfig } from "@/lib/integrations/credentials";
import { processAlert, runAutoResolveSweep } from "@/lib/correlation";
import { runSlaWarningSweep } from "@/lib/sla-warnings";

const mockPoly = vi.mocked(createPolyLensAdapter);
const mockYealink = vi.mocked(createYealinkAdapter);
const mockLogi = vi.mocked(createLogiSyncAdapter);
const mockUtelogy = vi.mocked(createUtelogyAdapter);
const mockGetConfig = vi.mocked(getConfig);
const mockUpdateConfig = vi.mocked(updateConfig);
const mockProcessAlert = vi.mocked(processAlert);
const mockSweep = vi.mocked(runAutoResolveSweep);
const mockSlaSweep = vi.mocked(runSlaWarningSweep);

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
  mockSlaSweep.mockResolvedValue({ warned: 0, errors: [] });
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

  it("polls Poly, Yealink, Logitech, and Utelogy and processes their alerts", async () => {
    mockPoly.mockResolvedValue(makeAdapter([{ platformAlertId: "p1" }]));
    mockYealink.mockResolvedValue(makeAdapter([{ platformAlertId: "y1" }]));
    mockLogi.mockResolvedValue(makeAdapter([{ platformAlertId: "l1" }]));
    mockUtelogy.mockResolvedValue(makeAdapter([{ platformAlertId: "u1" }]));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as {
      ok: boolean;
      results: Record<string, { processed: number; errors: string[] }>;
    };

    expect(res.status).toBe(200);
    expect(body.results.POLY_LENS.processed).toBe(1);
    expect(body.results.YEALINK_YMCS.processed).toBe(1);
    expect(body.results.LOGITECH_SYNC.processed).toBe(1);
    expect(body.results.UTELOGY.processed).toBe(1);
    expect(mockProcessAlert).toHaveBeenCalledTimes(4);
    expect(mockUpdateConfig).toHaveBeenCalledWith(
      "UTELOGY",
      expect.objectContaining({ lastPolledAt: expect.any(String) })
    );
  });

  it("records an adapter init failure without blocking other platforms", async () => {
    mockPoly.mockRejectedValue(new Error("poly creds missing"));
    mockYealink.mockResolvedValue(makeAdapter([]));
    mockLogi.mockResolvedValue(makeAdapter([]));
    mockUtelogy.mockResolvedValue(makeAdapter([]));

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
    mockUtelogy.mockResolvedValue(makeAdapter([]));
    mockSweep.mockResolvedValue({ resolved: 4 });

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as { autoResolved: number };

    expect(body.autoResolved).toBe(4);
  });

  it("runs the SLA warning sweep and includes its result in the response", async () => {
    mockPoly.mockResolvedValue(makeAdapter([]));
    mockYealink.mockResolvedValue(makeAdapter([]));
    mockLogi.mockResolvedValue(makeAdapter([]));
    mockUtelogy.mockResolvedValue(makeAdapter([]));
    mockSlaSweep.mockResolvedValue({ warned: 3, errors: ["bad@example.com: SES throttled"] });

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as {
      ok: boolean;
      slaWarnings: { warned: number; errors: string[] };
    };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.slaWarnings.warned).toBe(3);
    expect(body.slaWarnings.errors).toEqual(["bad@example.com: SES throttled"]);
    expect(mockSlaSweep).toHaveBeenCalledTimes(1);
  });

  it("does not fail the cron when the SLA warning sweep throws", async () => {
    mockPoly.mockResolvedValue(makeAdapter([]));
    mockYealink.mockResolvedValue(makeAdapter([]));
    mockLogi.mockResolvedValue(makeAdapter([]));
    mockUtelogy.mockResolvedValue(makeAdapter([]));
    mockSlaSweep.mockRejectedValue(new Error("DB timeout"));

    const res = await GET(makeRequest(`Bearer ${CRON_SECRET}`));
    const body = (await res.json()) as { ok: boolean };

    // Cron must still return 200
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
