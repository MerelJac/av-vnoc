import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { customerCreateSchema } from "@/lib/customer-site-schemas";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, address: true, city: true, state: true,
          lat: true, lng: true, _count: { select: { rooms: true } },
        },
      },
    },
  });

  const data = customers.map((c) => ({
    id: c.id,
    name: c.name,
    sites: c.sites.map((s) => ({
      id: s.id, name: s.name, address: s.address, city: s.city,
      state: s.state, lat: s.lat, lng: s.lng, roomCount: s._count.rooms,
    })),
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = customerCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.create({ data: { name: parsed.data.name } });
    await prisma.activityLog.create({
      data: { type: "customer_created", userId: session.user.id, message: `Customer "${customer.name}" created`, meta: { customerId: customer.id } },
    });
    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (err) {
    console.error("Failed to create customer:", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
