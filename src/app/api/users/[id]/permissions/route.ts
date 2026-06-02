import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z
  .object({
    vnocRole: z.enum(["TIER1", "TIER2", "MANAGER"]).nullable().optional(),
    isSuperAdmin: z.boolean().optional(),
  })
  .refine((d) => d.vnocRole !== undefined || d.isSuperAdmin !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  if (id === session.user.id && parsed.data.isSuperAdmin === false) {
    return NextResponse.json(
      { error: "You cannot remove your own super-admin access" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    if (parsed.data.isSuperAdmin !== undefined) {
      await prisma.user.update({ where: { id }, data: { isSuperAdmin: parsed.data.isSuperAdmin } });
    }
    if (parsed.data.vnocRole !== undefined) {
      await prisma.profile.update({ where: { userId: id }, data: { vnocRole: parsed.data.vnocRole } });
    }
    await prisma.activityLog.create({
      data: {
        type: "user_role_changed",
        userId: session.user.id,
        message: `Updated roles for ${user.email}`,
        meta: { targetUserId: id, ...parsed.data },
      },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to update permissions:", err);
    return NextResponse.json({ error: "Failed to update permissions" }, { status: 500 });
  }
}
