import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Platform } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const customerId = searchParams.get("customerId");
  const platform = searchParams.get("platform") as Platform | null;
  const status = searchParams.get("status");
  const unassigned = searchParams.get("unassigned") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  const where = {
    ...(unassigned ? { roomId: null } : {}),
    ...(platform ? { platform } : {}),
    ...(status ? { status } : {}),
    ...(!unassigned && customerId
      ? { room: { site: { customerId } } }
      : {}),
  };

  const [devices, total] = await Promise.all([
    prisma.device.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, name: true, platform: true, platformId: true,
        model: true, status: true, lastSeenAt: true, macAddress: true,
        rawPayload: true,
        room: {
          select: {
            id: true, name: true,
            site: { select: { name: true, customer: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.device.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: devices, meta: { total, page, limit } });
}
