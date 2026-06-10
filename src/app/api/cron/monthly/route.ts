import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getReportSummary, ReportSummary } from "@/lib/reports";
import { sendEmail } from "@/lib/email-templates/config";

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function buildReportHtml(summary: ReportSummary): string {
  const mttr = summary.mttrMinutes === null ? "n/a" : `${Math.round(summary.mttrMinutes)} min`;
  const customerRows = summary.byCustomer
    .map((c) => `<tr><td>${c.name}</td><td>${c.ticketCount}</td></tr>`)
    .join("");

  return `
    <h2>VNOC Monthly SLA Report (last 30 days)</h2>
    <ul>
      <li>Total tickets: <strong>${summary.tickets.total}</strong></li>
      <li>SLA compliance: <strong>${formatPercent(summary.sla.complianceRate)}</strong></li>
      <li>Resolved within SLA: ${summary.sla.resolvedWithinSla} · breached: ${summary.sla.resolvedBreached}</li>
      <li>Open tickets past SLA right now: <strong>${summary.sla.openBreached}</strong></li>
      <li>MTTR: ${mttr}</li>
      <li>Alerts: ${summary.alerts.total} (auto-resolved ${formatPercent(summary.alerts.autoResolvedRate)})</li>
    </ul>
    <h3>Top customers by ticket volume</h3>
    <table border="1" cellpadding="4" cellspacing="0">
      <tr><th>Customer</th><th>Tickets</th></tr>${customerRows}
    </table>
  `;
}

function buildReportText(summary: ReportSummary): string {
  const mttr = summary.mttrMinutes === null ? "n/a" : `${Math.round(summary.mttrMinutes)} min`;
  return [
    "VNOC Monthly SLA Report (last 30 days)",
    `Total tickets: ${summary.tickets.total}`,
    `SLA compliance: ${formatPercent(summary.sla.complianceRate)}`,
    `Open tickets past SLA: ${summary.sla.openBreached}`,
    `MTTR: ${mttr}`,
    `Alerts: ${summary.alerts.total}`,
  ].join("\n");
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await getReportSummary(30);

    const recipients = await prisma.user.findMany({
      where: {
        active: true,
        OR: [{ isSuperAdmin: true }, { profile: { vnocRole: "MANAGER" } }],
      },
      select: { email: true },
    });

    let sent = 0;
    const errors: string[] = [];

    for (const { email } of recipients) {
      try {
        await sendEmail({
          to: email,
          subject: "VNOC Monthly SLA Report",
          html: buildReportHtml(summary),
          text: buildReportText(summary),
        });
        sent++;
      } catch (err) {
        errors.push(`${email}: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({ success: true, sent, errors });
  } catch (err) {
    console.error("Monthly cron failed:", err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
