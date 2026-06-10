import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/sync", () => ({ syncAllDevices: vi.fn() }));
vi.mock("@/lib/correlation", () => ({ runAutoResolveSweep: vi.fn() }));
vi.mock("@/lib/reports", () => ({ getReportSummary: vi.fn() }));
vi.mock("@/lib/email-templates/config", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findMany: vi.fn() } } }));

import { GET as dailyCron } from "@/app/api/cron/daily/route";
import { GET as monthlyCron } from "@/app/api/cron/monthly/route";
import { syncAllDevices } from "@/lib/integrations/sync";
import { runAutoResolveSweep } from "@/lib/correlation";
import { getReportSummary } from "@/lib/reports";
import { sendEmail } from "@/lib/email-templates/config";
import { prisma } from "@/lib/prisma";
import type { ReportSummary } from "@/lib/reports";

const mockSync = vi.mocked(syncAllDevices);
const mockSweep = vi.mocked(runAutoResolveSweep);
const mockGetReportSummary = vi.mocked(getReportSummary);
const mockSendEmail = vi.mocked(sendEmail);
const mockUserFindMany = vi.mocked(prisma.user.findMany);

const CRON_SECRET = "test-cron-secret";

const SUMMARY: ReportSummary = {
  tickets: { total: 42, open: 12, resolved: 20, closed: 10, byPriority: { P1: 2, P2: 10, P3: 18, P4: 12 } },
  sla: { resolvedWithinSla: 39, resolvedBreached: 1, complianceRate: 0.975, openBreached: 3 },
  mttrMinutes: 47,
  byCustomer: [{ customerId: "c1", name: "Acme Corp", ticketCount: 17 }],
  alerts: {
    total: 120,
    bySeverity: { CRITICAL: 5, HIGH: 15, MEDIUM: 40, LOW: 40, INFO: 20 },
    byPlatform: { POLY_LENS: 80, YEALINK_YMCS: 40 },
    autoResolvedRate: 0.25,
  },
};

function makeRequest(url: string, auth?: string): Request {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

describe("GET /api/cron/daily", () => {
  it("returns 401 without the cron bearer token", async () => {
    const res = await dailyCron(makeRequest("http://localhost/api/cron/daily"));
    expect(res.status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("syncs devices, runs the auto-resolve sweep, and reports results", async () => {
    mockSync.mockResolvedValueOnce({ synced: 7, errors: [] });
    mockSweep.mockResolvedValueOnce({ resolved: 2 });

    const res = await dailyCron(
      makeRequest("http://localhost/api/cron/daily", `Bearer ${CRON_SECRET}`)
    );
    const body = (await res.json()) as {
      success: boolean;
      synced: number;
      errors: string[];
      autoResolved: number;
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.synced).toBe(7);
    expect(body.autoResolved).toBe(2);
  });

  it("returns 500 with the message when the sync fails", async () => {
    mockSync.mockRejectedValueOnce(new Error("db down"));

    const res = await dailyCron(
      makeRequest("http://localhost/api/cron/daily", `Bearer ${CRON_SECRET}`)
    );
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/db down/);
  });
});

describe("GET /api/cron/monthly", () => {
  it("returns 401 without the cron bearer token", async () => {
    const res = await monthlyCron(makeRequest("http://localhost/api/cron/monthly"));
    expect(res.status).toBe(401);
    expect(mockGetReportSummary).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("emails the 30-day SLA report to managers and super admins", async () => {
    mockGetReportSummary.mockResolvedValueOnce(SUMMARY);
    mockUserFindMany.mockResolvedValueOnce([
      { email: "manager@callone.com" },
      { email: "admin@callone.com" },
    ] as never);
    mockSendEmail.mockResolvedValue(undefined as never);

    const res = await monthlyCron(
      makeRequest("http://localhost/api/cron/monthly", `Bearer ${CRON_SECRET}`)
    );
    const body = (await res.json()) as { success: boolean; sent: number; errors: string[] };

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, sent: 2, errors: [] });
    expect(mockGetReportSummary).toHaveBeenCalledWith(30);

    // Recipient query targets active MANAGER-role or super-admin users.
    const findArgs = mockUserFindMany.mock.calls[0][0] as {
      where: { active: boolean; OR: unknown[] };
    };
    expect(findArgs.where.active).toBe(true);
    expect(findArgs.where.OR).toEqual(
      expect.arrayContaining([
        { isSuperAdmin: true },
        { profile: { vnocRole: "MANAGER" } },
      ])
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    const firstSend = mockSendEmail.mock.calls[0][0];
    expect(firstSend.to).toBe("manager@callone.com");
    expect(firstSend.subject).toMatch(/VNOC Monthly SLA Report/);
    expect(firstSend.html).toContain("97.5%"); // compliance rate
    expect(firstSend.html).toContain("42"); // total tickets
    expect(firstSend.text).toMatch(/97.5%/);
  });

  it("tolerates per-recipient failures and reports them", async () => {
    mockGetReportSummary.mockResolvedValueOnce(SUMMARY);
    mockUserFindMany.mockResolvedValueOnce([
      { email: "manager@callone.com" },
      { email: "admin@callone.com" },
    ] as never);
    mockSendEmail
      .mockRejectedValueOnce(new Error("ses throttled"))
      .mockResolvedValueOnce(undefined as never);

    const res = await monthlyCron(
      makeRequest("http://localhost/api/cron/monthly", `Bearer ${CRON_SECRET}`)
    );
    const body = (await res.json()) as { success: boolean; sent: number; errors: string[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sent).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatch(/manager@callone.com/);
    expect(body.errors[0]).toMatch(/ses throttled/);
  });

  it("returns 500 when the report build fails", async () => {
    mockGetReportSummary.mockRejectedValueOnce(new Error("db down"));

    const res = await monthlyCron(
      makeRequest("http://localhost/api/cron/monthly", `Bearer ${CRON_SECRET}`)
    );
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/db down/);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
