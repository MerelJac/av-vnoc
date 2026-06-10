import { prisma } from "@/lib/prisma";
import type { AlertSeverity, TicketPriority } from "@prisma/client";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const TOP_CUSTOMER_LIMIT = 10;
const UNKNOWN_CUSTOMER_LABEL = "Unknown customer";

export const DEFAULT_REPORT_DAYS = 30;
export const MIN_REPORT_DAYS = 1;
export const MAX_REPORT_DAYS = 365;

// Typed against the Prisma enums so schema drift fails compilation.
const TICKET_PRIORITIES: readonly TicketPriority[] = ["P1", "P2", "P3", "P4"];
const ALERT_SEVERITIES: readonly AlertSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export interface ReportSummary {
  tickets: {
    total: number;
    /** OPEN + IN_PROGRESS */
    open: number;
    resolved: number;
    closed: number;
    byPriority: Record<TicketPriority, number>;
  };
  sla: {
    resolvedWithinSla: number;
    resolvedBreached: number;
    /** 0-1. Vacuously 1 when nothing was resolved in the window. */
    complianceRate: number;
    /** OPEN/IN_PROGRESS tickets past their SLA deadline right now (not window-scoped). */
    openBreached: number;
  };
  /** Average resolvedAt - openedAt in whole minutes; null when nothing resolved in the window. */
  mttrMinutes: number | null;
  byCustomer: { customerId: string; name: string; ticketCount: number }[];
  alerts: {
    total: number;
    bySeverity: Record<AlertSeverity, number>;
    byPlatform: Record<string, number>;
    /** 0-1 share of window alerts that ended AUTO_RESOLVED; 0 when there are no alerts. */
    autoResolvedRate: number;
  };
}

interface ResolvedTicketTimes {
  openedAt: Date;
  resolvedAt: Date | null;
  slaDeadline: Date;
}

function buildSlaMetrics(resolvedTickets: ResolvedTicketTimes[], openBreached: number) {
  const withTimes = resolvedTickets.filter(
    (t): t is ResolvedTicketTimes & { resolvedAt: Date } => t.resolvedAt !== null
  );
  const resolvedWithinSla = withTimes.filter((t) => t.resolvedAt <= t.slaDeadline).length;
  const resolvedBreached = withTimes.length - resolvedWithinSla;
  const complianceRate = withTimes.length === 0 ? 1 : resolvedWithinSla / withTimes.length;

  const mttrMinutes =
    withTimes.length === 0
      ? null
      : Math.round(
          withTimes.reduce(
            (sum, t) => sum + (t.resolvedAt.getTime() - t.openedAt.getTime()),
            0
          ) /
            withTimes.length /
            MINUTE_MS
        );

  return {
    sla: { resolvedWithinSla, resolvedBreached, complianceRate, openBreached },
    mttrMinutes,
  };
}

async function buildTopCustomers(
  customerGroups: { customerId: string | null; _count: { _all: number } }[]
): Promise<ReportSummary["byCustomer"]> {
  const grouped = customerGroups.filter(
    (g): g is { customerId: string; _count: { _all: number } } => g.customerId !== null
  );
  if (grouped.length === 0) return [];

  const customers = await prisma.customer.findMany({
    where: { id: { in: grouped.map((g) => g.customerId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(customers.map((c) => [c.id, c.name]));

  return grouped.map((g) => ({
    customerId: g.customerId,
    name: nameById.get(g.customerId) ?? UNKNOWN_CUSTOMER_LABEL,
    ticketCount: g._count._all,
  }));
}

/**
 * Aggregate KPI / SLA metrics for the manager report over the last `days` days.
 * The window applies to ticket open dates, ticket resolution dates, and alert
 * receipt dates; `sla.openBreached` is a current-state metric on purpose.
 */
export async function getReportSummary(days: number): Promise<ReportSummary> {
  if (!Number.isFinite(days) || days < MIN_REPORT_DAYS) {
    throw new Error(`Report window days must be a finite number >= ${MIN_REPORT_DAYS} (received ${days})`);
  }

  const now = new Date();
  const since = new Date(now.getTime() - days * DAY_MS);

  const [
    statusGroups,
    priorityGroups,
    resolvedTickets,
    openBreached,
    customerGroups,
    alertTotal,
    severityGroups,
    platformGroups,
    autoResolvedCount,
  ] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["status"],
      where: { openedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.ticket.groupBy({
      by: ["priority"],
      where: { openedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: since }, status: { in: ["RESOLVED", "CLOSED"] } },
      select: { openedAt: true, resolvedAt: true, slaDeadline: true },
    }),
    prisma.ticket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, slaDeadline: { lt: now } },
    }),
    prisma.ticket.groupBy({
      by: ["customerId"],
      where: { openedAt: { gte: since }, customerId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { customerId: "desc" } },
      take: TOP_CUSTOMER_LIMIT,
    }),
    prisma.alert.count({ where: { receivedAt: { gte: since } } }),
    prisma.alert.groupBy({
      by: ["severity"],
      where: { receivedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.alert.groupBy({
      by: ["platform"],
      where: { receivedAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.alert.count({
      where: { receivedAt: { gte: since }, status: "AUTO_RESOLVED" },
    }),
  ]);

  const statusCount = (status: string) =>
    statusGroups.find((g) => g.status === status)?._count._all ?? 0;

  const byPriority = Object.fromEntries(
    TICKET_PRIORITIES.map((p) => [
      p,
      priorityGroups.find((g) => g.priority === p)?._count._all ?? 0,
    ])
  ) as Record<TicketPriority, number>;

  const bySeverity = Object.fromEntries(
    ALERT_SEVERITIES.map((s) => [
      s,
      severityGroups.find((g) => g.severity === s)?._count._all ?? 0,
    ])
  ) as Record<AlertSeverity, number>;

  const byPlatform = Object.fromEntries(
    platformGroups.map((g) => [g.platform, g._count._all])
  );

  const { sla, mttrMinutes } = buildSlaMetrics(resolvedTickets, openBreached);
  const byCustomer = await buildTopCustomers(customerGroups);

  return {
    tickets: {
      total: statusGroups.reduce((sum, g) => sum + g._count._all, 0),
      open: statusCount("OPEN") + statusCount("IN_PROGRESS"),
      resolved: statusCount("RESOLVED"),
      closed: statusCount("CLOSED"),
      byPriority,
    },
    sla,
    mttrMinutes,
    byCustomer,
    alerts: {
      total: alertTotal,
      bySeverity,
      byPlatform,
      autoResolvedRate: alertTotal === 0 ? 0 : autoResolvedCount / alertTotal,
    },
  };
}
