import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-templates/config";
import { emitSseEvent } from "@/lib/sse-bus";
import { logWarn, logError } from "@/lib/logger";

const AT_RISK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface SlaWarningSweepResult {
  warned: number;
  errors: string[];
}

/**
 * Finds OPEN/IN_PROGRESS tickets whose SLA deadline is within the next 2 hours
 * (or already breached), notifies MANAGER and super-admin users once per ticket
 * via SES email, writes an ActivityLog dedup record, and emits an SSE event.
 *
 * Idempotent: tickets already having an "sla_warning" ActivityLog row are
 * skipped so repeated cron runs don't spam recipients.
 */
export async function runSlaWarningSweep(): Promise<SlaWarningSweepResult> {
  const now = new Date();
  const atRiskCutoff = new Date(now.getTime() + AT_RISK_WINDOW_MS);

  // 1. Find candidates: OPEN or IN_PROGRESS with slaDeadline within 2 hours
  const candidates = await prisma.ticket.findMany({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      slaDeadline: { lte: atRiskCutoff },
    },
    select: {
      id: true,
      title: true,
      priority: true,
      slaDeadline: true,
      customer: { select: { name: true } },
      assignee: {
        select: { profile: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  if (candidates.length === 0) {
    return { warned: 0, errors: [] };
  }

  // 2. Dedup: find which candidates already have an sla_warning log
  const candidateIds = candidates.map((t) => t.id);
  const existingLogs = await prisma.activityLog.findMany({
    where: { type: "sla_warning", ticketId: { in: candidateIds } },
    select: { ticketId: true },
  });
  const alreadyWarnedIds = new Set(
    existingLogs.map((l) => l.ticketId).filter((id): id is string => id !== null)
  );

  const unwarnedTickets = candidates.filter((t) => !alreadyWarnedIds.has(t.id));

  if (unwarnedTickets.length === 0) {
    return { warned: 0, errors: [] };
  }

  // 3. Fetch recipients: active MANAGER users + super-admins
  const recipients = await prisma.user.findMany({
    where: {
      active: true,
      OR: [{ isSuperAdmin: true }, { profile: { vnocRole: "MANAGER" } }],
    },
    select: { email: true },
  });

  const count = unwarnedTickets.length;
  const subject = `VNOC SLA warning: ${count} ticket${count === 1 ? "" : "s"} at risk`;
  const html = buildWarningHtml(unwarnedTickets);
  const text = buildWarningText(unwarnedTickets);

  // 4. Send one summary email per recipient; collect per-address failures
  const errors: string[] = [];
  for (const { email } of recipients) {
    try {
      await sendEmail({ to: email, subject, html, text });
    } catch (err) {
      const msg = `${email}: ${(err as Error).message}`;
      errors.push(msg);
      logError("sla-warnings", "failed to send warning email", { email, error: err as Error });
    }
  }

  // 5. Write ActivityLog dedup record for each newly-warned ticket
  //    (written even when some emails failed — surfacing already happened)
  for (const ticket of unwarnedTickets) {
    await prisma.activityLog.create({
      data: {
        type: "sla_warning",
        ticketId: ticket.id,
        message: `SLA at risk: ${ticket.title} (P${ticket.priority}) due ${ticket.slaDeadline.toISOString()}`,
      },
    });
  }

  // 6. Emit a single SSE event so the live manager view updates immediately
  const ticketIds = unwarnedTickets.map((t) => t.id);
  emitSseEvent("sla_warning", { ticketIds, count });
  logWarn("sla-warnings", `SLA warning sweep: ${count} ticket(s) at risk`, {
    ticketIds,
    emailErrors: errors.length,
  });

  return { warned: count, errors };
}

// ── HTML / text builders ──────────────────────────────────────────────────────

type WarningTicket = {
  id: string;
  title: string;
  priority: string;
  slaDeadline: Date;
  customer: { name: string } | null;
  assignee: { profile: { firstName: string; lastName: string } | null } | null;
};

function formatDeadline(deadline: Date): string {
  return deadline.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

function buildWarningHtml(tickets: WarningTicket[]): string {
  const rows = tickets
    .map(
      (t) => `
      <tr>
        <td style="padding:4px 8px">${escapeHtml(t.title)}</td>
        <td style="padding:4px 8px">${t.priority}</td>
        <td style="padding:4px 8px">${formatDeadline(t.slaDeadline)}</td>
        <td style="padding:4px 8px">${escapeHtml(t.customer?.name ?? "—")}</td>
      </tr>`
    )
    .join("");

  return `
    <h2>VNOC SLA Warning: ${tickets.length} Ticket${tickets.length === 1 ? "" : "s"} At Risk</h2>
    <p>The following ticket${tickets.length === 1 ? " is" : "s are"} approaching or have passed their SLA deadline:</p>
    <table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse">
      <thead>
        <tr>
          <th style="padding:4px 8px">Ticket</th>
          <th style="padding:4px 8px">Priority</th>
          <th style="padding:4px 8px">SLA Deadline</th>
          <th style="padding:4px 8px">Customer</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Please review and action these tickets immediately.</p>
  `;
}

function buildWarningText(tickets: WarningTicket[]): string {
  const lines = tickets.map(
    (t) =>
      `- [${t.priority}] ${t.title} | ${t.customer?.name ?? "—"} | due ${formatDeadline(t.slaDeadline)}`
  );
  return [
    `VNOC SLA Warning: ${tickets.length} ticket${tickets.length === 1 ? "" : "s"} at risk`,
    "",
    ...lines,
    "",
    "Please review and action these tickets immediately.",
  ].join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
