import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TicketDetail } from "./TicketDetail";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      alert: {
        include: {
          device: {
            include: {
              room: { include: { site: { include: { customer: true } } } },
            },
          },
        },
      },
      customer: true,
      assignee: {
        include: { profile: { select: { firstName: true, lastName: true } } },
      },
      actions: {
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            include: { profile: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });

  if (!ticket) notFound();

  // Serialize all Date fields for the client component
  const serialized = {
    ...ticket,
    slaDeadline: ticket.slaDeadline.toISOString(),
    openedAt: ticket.openedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    actions: ticket.actions.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    alert: ticket.alert ? {
      ...ticket.alert,
      receivedAt: ticket.alert.receivedAt.toISOString(),
      autoCloseAt: ticket.alert.autoCloseAt?.toISOString() ?? null,
      resolvedAt: ticket.alert.resolvedAt?.toISOString() ?? null,
      createdAt: ticket.alert.createdAt.toISOString(),
      updatedAt: ticket.alert.updatedAt.toISOString(),
    } : null,
  };

  return (
    <TicketDetail
      ticket={serialized as Parameters<typeof TicketDetail>[0]["ticket"]}
      vnocRole={session.user.vnocRole}
      isSuperAdmin={session.user.isSuperAdmin}
    />
  );
}
