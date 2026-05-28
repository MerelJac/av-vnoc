import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TicketQueue } from "./TicketQueue";

export default async function TicketsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const tickets = await prisma.ticket.findMany({
    where: { assignedTo: session.user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: [{ priority: "asc" }, { slaDeadline: "asc" }],
    take: 50,
    include: {
      alert: { select: { platform: true, severity: true } },
      customer: { select: { name: true } },
      assignee: { include: { profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  // Serialize Date objects for client component
  const serialized = tickets.map((t) => ({
    ...t,
    slaDeadline: t.slaDeadline.toISOString(),
    openedAt: t.openedAt.toISOString(),
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    closedAt: t.closedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Ticket Queue</h1>
      <TicketQueue
        initial={serialized as Parameters<typeof TicketQueue>[0]["initial"]}
        userId={session.user.id}
      />
    </div>
  );
}
