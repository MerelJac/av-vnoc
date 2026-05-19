// src/app/api/cron/daily/route.ts
import { NextResponse } from "next/server";


export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("🚀 Starting daily cron jobs...");



    // console.log("✅ Daily cron completed", { missedWorkouts });

    // return NextResponse.json({
    //   success: true,
    //   missedWorkouts,
    // });
  } catch (err) {
    console.error("❌ Daily cron failed:", err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
