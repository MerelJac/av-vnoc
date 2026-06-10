import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/reports", () => ({
  getReportSummary: vi.fn(),
  DEFAULT_REPORT_DAYS: 30,
  MIN_REPORT_DAYS: 1,
  MAX_REPORT_DAYS: 365,
}));

import { GET } from "@/app/api/reports/summary/route";
import { getServerSession } from "next-auth";
import { getReportSummary } from "@/lib/reports";

const mockSession = vi.mocked(getServerSession);
const mockGetReportSummary = vi.mocked(getReportSummary);

const FAKE_SUMMARY = { tickets: { total: 5 } };

function makeRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/reports/summary${query}`);
}

function sessionFor(user: { isSuperAdmin: boolean; vnocRole: string | null }) {
  return { user: { id: "u1", ...user } } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockGetReportSummary.mockResolvedValue(FAKE_SUMMARY as never);
});

describe("GET /api/reports/summary", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(mockGetReportSummary).not.toHaveBeenCalled();
  });

  it("returns 403 for a TIER1 technician", async () => {
    mockSession.mockResolvedValueOnce(sessionFor({ isSuperAdmin: false, vnocRole: "TIER1" }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    expect(mockGetReportSummary).not.toHaveBeenCalled();
  });

  it("returns 403 for a user with no VNOC role", async () => {
    mockSession.mockResolvedValueOnce(sessionFor({ isSuperAdmin: false, vnocRole: null }));
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it("returns 200 with the summary for a MANAGER", async () => {
    mockSession.mockResolvedValueOnce(sessionFor({ isSuperAdmin: false, vnocRole: "MANAGER" }));

    const res = await GET(makeRequest());
    const body = (await res.json()) as {
      success: boolean;
      data: unknown;
      meta: { days: number };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(FAKE_SUMMARY);
    expect(body.meta).toEqual({ days: 30 }); // default window
    expect(mockGetReportSummary).toHaveBeenCalledWith(30);
  });

  it("returns 200 for a super admin without a VNOC role", async () => {
    mockSession.mockResolvedValueOnce(sessionFor({ isSuperAdmin: true, vnocRole: null }));

    const res = await GET(makeRequest("?days=7"));
    const body = (await res.json()) as { success: boolean; meta: { days: number } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta).toEqual({ days: 7 });
    expect(mockGetReportSummary).toHaveBeenCalledWith(7);
  });

  it("clamps days to the 1..365 range and defaults invalid input to 30", async () => {
    const cases: [string, number][] = [
      ["?days=9999", 365],
      ["?days=0", 1],
      ["?days=-3", 1],
      ["?days=abc", 30],
      ["", 30],
    ];

    for (const [query, expected] of cases) {
      mockGetReportSummary.mockClear();
      mockSession.mockResolvedValueOnce(sessionFor({ isSuperAdmin: false, vnocRole: "MANAGER" }));
      const res = await GET(makeRequest(query));
      expect(res.status).toBe(200);
      expect(mockGetReportSummary).toHaveBeenCalledWith(expected);
    }
  });

  it("returns 500 with a safe message when the report build fails", async () => {
    mockSession.mockResolvedValueOnce(sessionFor({ isSuperAdmin: false, vnocRole: "MANAGER" }));
    mockGetReportSummary.mockRejectedValueOnce(new Error("db exploded"));

    const res = await GET(makeRequest());
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).not.toMatch(/db exploded/); // no internal details leaked
  });
});
