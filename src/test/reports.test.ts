import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: { groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    alert: { groupBy: vi.fn(), count: vi.fn() },
    customer: { findMany: vi.fn() },
  },
}));

import { getReportSummary } from "@/lib/reports";
import { prisma } from "@/lib/prisma";

const mockTicketGroupBy = prisma.ticket.groupBy as unknown as Mock;
const mockTicketFindMany = prisma.ticket.findMany as unknown as Mock;
const mockTicketCount = prisma.ticket.count as unknown as Mock;
const mockAlertGroupBy = prisma.alert.groupBy as unknown as Mock;
const mockAlertCount = prisma.alert.count as unknown as Mock;
const mockCustomerFindMany = prisma.customer.findMany as unknown as Mock;

const NOW = new Date("2026-06-10T12:00:00.000Z");
const DAY_MS = 86_400_000;

interface MockData {
  statusGroups: { status: string; _count: { _all: number } }[];
  priorityGroups: { priority: string; _count: { _all: number } }[];
  resolvedTickets: { openedAt: Date; resolvedAt: Date | null; slaDeadline: Date }[];
  openBreachedCount: number;
  customerGroups: { customerId: string | null; _count: { _all: number } }[];
  customers: { id: string; name: string }[];
  alertTotal: number;
  severityGroups: { severity: string; _count: { _all: number } }[];
  platformGroups: { platform: string; _count: { _all: number } }[];
  autoResolvedCount: number;
}

const emptyData: MockData = {
  statusGroups: [],
  priorityGroups: [],
  resolvedTickets: [],
  openBreachedCount: 0,
  customerGroups: [],
  customers: [],
  alertTotal: 0,
  severityGroups: [],
  platformGroups: [],
  autoResolvedCount: 0,
};

