import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      alert: {
        include: {
          device: {
            include: {
              room: {
                include: { site: { include: { customer: true } } },
              },
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

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: ticket });
}
