import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AlertsTable } from "./AlertsTable";

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const alerts = await prisma.alert.findMany({
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: {
      device: { select: { name: true, model: true, room: { select: { name: true } } } },
      ticket: { select: { id: true, status: true, priority: true } },
    },
  });

  // Serialize Date objects for client component
  const serialized = alerts.map((a) => ({
    ...a,
    receivedAt: a.receivedAt.toISOString(),
    autoCloseAt: a.autoCloseAt?.toISOString() ?? null,
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">All Alerts</h1>
      <AlertsTable initial={serialized as Parameters<typeof AlertsTable>[0]["initial"]} />
    </div>
  );
}
