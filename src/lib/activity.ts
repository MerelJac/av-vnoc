import { prisma } from "@/lib/prisma";

/**
 * Fetch the most recent activity-log entries, excluding entries whose linked
 * alert came from a device that is not assigned to a room. Activity that has no
 * associated alert (e.g. manual/system events) is always kept.
 *
 * ActivityLog has no Prisma relation to Alert (only a loose `alertId` column),
 * so we resolve assignment with a second query against the referenced alerts.
 */
export async function getRecentActivity(limit = 20) {
  // Over-fetch so we can still return `limit` rows after filtering out noise.
  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit * 3,
  });

  const alertIds = [
    ...new Set(logs.map((l) => l.alertId).filter((id): id is string => Boolean(id))),
  ];

  const assignedAlertIds = alertIds.length
    ? new Set(
        (
          await prisma.alert.findMany({
            where: { id: { in: alertIds }, device: { roomId: { not: null } } },
            select: { id: true },
          })
        ).map((a) => a.id)
      )
    : new Set<string>();

  return logs
    .filter((l) => !l.alertId || assignedAlertIds.has(l.alertId))
    .slice(0, limit);
}
