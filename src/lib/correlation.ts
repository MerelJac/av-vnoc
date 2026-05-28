import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { NormalizedAlert } from "@/lib/integrations/types";
import { emitSseEvent } from "@/lib/sse-bus";
import type { AlertSeverity, Platform, TicketPriority } from "@prisma/client";

export type CorrelationAction = "deduped" | "suppressed" | "created";

export interface CorrelationResult {
  action: CorrelationAction;
  alertId?: string;
  ticketId?: string;
}

const SEVERITY_TO_PRIORITY: Record<AlertSeverity, TicketPriority> = {
  CRITICAL: "P1",
  HIGH: "P2",
  MEDIUM: "P3",
  LOW: "P4",
  INFO: "P4",
};

const SLA_HOURS: Record<TicketPriority, number> = {
  P1: 1,
  P2: 4,
  P3: 8,
  P4: 24,
};

// Prisma type for device with room/site/customer
type DeviceWithRoom = Prisma.DeviceGetPayload<{
  include: { room: { include: { site: { include: { customer: true } } } } };
}>;

async function createTicketForAlert(
  alert: { id: string; title: string; severity: AlertSeverity; description: string | null },
  platform: Platform,
  customerId: string | null
): Promise<{ id: string; title: string; priority: TicketPriority }> {
  const priority = SEVERITY_TO_PRIORITY[alert.severity];
  const slaDeadline = new Date(Date.now() + SLA_HOURS[priority] * 3_600_000);

  const ticket = await prisma.ticket.create({
    data: {
      alertId: alert.id,
      customerId,
      priority,
      status: "OPEN",
      title: alert.title,
      description: alert.description ?? null,
      slaDeadline,
    },
  });

  await prisma.activityLog.create({
    data: {
      type: "ticket_created",
      platform,
      alertId: alert.id,
      ticketId: ticket.id,
      message: `Ticket auto-created for alert: ${alert.title}`,
    },
  });

  return ticket;
}

async function handleRoomOutage(
  alert: { id: string },
  device: DeviceWithRoom | null,
  roomId: string
): Promise<void> {
  const existingRoomGroup = await prisma.alertGroup.findFirst({
    where: { roomId, type: "ROOM_OUTAGE", resolvedAt: null },
  });

  const roomGroup =
    existingRoomGroup ??
    (await prisma.alertGroup.create({
      data: {
        type: "ROOM_OUTAGE",
        roomId,
        siteId: device?.room?.siteId ?? null,
        customerId: device?.room?.site?.customerId ?? null,
      },
    }));

  await prisma.alert.update({
    where: { id: alert.id },
    data: { groupId: roomGroup.id },
  });

  // Check for SITE_OUTAGE escalation (3+ rooms at same site)
  if (device?.room?.siteId) {
    const activeRoomGroupsAtSite = await prisma.alertGroup.count({
      where: { siteId: device.room.siteId, type: "ROOM_OUTAGE", resolvedAt: null },
    });

    if (activeRoomGroupsAtSite >= 3) {
      const existingSiteGroup = await prisma.alertGroup.findFirst({
        where: { siteId: device.room.siteId, type: "SITE_OUTAGE", resolvedAt: null },
      });

      if (!existingSiteGroup) {
        await prisma.alertGroup.create({
          data: {
            type: "SITE_OUTAGE",
            siteId: device.room.siteId,
            customerId: device.room.site?.customerId ?? null,
          },
        });
      }
    }
  }
}

async function persistAlert(
  normalized: NormalizedAlert,
  deviceId: string | null,
  roomId: string | null
): Promise<{ id: string; roomId: string | null; title: string; severity: AlertSeverity; description: string | null }> {
  const autoCloseAt = new Date(normalized.receivedAt.getTime() + 60_000);
  return prisma.alert.create({
    data: {
      platform: normalized.platform,
      platformAlertId: normalized.platformAlertId,
      deviceId,
      roomId,
      severity: normalized.severity,
      status: "ACTIVE",
      title: normalized.title,
      description: normalized.description ?? null,
      rawPayload: normalized.rawPayload as object,
      receivedAt: normalized.receivedAt,
      autoCloseAt,
    },
  });
}

