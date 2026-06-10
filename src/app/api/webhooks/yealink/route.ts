import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { processAlert } from "@/lib/correlation";
import { emitSseEvent } from "@/lib/sse-bus";
import { AlertSeverity } from "@prisma/client";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

interface YmcsEventData {
  id: string;
  event: string;
  mac: string;
  model: string;
}

interface YmcsWebhookEvent {
  id: string;
  type: string;
  createTime: number;
  partyId: string;
  data: YmcsEventData;
}

interface YmcsWebhookBody {
  events: YmcsWebhookEvent[];
}

function isYmcsWebhookBody(value: unknown): value is YmcsWebhookBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "events" in value &&
    Array.isArray((value as Record<string, unknown>).events)
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { allowed, retryAfterSeconds } = checkRateLimit(
    `yealink-webhook:${clientIpFrom(req)}`,
    RATE_LIMIT,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const rawBody = await req.text();
  const authHeader = req.headers.get("authorization") ?? "";

  let adapter: Awaited<ReturnType<typeof createYealinkAdapter>>;
  try {
    adapter = await createYealinkAdapter();
  } catch {
    return NextResponse.json({ error: "Adapter unavailable" }, { status: 503 });
  }

  if (!adapter.verifyWebhookSignature(rawBody, authHeader)) {
    return NextResponse.json({ error: "Invalid authorization token" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isYmcsWebhookBody(body)) {
    return NextResponse.json({ error: "Invalid webhook body shape" }, { status: 400 });
  }

  const results: Array<{ eventId: string; action: string }> = [];

  for (const event of body.events) {
    const existing = await prisma.webhookEvent.findUnique({
      where: { platform_eventId: { platform: "YEALINK_YMCS", eventId: event.id } },
    });

    if (existing) {
      results.push({ eventId: event.id, action: "deduped" });
      continue;
    }

    const webhookRecord = await prisma.webhookEvent.create({
      data: {
        platform: "YEALINK_YMCS",
        eventId: event.id,
        payload: event as object,
      },
    });

    try {
      if (event.type === "alarm.created") {
        const normalized = {
          platform: "YEALINK_YMCS" as const,
          platformAlertId: event.data.id,
          platformDeviceId: event.data.mac,
          severity: AlertSeverity.HIGH,
          title: `${event.data.event}: ${event.data.model || "Device"} (${event.data.mac})`,
          rawPayload: event,
          receivedAt: new Date(event.createTime),
        };

        await processAlert(normalized);
        results.push({ eventId: event.id, action: "alert_created" });

      } else if (event.type === "alarm.recovered") {
        const existingAlert = await prisma.alert.findFirst({
          where: {
            platform: "YEALINK_YMCS",
            platformAlertId: event.data.id,
            status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
          },
        });

        if (existingAlert) {
          await prisma.alert.update({
            where: { id: existingAlert.id },
            data: { status: "RESOLVED", resolvedAt: new Date() },
          });

          await prisma.activityLog.create({
            data: {
              type: "auto_resolved",
              platform: "YEALINK_YMCS",
              alertId: existingAlert.id,
              message: `Alert resolved via YMCS webhook: device ${event.data.mac} came back online`,
            },
          });

          emitSseEvent("alert_resolved", { id: existingAlert.id });
          emitSseEvent("kpi_updated", {});
        }

        results.push({ eventId: event.id, action: "alert_recovered" });

      } else {
        results.push({ eventId: event.id, action: "ignored_unknown_type" });
      }

      await prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: { processedAt: new Date() },
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await prisma.webhookEvent.update({
        where: { id: webhookRecord.id },
        data: { error: message },
      });
      results.push({ eventId: event.id, action: "error" });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
