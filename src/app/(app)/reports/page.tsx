import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getReportSummary, DEFAULT_REPORT_DAYS } from "@/lib/reports";
import { ReportsClient } from "./ReportsClient";

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // KPI / SLA reporting is for VNOC managers and platform super admins only.
  const canViewReports = session.user.isSuperAdmin || session.user.vnocRole === "MANAGER";
  if (!canViewReports) redirect("/dashboard");

  const summary = await getReportSummary(DEFAULT_REPORT_DAYS);

  return <ReportsClient initialSummary={summary} initialDays={DEFAULT_REPORT_DAYS} />;
}
