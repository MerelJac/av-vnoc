import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KpiStrip } from "./KpiStrip";
import { AlertsFeed } from "./AlertsFeed";
import { TicketsFeed } from "./TicketsFeed";
import { ActivityFeed } from "./ActivityFeed";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000);

  const [
    activeAlerts,
    openTickets,
    devicesOnline,
    devicesTotal,
    slaAtRisk,
    recentAlerts,
    myTickets,
    activityLogs,
  ] = await Promise.all([
    prisma.alert.count({ where: { status: "ACTIVE" } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.device.count({ where: { status: "online" } }),
    prisma.device.count(),
    prisma.ticket.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        slaDeadline: { lte: twoHoursFromNow },
      },
    }),
    prisma.alert.findMany({
      where: { status: "ACTIVE" },
      orderBy: { receivedAt: "desc" },
      take: 10,
      include: {
        device: { select: { name: true, room: { select: { name: true } } } },
      },
    }),
    prisma.ticket.findMany({
      where: {
        assignedTo: session.user.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      orderBy: [{ priority: "asc" }, { slaDeadline: "asc" }],
      take: 10,
      include: { customer: { select: { name: true } } },
    }),
    prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  // Serialize Date objects to ISO strings for client components
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">VNOC Operations</h1>
        <p className="text-muted text-sm mt-1">Live dashboard · updates in real time</p>
      </div>

      <KpiStrip
        initial={{ activeAlerts, openTickets, devicesOnline, devicesTotal, slaAtRisk }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertsFeed initial={serializedAlerts} />
        <TicketsFeed initial={serializedTickets} />
      </div>

      <ActivityFeed initial={serializedLogs} />
    </div>
  );
}