export async function processAlert(
  normalized: NormalizedAlert
): Promise<CorrelationResult> {
  // Pass 1: Dedup — check for an existing ACTIVE or ACKNOWLEDGED alert
  // with the same platform + platformAlertId
  const existing = await prisma.alert.findFirst({
    where: {
      platform: normalized.platform,
      platformAlertId: normalized.platformAlertId,
      status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
    },
  });

  if (existing) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: { receivedAt: normalized.receivedAt },
    });
    return { action: "deduped", alertId: existing.id };
  }

  // Device lookup
  const device = await prisma.device.findUnique({
    where: {
      platform_platformId: {
        platform: normalized.platform,
        platformId: normalized.platformDeviceId,
      },
    },
    include: { room: { include: { site: { include: { customer: true } } } } },
  });

  // Pass 2: Alert persistence with flap suppression (autoCloseAt = receivedAt + 60 seconds)
  const alert = await persistAlert(normalized, device?.id ?? null, device?.roomId ?? null);

  // Pass 3: Pattern grouping — call assignAlertGroup
  await assignAlertGroup(alert, device as DeviceWithRoom | null);

  // Ticket auto-creation
  const customerId = device?.room?.site?.customerId ?? null;
  const ticket = await createTicketForAlert(alert, normalized.platform, customerId);

  // SSE events
  emitSseEvent("alert_created", { id: alert.id, title: alert.title, severity: alert.severity });
  emitSseEvent("ticket_opened", { id: ticket.id, title: ticket.title, priority: ticket.priority });
  emitSseEvent("kpi_updated", {});

  return { action: "created", alertId: alert.id, ticketId: ticket.id };
}

export async function runAutoResolveSweep(): Promise<{ resolved: number }> {
  const now = new Date();

  // Find all ACTIVE alerts past their autoCloseAt window
  const candidates = await prisma.alert.findMany({
    where: {
      status: "ACTIVE",
      autoCloseAt: { lte: now },
    },
    select: { id: true, deviceId: true, autoCloseAt: true },
  });

  let resolved = 0;

  for (const alert of candidates) {
    if (!alert.deviceId) continue;

    const device = await prisma.device.findUnique({
      where: { id: alert.deviceId },
      select: { status: true },
    });

    if (!device || device.status !== "online") continue;

    await prisma.alert.update({
      where: { id: alert.id },
      data: { status: "AUTO_RESOLVED", resolvedAt: now },
    });

    await prisma.activityLog.create({
      data: {
        type: "auto_resolved",
        alertId: alert.id,
        message: "Alert auto-resolved: device returned online within flap window",
      },
    });

    emitSseEvent("alert_resolved", { id: alert.id });
    resolved++;
  }

  return { resolved };
}

async function assignAlertGroup(
  alert: { id: string; roomId: string | null },
  device: DeviceWithRoom | null
): Promise<void> {
  if (!alert.roomId) {
    // No room context — DEVICE_FAULT group with no location
    const group = await prisma.alertGroup.create({
      data: {
        type: "DEVICE_FAULT",
        customerId: device?.room?.site?.customerId ?? null,
      },
    });
    await prisma.alert.update({
      where: { id: alert.id },
      data: { groupId: group.id },
    });
    return;
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);

  const recentRoomAlertCount = await prisma.alert.count({
    where: {
      roomId: alert.roomId,
      status: "ACTIVE",
      createdAt: { gte: twoMinutesAgo },
      id: { not: alert.id },
    },
  });

  if (recentRoomAlertCount >= 1) {
    // 2+ active devices in same room → ROOM_OUTAGE
    await handleRoomOutage(alert, device, alert.roomId);
  } else {
    // Single device — DEVICE_FAULT group
    const group = await prisma.alertGroup.create({
      data: {
        type: "DEVICE_FAULT",
        roomId: alert.roomId,
        siteId: device?.room?.siteId ?? null,
        customerId: device?.room?.site?.customerId ?? null,
      },
    });
    await prisma.alert.update({
      where: { id: alert.id },
      data: { groupId: group.id },
    });
  }
}
