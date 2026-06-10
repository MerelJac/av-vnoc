import { NextRequest, NextResponse } from "next/server";
import { Platform } from "@prisma/client";
import { createPolyLensAdapter } from "@/lib/integrations/poly-lens";
import { createYealinkAdapter } from "@/lib/integrations/yealink";
import { createLogiSyncAdapter } from "@/lib/integrations/logitech-sync";
import { createUtelogyAdapter } from "@/lib/integrations/utelogy";
import { PlatformAdapter } from "@/lib/integrations/types";
import { getConfig, updateConfig } from "@/lib/integrations/credentials";
import { processAlert, runAutoResolveSweep } from "@/lib/correlation";
import { logError } from "@/lib/logger";

interface PollResult {
  processed: number;
  errors: string[];
}

const POLLED_PLATFORMS: ReadonlyArray<{
  platform: Platform;
  createAdapter: () => Promise<PlatformAdapter>;
}> = [
  { platform: Platform.POLY_LENS, createAdapter: createPolyLensAdapter },
  { platform: Platform.YEALINK_YMCS, createAdapter: createYealinkAdapter },
  { platform: Platform.LOGITECH_SYNC, createAdapter: createLogiSyncAdapter },
  { platform: Platform.UTELOGY, createAdapter: createUtelogyAdapter },
];

async function pollPlatform(
  platform: Platform,
  createAdapter: () => Promise<PlatformAdapter>
): Promise<PollResult> {
  try {
    const config = await getConfig(platform);
    const since = config.lastPolledAt
      ? new Date(config.lastPolledAt as string)
      : new Date(Date.now() - 10 * 60_000);

    const adapter = await createAdapter();
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

    await updateConfig(platform, { lastPolledAt: new Date().toISOString() });
    if (errors.length > 0) {
      logError("cron:alerts", "some alerts failed to process", { platform, errors });
    }
    return { processed, errors };
  } catch (err) {
    logError("cron:alerts", "platform poll failed", { platform, error: err as Error });
    return { processed: 0, errors: [(err as Error).message] };
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, PollResult> = {};

  for (const { platform, createAdapter } of POLLED_PLATFORMS) {
    results[platform] = await pollPlatform(platform, createAdapter);
  }

  let autoResolved = 0;
  try {
    const sweep = await runAutoResolveSweep();
    autoResolved = sweep.resolved;
  } catch {
    // Sweep failure should not fail the whole cron run
  }

  return NextResponse.json({ ok: true, results, autoResolved });
}
