// src/app/api/rooms/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractVendorRoomName } from "@/lib/device-utils";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      site: { include: { customer: { select: { id: true, name: true } } } },
      devices: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, platform: true, model: true,
          status: true, lastSeenAt: true, macAddress: true, rawPayload: true,
        },
      },
      _count: {
        select: {
          alerts: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const unassigned = await prisma.device.findMany({
    where: { roomId: null },
    select: { id: true, name: true, platform: true, model: true, rawPayload: true, status: true },
  });

  const suggestions = unassigned.filter((d) => {
    const vendorName = extractVendorRoomName(d.rawPayload);
    if (!vendorName) return false;
    return vendorRoomNameMatches(vendorName, room.name);
  });

  const onlineDevices = room.devices.filter((d) => d.status === "online").length;

  return NextResponse.json({
    success: true,
    data: {
      id: room.id,
      name: room.name,
      site: room.site,
      devices: room.devices,
      totalDevices: room.devices.length,
      onlineDevices,
      activeAlerts: room._count.alerts,
      suggestions,
    },
  });
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let body: { name?: string };
  try {
    body = await req.json() as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const room = await prisma.room.update({
      where: { id },
      data: { name: body.name.trim() },
    });
    return NextResponse.json({ success: true, data: room });
  } catch (err) {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.room.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const prismaErr = err as { code?: string };
    if (prismaErr.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }
}

function vendorRoomNameMatches(vendorName: string, roomName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const v = normalize(vendorName);
  const r = normalize(roomName);
  return v === r || v.includes(r) || r.includes(v);
}
