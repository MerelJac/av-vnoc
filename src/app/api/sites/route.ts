import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { siteCreateSchema } from "@/lib/customer-site-schemas";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = siteCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId }, select: { id: true, name: true } });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  try {
    const site = await prisma.site.create({ data: parsed.data });
    await prisma.activityLog.create({
      data: { type: "site_created", userId: session.user.id, message: `Site "${site.name}" added to ${customer.name}`, meta: { siteId: site.id, customerId: customer.id } },
    });
    return NextResponse.json({ success: true, data: site }, { status: 201 });
  } catch (err) {
    console.error("Failed to create site:", err);
    return NextResponse.json({ error: "Failed to create site" }, { status: 500 });
  }
}