function primeMocks(overrides: Partial<MockData> = {}) {
  const d: MockData = { ...emptyData, ...overrides };

  mockTicketGroupBy.mockImplementation(async (args: { by: string[] }) => {
    if (args.by.includes("status")) return d.statusGroups;
    if (args.by.includes("priority")) return d.priorityGroups;
    return d.customerGroups;
  });
  mockTicketFindMany.mockResolvedValue(d.resolvedTickets);
  mockTicketCount.mockResolvedValue(d.openBreachedCount);
  mockAlertGroupBy.mockImplementation(async (args: { by: string[] }) =>
    args.by.includes("severity") ? d.severityGroups : d.platformGroups
  );
  mockAlertCount.mockImplementation(async (args: { where?: { status?: string } }) =>
    args?.where?.status === "AUTO_RESOLVED" ? d.autoResolvedCount : d.alertTotal
  );
  mockCustomerFindMany.mockResolvedValue(d.customers);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getReportSummary", () => {
  it("aggregates tickets, SLA, MTTR, customers, and alerts over the window", async () => {
    const hour = 3_600_000;
    primeMocks({
      statusGroups: [
        { status: "OPEN", _count: { _all: 4 } },
        { status: "IN_PROGRESS", _count: { _all: 2 } },
        { status: "RESOLVED", _count: { _all: 3 } },
        { status: "CLOSED", _count: { _all: 1 } },
      ],
      priorityGroups: [
        { priority: "P1", _count: { _all: 1 } },
        { priority: "P2", _count: { _all: 4 } },
        { priority: "P3", _count: { _all: 5 } },
      ],
      resolvedTickets: [
        // within SLA, 30 minutes to resolve
        {
          openedAt: new Date(NOW.getTime() - 2 * hour),
          resolvedAt: new Date(NOW.getTime() - 2 * hour + 30 * 60_000),
          slaDeadline: new Date(NOW.getTime() - hour),
        },
        // breached SLA, 90 minutes to resolve
        {
          openedAt: new Date(NOW.getTime() - 4 * hour),
          resolvedAt: new Date(NOW.getTime() - 4 * hour + 90 * 60_000),
          slaDeadline: new Date(NOW.getTime() - 4 * hour + 60 * 60_000),
        },
        // resolved exactly at the deadline counts as within SLA, 60 minutes
        {
          openedAt: new Date(NOW.getTime() - 6 * hour),
          resolvedAt: new Date(NOW.getTime() - 6 * hour + 60 * 60_000),
          slaDeadline: new Date(NOW.getTime() - 6 * hour + 60 * 60_000),
        },
      ],
      openBreachedCount: 2,
      customerGroups: [
        { customerId: "c1", _count: { _all: 5 } },
        { customerId: "c2", _count: { _all: 3 } },
      ],
      customers: [
        { id: "c1", name: "Acme Corp" },
        { id: "c2", name: "Globex" },
      ],
      alertTotal: 8,
      severityGroups: [
        { severity: "CRITICAL", _count: { _all: 2 } },
        { severity: "HIGH", _count: { _all: 3 } },
        { severity: "INFO", _count: { _all: 3 } },
      ],
      platformGroups: [
        { platform: "POLY_LENS", _count: { _all: 6 } },
        { platform: "YEALINK_YMCS", _count: { _all: 2 } },
      ],
      autoResolvedCount: 2,
    });

    const summary = await getReportSummary(30);

    expect(summary.tickets).toEqual({
      total: 10,
      open: 6, // OPEN + IN_PROGRESS
      resolved: 3,
      closed: 1,
      byPriority: { P1: 1, P2: 4, P3: 5, P4: 0 },
    });

    expect(summary.sla.resolvedWithinSla).toBe(2);
    expect(summary.sla.resolvedBreached).toBe(1);
    expect(summary.sla.complianceRate).toBeCloseTo(2 / 3, 5);
    expect(summary.sla.openBreached).toBe(2);

    // (30 + 90 + 60) / 3 = 60 minutes
    expect(summary.mttrMinutes).toBe(60);

    expect(summary.byCustomer).toEqual([
      { customerId: "c1", name: "Acme Corp", ticketCount: 5 },
      { customerId: "c2", name: "Globex", ticketCount: 3 },
    ]);

    expect(summary.alerts.total).toBe(8);
    expect(summary.alerts.bySeverity).toEqual({
      CRITICAL: 2,
      HIGH: 3,
      MEDIUM: 0,
      LOW: 0,
      INFO: 3,
    });
    expect(summary.alerts.byPlatform).toEqual({ POLY_LENS: 6, YEALINK_YMCS: 2 });
    expect(summary.alerts.autoResolvedRate).toBeCloseTo(0.25, 5);
  });

  it("scopes queries to the requested window", async () => {
    primeMocks();
    await getReportSummary(7);

    const since = new Date(NOW.getTime() - 7 * DAY_MS);

    const statusCall = mockTicketGroupBy.mock.calls.find((c) =>
      (c[0] as { by: string[] }).by.includes("status")
    )?.[0] as { where: { openedAt: { gte: Date } } };
    expect(statusCall.where.openedAt.gte).toEqual(since);

    const alertCountCall = mockAlertCount.mock.calls[0][0] as {
      where: { receivedAt: { gte: Date } };
    };
    expect(alertCountCall.where.receivedAt.gte).toEqual(since);

    // Resolved metrics are scoped by resolvedAt within the window.
    const findManyCall = mockTicketFindMany.mock.calls[0][0] as {
      where: { resolvedAt: { gte: Date }; status: { in: string[] } };
    };
    expect(findManyCall.where.resolvedAt.gte).toEqual(since);
    expect(findManyCall.where.status.in).toEqual(["RESOLVED", "CLOSED"]);
  });

  it("counts open SLA breaches by current state, not the report window", async () => {
    primeMocks({ openBreachedCount: 3 });
    const summary = await getReportSummary(7);

    expect(summary.sla.openBreached).toBe(3);
    const countCall = mockTicketCount.mock.calls[0][0] as {
      where: { status: { in: string[] }; slaDeadline: { lt: Date }; openedAt?: unknown };
    };
    expect(countCall.where.status.in).toEqual(["OPEN", "IN_PROGRESS"]);
    expect(countCall.where.slaDeadline.lt).toEqual(NOW);
    expect(countCall.where.openedAt).toBeUndefined();
  });

  it("avoids zero-division: complianceRate is 1, MTTR null, autoResolvedRate 0 with no data", async () => {
    primeMocks();
    const summary = await getReportSummary(30);

    expect(summary.tickets).toEqual({
      total: 0,
      open: 0,
      resolved: 0,
      closed: 0,
      byPriority: { P1: 0, P2: 0, P3: 0, P4: 0 },
    });
    expect(summary.sla.resolvedWithinSla).toBe(0);
    expect(summary.sla.resolvedBreached).toBe(0);
    // Vacuously compliant when nothing was resolved in the window.
    expect(summary.sla.complianceRate).toBe(1);
    expect(summary.mttrMinutes).toBeNull();
    expect(summary.alerts.autoResolvedRate).toBe(0);
    expect(summary.byCustomer).toEqual([]);
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
  });

  it("rounds MTTR to whole minutes", async () => {
    primeMocks({
      resolvedTickets: [
        {
          openedAt: new Date("2026-06-10T10:00:00.000Z"),
          resolvedAt: new Date("2026-06-10T10:30:30.000Z"), // 30.5 minutes
          slaDeadline: new Date("2026-06-10T11:00:00.000Z"),
        },
      ],
    });

    const summary = await getReportSummary(30);
    expect(summary.mttrMinutes).toBe(31);
  });

  it("ignores resolved rows missing resolvedAt instead of corrupting the math", async () => {
    primeMocks({
      resolvedTickets: [
        {
          openedAt: new Date("2026-06-10T10:00:00.000Z"),
          resolvedAt: null,
          slaDeadline: new Date("2026-06-10T11:00:00.000Z"),
        },
        {
          openedAt: new Date("2026-06-10T10:00:00.000Z"),
          resolvedAt: new Date("2026-06-10T10:20:00.000Z"),
          slaDeadline: new Date("2026-06-10T11:00:00.000Z"),
        },
      ],
    });

    const summary = await getReportSummary(30);
    expect(summary.sla.resolvedWithinSla).toBe(1);
    expect(summary.sla.resolvedBreached).toBe(0);
    expect(summary.sla.complianceRate).toBe(1);
    expect(summary.mttrMinutes).toBe(20);
  });

  it("labels unknown customers without dropping their counts", async () => {
    primeMocks({
      customerGroups: [{ customerId: "ghost", _count: { _all: 4 } }],
      customers: [],
    });

    const summary = await getReportSummary(30);
    expect(summary.byCustomer).toEqual([
      { customerId: "ghost", name: "Unknown customer", ticketCount: 4 },
    ]);
  });

  it("rejects a non-finite or non-positive days value", async () => {
    primeMocks();
    await expect(getReportSummary(0)).rejects.toThrow(/days/i);
    await expect(getReportSummary(-5)).rejects.toThrow(/days/i);
    await expect(getReportSummary(Number.NaN)).rejects.toThrow(/days/i);
    await expect(getReportSummary(Number.POSITIVE_INFINITY)).rejects.toThrow(/days/i);
    expect(mockTicketGroupBy).not.toHaveBeenCalled();
  });
});
