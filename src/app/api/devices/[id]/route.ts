import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { roomId?: string | null };

  const device = await prisma.device.update({
    where: { id },
    data: { roomId: body.roomId ?? null },
    select: {
      id: true, name: true, roomId: true,
      room: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ success: true, data: device });
}
