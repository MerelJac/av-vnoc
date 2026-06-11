import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds, alertTenancyWhere } from "@/lib/tenancy";
import { AlertStatus, AlertSeverity, Platform } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") as AlertStatus | null;
  const severity = searchParams.get("severity") as AlertSeverity | null;
  const platform = searchParams.get("platform") as Platform | null;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  // null = unrestricted (super-admin, MANAGER, or zero assignments).
  const accessibleCustomerIds = await getAccessibleCustomerIds(session.user);

  const where = {
    // Only surface alerts from devices assigned to a room.
    device: { roomId: { not: null } },
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(platform ? { platform } : {}),
    // Tenancy scoping goes under AND so it composes with the device guard above.
    ...(accessibleCustomerIds ? { AND: [alertTenancyWhere(accessibleCustomerIds)] } : {}),
  };

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        device: { select: { name: true, model: true, room: { select: { name: true } } } },
        ticket: { select: { id: true, status: true, priority: true } },
      },
    }),
    prisma.alert.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: alerts,
    meta: { total, page, limit },
  });
}
