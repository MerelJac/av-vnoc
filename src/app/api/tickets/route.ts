import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds, ticketTenancyWhere } from "@/lib/tenancy";
import { TicketStatus, TicketPriority } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const queue = searchParams.get("queue"); // "mine" filters to session.user.id
  const status = searchParams.get("status") as TicketStatus | null;
  const priority = searchParams.get("priority") as TicketPriority | null;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25")));

  // null = unrestricted (super-admin, MANAGER, or zero assignments).
  const accessibleCustomerIds = await getAccessibleCustomerIds(session.user);

  const where = {
    ...ticketTenancyWhere(accessibleCustomerIds),
    ...(queue === "mine" ? { assignedTo: session.user.id } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: [{ priority: "asc" }, { slaDeadline: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        alert: { select: { platform: true, severity: true, title: true } },
        assignee: { select: { profile: { select: { firstName: true, lastName: true } } } },
        customer: { select: { name: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: tickets,
    meta: { total, page, limit },
  });
}
