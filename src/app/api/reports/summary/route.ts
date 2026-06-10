import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getReportSummary,
  DEFAULT_REPORT_DAYS,
  MIN_REPORT_DAYS,
  MAX_REPORT_DAYS,
} from "@/lib/reports";

function parseWindowDays(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return DEFAULT_REPORT_DAYS;
  return Math.min(MAX_REPORT_DAYS, Math.max(MIN_REPORT_DAYS, parsed));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Reports are restricted to VNOC managers and platform super admins.
  const canViewReports = session.user.isSuperAdmin || session.user.vnocRole === "MANAGER";
  if (!canViewReports) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const days = parseWindowDays(req.nextUrl.searchParams.get("days"));

  try {
    const data = await getReportSummary(days);
    return NextResponse.json({ success: true, data, meta: { days } });
  } catch (err) {
    console.error("Failed to build report summary:", err);
    return NextResponse.json(
      { success: false, error: "Failed to build report summary" },
      { status: 500 }
    );
  }
}
