import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface KpiData {
  activeAlerts: number;
  openTickets: number;
  slaAtRisk: number;
  severityMap: Record<string, number>;
  roomsOnline: number;
  roomsTotal: number;
  mttrMinutes: number | null;
  slaCompliance: number | null;
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000);
  const yesterday = new Date(Date.now() - 24 * 3_600_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3_600_000);

  const [
    activeAlerts,
    openTickets,
    slaAtRisk,
    severityBreakdown,
    roomsOnline,
    roomsTotal,
    recentlyResolvedTickets,
  ] = await Promise.all([
    prisma.alert.count({ where: { status: "ACTIVE" } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.ticket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, slaDeadline: { lte: twoHoursFromNow } },
    }),
    prisma.alert.groupBy({
      by: ["severity"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.room.count({ where: { devices: { some: { status: "online" } } } }),
    prisma.room.count(),
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: yesterday }, status: { in: ["RESOLVED", "CLOSED"] } },
      select: { openedAt: true, resolvedAt: true },
    }),
  ]);

  let mttrMinutes: number | null = null;
  if (recentlyResolvedTickets.length > 0) {
    const totalMs = recentlyResolvedTickets.reduce((sum, t) => {
      if (!t.resolvedAt) return sum;
      return sum + (t.resolvedAt.getTime() - t.openedAt.getTime());
    }, 0);
    mttrMinutes = Math.round(totalMs / recentlyResolvedTickets.length / 60_000);
  }

  const resolvedTickets30d = await prisma.ticket.findMany({
    where: { resolvedAt: { gte: thirtyDaysAgo }, status: { in: ["RESOLVED", "CLOSED"] } },
    select: { resolvedAt: true, slaDeadline: true },
  });
  const onTimeCount = resolvedTickets30d.filter(
    (t) => t.resolvedAt && t.resolvedAt <= t.slaDeadline
  ).length;
  const slaCompliance =
    resolvedTickets30d.length > 0
      ? Math.round((onTimeCount / resolvedTickets30d.length) * 1000) / 10
      : null;

  const severityMap = Object.fromEntries(
    severityBreakdown.map((s) => [s.severity, s._count._all])
  );

  const data: KpiData = {
    activeAlerts,
    openTickets,
    slaAtRisk,
    severityMap,
    roomsOnline,
    roomsTotal,
    mttrMinutes,
    slaCompliance,
  };

  return NextResponse.json({ success: true, data });
}
