import { prisma } from "@/lib/prisma";
import { NormalizedAlert } from "@/lib/integrations/types";
import { emitSseEvent } from "@/lib/sse-bus";

export type CorrelationAction = "deduped" | "suppressed" | "created";

export interface CorrelationResult {
  action: CorrelationAction;
  alertId?: string;
  ticketId?: string;
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

  // Passes 2–4 not yet implemented
  throw new Error("correlation: passes 2–4 not yet implemented");
}
