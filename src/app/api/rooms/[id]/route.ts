// src/app/api/rooms/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const body = await req.json() as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const room = await prisma.room.update({
    where: { id },
    data: { name: body.name.trim() },
  });

  return NextResponse.json({ success: true, data: room });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.room.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const p = rawPayload as Record<string, unknown>;
  const room = p["room"] as { name?: string } | null | undefined;
  return room?.name ?? null;
}

function vendorRoomNameMatches(vendorName: string, roomName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const v = normalize(vendorName);
  const r = normalize(roomName);
  return v === r || v.includes(r) || r.includes(v);
}
