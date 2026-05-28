import { NextRequest, NextResponse } from "next/server";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { getConfig, updateConfig } from "@/lib/integrations/credentials";
// @ts-ignore -- implemented in Plan 04
import { processAlert } from "@/lib/correlation";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, { processed: number; errors: string[] }> = {};

  // Poll Poly Lens
  try {
    const config = await getConfig("POLY_LENS");
    const since = config.lastPolledAt
      ? new Date(config.lastPolledAt as string)
      : new Date(Date.now() - 10 * 60_000);
    const adapter = await createPolyLensAdapter();
    const alerts = await adapter.fetchRecentAlerts(since);
    let processed = 0;
    const errors: string[] = [];
    for (const alert of alerts) {
      try {
        await processAlert(alert);
        processed++;
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    await updateConfig("POLY_LENS", { lastPolledAt: new Date().toISOString() });
    results["POLY_LENS"] = { processed, errors };
  } catch (err) {
    results["POLY_LENS"] = { processed: 0, errors: [(err as Error).message] };
  }

  // Poll Yealink YMCS
  try {
    const config = await getConfig("YEALINK_YMCS");
    const since = config.lastPolledAt
      ? new Date(config.lastPolledAt as string)
      : new Date(Date.now() - 10 * 60_000);
    const adapter = await createYealinkAdapter();
    const alerts = await adapter.fetchRecentAlerts(since);
    let processed = 0;
    const errors: string[] = [];
    for (const alert of alerts) {
      try {
        await processAlert(alert);
        processed++;
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    await updateConfig("YEALINK_YMCS", { lastPolledAt: new Date().toISOString() });
    results["YEALINK_YMCS"] = { processed, errors };
  } catch (err) {
    results["YEALINK_YMCS"] = { processed: 0, errors: [(err as Error).message] };
  }

  return NextResponse.json({ ok: true, results });
}
