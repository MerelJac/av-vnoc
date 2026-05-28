import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { emitSseEvent } from "@/lib/sse-bus";
import { VnocRole } from "@prisma/client";

const ActionSchema = z.object({
  type: z.enum(["NOTE", "REBOOT", "FIRMWARE_PUSH", "ESCALATE", "STATUS_CHANGE", "CONFIG_RESTORE"]),
  body: z.string().optional(),
  newStatus: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});

function canPerformAction(
  actionType: string,
  isSuperAdmin: boolean,
  vnocRole: VnocRole | null
): boolean {
  const tier1Actions = new Set(["NOTE", "REBOOT", "STATUS_CHANGE"]);
  if (tier1Actions.has(actionType)) return true;
  if (actionType === "ESCALATE") {
    return isSuperAdmin || vnocRole === "TIER2" || vnocRole === "MANAGER";
  }
  return isSuperAdmin;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, body: actionBody, newStatus } = parsed.data;

  if (!canPerformAction(type, session.user.isSuperAdmin, session.user.vnocRole)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, status: true, alert: { select: { deviceId: true } } },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Execute REBOOT action (fire-and-forget, errors logged but don't fail)
  if (type === "REBOOT" && ticket.alert.deviceId) {
    try {
      const device = await prisma.device.findUnique({
        where: { id: ticket.alert.deviceId },
        select: { platform: true, platformId: true },
      });
      if (device) {
        const { createPolyLensAdapter } = await import("@/lib/integrations/poly-lens");
        const { createYealinkAdapter } = await import("@/lib/integrations/yealink");
        const adapter =
          device.platform === "POLY_LENS"
            ? await createPolyLensAdapter()
            : device.platform === "YEALINK_YMCS"
            ? await createYealinkAdapter()
            : null;
        if (adapter) await adapter.rebootDevice(device.platformId);
      }
    } catch (err) {
      await prisma.activityLog.create({
        data: {
          type: "reboot_error",
          ticketId: id,
          message: `Reboot command failed: ${(err as Error).message}`,
        },
      });
    }
  }

  const action = await prisma.ticketAction.create({
    data: {
      ticketId: id,
      userId: session.user.id,
      type,
      body: actionBody ?? null,
    },
    include: {
      user: { include: { profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  if (type === "STATUS_CHANGE" && newStatus) {
    const resolvedAt = newStatus === "RESOLVED" ? new Date() : undefined;
    const closedAt = newStatus === "CLOSED" ? new Date() : undefined;

    await prisma.ticket.update({
      where: { id },
      data: { status: newStatus, resolvedAt, closedAt },
    });

    emitSseEvent("ticket_updated", { id, status: newStatus });
  }

  return NextResponse.json({ success: true, data: action });
}
