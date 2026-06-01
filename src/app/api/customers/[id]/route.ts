import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { customerUpdateSchema } from "@/lib/customer-site-schemas";

type RouteContext = { params: Promise<{ id: string }> };

async function customerImpact(customerId: string) {
  const [sites, rooms, devices] = await Promise.all([
    prisma.site.count({ where: { customerId } }),
    prisma.room.count({ where: { site: { customerId } } }),
    prisma.device.count({ where: { room: { site: { customerId } } } }),
  ]);
  return { sites, rooms, devices };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await customerImpact(id);
  return NextResponse.json({ success: true, data: { ...customer, impact } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = customerUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.update({ where: { id }, data: { name: parsed.data.name } });
    await prisma.activityLog.create({
      data: { type: "customer_updated", userId: session.user.id, message: `Customer renamed to "${customer.name}"`, meta: { customerId: customer.id } },
    });
    return NextResponse.json({ success: true, data: customer });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Failed to update customer:", err);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await customerImpact(id);

  try {
    await prisma.customer.delete({ where: { id } });
    await prisma.activityLog.create({
      data: {
        type: "customer_deleted",
        userId: session.user.id,
        message: `Customer "${customer.name}" deleted (${impact.sites} sites, ${impact.rooms} rooms, ${impact.devices} devices)`,
        meta: { customerId: id, counts: impact },
      },
    });
    return NextResponse.json({ success: true, data: { impact } });
  } catch (err) {
    console.error("Failed to delete customer:", err);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
