import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getRecentActivity } from "@/lib/activity";
import { KpiStrip } from "./KpiStrip";
import { AlertsFeed } from "./AlertsFeed";
import { TicketsFeed } from "./TicketsFeed";
import { ActivityFeed } from "./ActivityFeed";
import { CustomerSiteMap } from "./CustomerSiteMap";
import { RoomControl } from "./RoomControl";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const now = new Date();
  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000);
  const yesterday = new Date(Date.now() - 24 * 3_600_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3_600_000);

  const [
    activeAlerts,
    openTickets,
    slaAtRisk,
    severityBreakdown,
    recentAlerts,
    myTickets,
    activityLogs,
    roomsOnline,
    roomsTotal,
    recentlyResolvedTickets,
    customers,
    rooms,
  ] = await Promise.all([
    prisma.alert.count({ where: { status: "ACTIVE", device: { roomId: { not: null } } } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.ticket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, slaDeadline: { lte: twoHoursFromNow } },
    }),
    prisma.alert.groupBy({
      by: ["severity"],
      where: { status: "ACTIVE", device: { roomId: { not: null } } },
      _count: { _all: true },
    }),
    prisma.alert.findMany({
      where: { status: "ACTIVE", device: { roomId: { not: null } } },
      orderBy: { receivedAt: "desc" },
      take: 10,
      include: {
        device: {
          select: {
            name: true,
            room: {
              select: {
                name: true,
                site: { select: { customer: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.ticket.findMany({
      where: { assignedTo: session.user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ priority: "asc" }, { slaDeadline: "asc" }],
      take: 10,
      include: { customer: { select: { name: true } } },
    }),
    getRecentActivity(20),
    prisma.room.count({ where: { devices: { some: { status: "online" } } } }),
    prisma.room.count(),
    prisma.ticket.findMany({
      where: { resolvedAt: { gte: yesterday }, status: { in: ["RESOLVED", "CLOSED"] } },
      select: { openedAt: true, resolvedAt: true },
    }),
    prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        sites: { select: { id: true, lat: true, lng: true, _count: { select: { rooms: true } } } },
      },
    }),
    prisma.room.findMany({
      take: 20,
      orderBy: { name: "asc" },
      include: { devices: { select: { id: true, name: true, model: true, status: true } } },
    }),
  ]);

  // MTTR: average minutes to resolve over last 24h
  let mttrMinutes: number | null = null;
  if (recentlyResolvedTickets.length > 0) {
    const totalMs = recentlyResolvedTickets.reduce((sum, t) => {
      if (!t.resolvedAt) return sum;
      return sum + (t.resolvedAt.getTime() - t.openedAt.getTime());
    }, 0);
    mttrMinutes = Math.round(totalMs / recentlyResolvedTickets.length / 60_000);
  }

  // SLA compliance: need to check resolvedAt <= slaDeadline at DB level
  // Approximate: fetch resolved tickets in 30d and count on-time
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

  const serializedAlerts = recentAlerts.map((a) => ({
    ...a,
    receivedAt: a.receivedAt.toISOString(),
    autoCloseAt: a.autoCloseAt?.toISOString() ?? null,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  const serializedTickets = myTickets.map((t) => ({
    ...t,
    slaDeadline: t.slaDeadline.toISOString(),
    openedAt: t.openedAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  const serializedLogs = activityLogs.map((l) => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
  }));

  const serializedRooms = rooms.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    devices: r.devices.map((d) => ({
      ...d,
      lastSeenAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    })),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[17px] font-bold text-[#1a202c]">VNOC Operations</h1>
        <p className="text-[#718096] text-[12px] mt-0.5">Live dashboard · updates in real time</p>
      </div>

      <KpiStrip
        initial={{
          activeAlerts,
          openTickets,
          slaAtRisk,
          severityMap,
          roomsOnline,
          roomsTotal,
          mttrMinutes,
          slaCompliance,
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-3">
        <div className="flex flex-col gap-3">
          <AlertsFeed initial={serializedAlerts} />
          <ActivityFeed initial={serializedLogs} />
        </div>
        <div className="flex flex-col gap-3">
          <TicketsFeed initial={serializedTickets} />
          <CustomerSiteMap customers={customers} />
          <RoomControl rooms={serializedRooms} />
        </div>
      </div>
    </div>
  );
}
