import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { z } from "zod";

const MAX_ASSIGNMENTS = 500;

const putSchema = z.object({
  customerIds: z.array(z.string().min(1)).max(MAX_ASSIGNMENTS),
});

type RouteContext = { params: Promise<{ id: string }> };

/** List the customer ids assigned to a user. Super-admin only. */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const assignments = await prisma.customerAssignment.findMany({
    where: { userId: id },
    select: { customerId: true },
  });

  return NextResponse.json({
    success: true,
    data: { customerIds: assignments.map((assignment) => assignment.customerId) },
  });
}

/** Replace a user's customer assignments. Super-admin only. */
export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "customerIds must be an array of strings" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const customerIds = [...new Set(parsed.data.customerIds)];

  try {
    // Replace semantics: drop existing assignments, then recreate atomically.
    await prisma.$transaction([
      prisma.customerAssignment.deleteMany({ where: { userId: id } }),
      prisma.customerAssignment.createMany({
        data: customerIds.map((customerId) => ({ userId: id, customerId })),
      }),
    ]);

    await prisma.activityLog.create({
      data: {
        type: "permissions_changed",
        userId: session.user.id,
        message: `Updated customer assignments for ${user.email} (${customerIds.length === 0 ? "all customers" : `${customerIds.length} customer${customerIds.length === 1 ? "" : "s"}`})`,
        meta: { targetUserId: id, customerIds },
      },
    });

    return NextResponse.json({ success: true, data: { customerIds } });
  } catch (err) {
    logError("user-customers", "Failed to replace customer assignments", {
      error: err,
      targetUserId: id,
    });
    return NextResponse.json({ error: "Failed to update customer assignments" }, { status: 500 });
  }
}
