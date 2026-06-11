import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds, customerTenancyWhere } from "@/lib/tenancy";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // null = unrestricted (super-admin, MANAGER, or zero assignments).
  const accessibleCustomerIds = await getAccessibleCustomerIds(session.user);

  const customers = await prisma.customer.findMany({
    where: customerTenancyWhere(accessibleCustomerIds),
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        include: {
          rooms: {
            orderBy: { name: "asc" },
            include: {
              devices: { select: { id: true, status: true } },
              _count: { select: { alerts: { where: { status: "ACTIVE" } } } },
            },
          },
        },
      },
    },
  });

  const data = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    sites: customer.sites.map((site) => ({
      id: site.id,
      name: site.name,
      city: site.city,
      state: site.state,
      rooms: site.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        totalDevices: room.devices.length,
        onlineDevices: room.devices.filter((d) => d.status === "online").length,
        activeAlerts: room._count.alerts,
      })),
    })),
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { siteId?: string; name?: string };
  if (!body.name?.trim() || !body.siteId) {
    return NextResponse.json({ error: "siteId and name are required" }, { status: 400 });
  }

  const room = await prisma.room.create({
    data: { siteId: body.siteId, name: body.name.trim() },
  });

  return NextResponse.json({ success: true, data: room }, { status: 201 });
}
