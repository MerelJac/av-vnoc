import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface KpiData {
  activeAlerts: number;
  openTickets: number;
  devicesOnline: number;
  devicesTotal: number;
  slaAtRisk: number;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000);

  const [activeAlerts, openTickets, devicesOnline, devicesTotal, slaAtRisk] =
    await Promise.all([
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
    ]);

  const data: KpiData = {
    activeAlerts,
    openTickets,
    devicesOnline,
    devicesTotal,
    slaAtRisk,
  };

  return NextResponse.json({ success: true, data });
}
