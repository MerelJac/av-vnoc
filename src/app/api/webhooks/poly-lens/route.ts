import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const sig = req.headers.get("x-poly-signature") ?? "";

  let adapter: Awaited<ReturnType<typeof createPolyLensAdapter>>;
  try {
    adapter = await createPolyLensAdapter();
  } catch {
    return NextResponse.json({ error: "Adapter unavailable" }, { status: 503 });
  }

  const isValid = adapter.verifyWebhookSignature(rawBody, sig);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventId =
    typeof payload === "object" &&
    payload !== null &&
    "eventId" in payload &&
    typeof (payload as Record<string, unknown>).eventId === "string"
      ? ((payload as Record<string, unknown>).eventId as string)
      : "";

  const existing = await prisma.webhookEvent.findUnique({
    where: { platform_eventId: { platform: "POLY_LENS", eventId } },
  });

  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      platform: "POLY_LENS",
      eventId,
      payload: payload as object,
    },
  });

  const normalized = adapter.normalizeWebhookPayload(payload);

  if (normalized === null) {
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    // @ts-expect-error -- correlation module implemented in Plan 04
    const { processAlert } = await import("@/lib/correlation");
    await processAlert(normalized);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { error: message },
    });
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
