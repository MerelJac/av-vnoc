import { NextResponse } from "next/server";
import { syncAllDevices } from "@/lib/integrations/sync";
import { runAutoResolveSweep } from "@/lib/correlation";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { synced, errors } = await syncAllDevices();

    let autoResolved = 0;
    try {
      const sweep = await runAutoResolveSweep();
      autoResolved = sweep.resolved;
    } catch (err) {
      errors.push(`Auto-resolve sweep failed: ${(err as Error).message}`);
    }

    return NextResponse.json({ success: true, synced, errors, autoResolved });
  } catch (err) {
    console.error("Daily cron failed:", err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
