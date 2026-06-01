import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { siteUpdateSchema } from "@/lib/customer-site-schemas";

type RouteContext = { params: Promise<{ id: string }> };

async function siteImpact(siteId: string) {
  const [rooms, devices] = await Promise.all([
    prisma.room.count({ where: { siteId } }),
    prisma.device.count({ where: { room: { siteId } } }),
  ]);
  return { rooms, devices };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    select: { id: true, name: true, customerId: true, address: true, city: true, state: true, lat: true, lng: true },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await siteImpact(id);
  return NextResponse.json({ success: true, data: { ...site, impact } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = siteUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const site = await prisma.site.update({ where: { id }, data: parsed.data });
    await prisma.activityLog.create({
      data: { type: "site_updated", userId: session.user.id, message: `Site "${site.name}" updated`, meta: { siteId: site.id } },
    });
    return NextResponse.json({ success: true, data: site });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Failed to update site:", err);
    return NextResponse.json({ error: "Failed to update site" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await siteImpact(id);

  try {
    await prisma.site.delete({ where: { id } });
    await prisma.activityLog.create({
      data: {
        type: "site_deleted",
        userId: session.user.id,
        message: `Site "${site.name}" deleted (${impact.rooms} rooms, ${impact.devices} devices)`,
        meta: { siteId: id, counts: impact },
      },
    });
    return NextResponse.json({ success: true, data: { impact } });
  } catch (err) {
    console.error("Failed to delete site:", err);
    return NextResponse.json({ error: "Failed to delete site" }, { status: 500 });
  }
}
