import { describe, it, expect, vi, beforeEach } from "vitest";

// ── mocks (must be declared before any import of the module under test) ───────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: { findMany: vi.fn() },
    activityLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/email-templates/config", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/sse-bus", () => ({
  emitSseEvent: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

// ── module under test (imported AFTER mocks) ─────────────────────────────────

import { runSlaWarningSweep } from "@/lib/sla-warnings";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-templates/config";
import { emitSseEvent } from "@/lib/sse-bus";
import { logError } from "@/lib/logger";

// ── typed mock helpers ────────────────────────────────────────────────────────

const mockTicketFindMany = vi.mocked(prisma.ticket.findMany);
const mockActivityLogFindMany = vi.mocked(prisma.activityLog.findMany);
const mockActivityLogCreate = vi.mocked(prisma.activityLog.create);
const mockUserFindMany = vi.mocked(prisma.user.findMany);
const mockSendEmail = vi.mocked(sendEmail);
const mockEmitSseEvent = vi.mocked(emitSseEvent);
const mockLogError = vi.mocked(logError);

// ── fixture helpers ───────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<{
  id: string;
  title: string;
  priority: string;
  slaDeadline: Date;
  customer: { name: string } | null;
  assignee: { profile: { firstName: string; lastName: string } | null } | null;
}> = {}) {
  return {
    id: "ticket-1",
    title: "Device offline – Room A",
    priority: "P2",
    slaDeadline: new Date(Date.now() + 30 * 60_000), // 30 min from now
    customer: { name: "Acme Corp" },
    assignee: { profile: { firstName: "Jane", lastName: "Doe" } },
    ...overrides,
  };
}

function makeRecipient(email: string) {
  return { email };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("runSlaWarningSweep", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: no activity log rows (nothing pre-warned)
    mockActivityLogFindMany.mockResolvedValue([] as never);
    // Default: no recipients
    mockUserFindMany.mockResolvedValue([] as never);
    // Default: activity log create succeeds
    mockActivityLogCreate.mockResolvedValue({} as never);
    // Default: sendEmail succeeds
    mockSendEmail.mockResolvedValue(undefined as never);
  });

  // ── 1. No at-risk tickets → no recipient query, no email ─────────────────

  it("returns { warned: 0, errors: [] } immediately when no at-risk tickets exist", async () => {
    mockTicketFindMany.mockResolvedValue([] as never);

    const result = await runSlaWarningSweep();

    expect(result).toEqual({ warned: 0, errors: [] });
    // Must NOT query recipients or send anything
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockEmitSseEvent).not.toHaveBeenCalled();
    expect(mockActivityLogCreate).not.toHaveBeenCalled();
  });

  // ── 2. All at-risk tickets already warned → no emails ────────────────────

  it("skips tickets that already have an sla_warning ActivityLog entry", async () => {
    const ticket = makeTicket({ id: "ticket-already-warned" });
    mockTicketFindMany.mockResolvedValue([ticket] as never);
    // Simulate an existing sla_warning log for this ticket
    mockActivityLogFindMany.mockResolvedValue([
      { id: "log-1", ticketId: "ticket-already-warned", type: "sla_warning" },
    ] as never);

    const result = await runSlaWarningSweep();

    expect(result).toEqual({ warned: 0, errors: [] });
    expect(mockUserFindMany).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockEmitSseEvent).not.toHaveBeenCalled();
    expect(mockActivityLogCreate).not.toHaveBeenCalled();
  });

  // ── 3. Two at-risk tickets, one already warned → only warns the other ────

  it("only processes tickets that have NOT already been warned (dedup via ActivityLog)", async () => {
    const alreadyWarned = makeTicket({ id: "t-warned", title: "Already warned" });
    const newTicket = makeTicket({ id: "t-new", title: "New breach" });

    mockTicketFindMany.mockResolvedValue([alreadyWarned, newTicket] as never);
    // Only t-warned has an existing log
    mockActivityLogFindMany.mockResolvedValue([
      { id: "log-1", ticketId: "t-warned", type: "sla_warning" },
    ] as never);
    mockUserFindMany.mockResolvedValue([makeRecipient("manager@example.com")] as never);

    const result = await runSlaWarningSweep();

    expect(result.warned).toBe(1);
    expect(result.errors).toEqual([]);
    // ActivityLog should only be created for the new ticket
    expect(mockActivityLogCreate).toHaveBeenCalledTimes(1);
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ticketId: "t-new" }) })
    );
  });

  // ── 4. One email per recipient with count + ticket title in html ──────────

  it("sends one summary email per recipient containing count and ticket title", async () => {
    const ticket = makeTicket({ id: "t-1", title: "Camera offline – Board Room" });
    mockTicketFindMany.mockResolvedValue([ticket] as never);
    mockUserFindMany.mockResolvedValue([
      makeRecipient("alice@example.com"),
      makeRecipient("bob@example.com"),
    ] as never);

    const result = await runSlaWarningSweep();

    expect(result.warned).toBe(1);
    // Exactly 2 emails sent (one per recipient)
    expect(mockSendEmail).toHaveBeenCalledTimes(2);

    const [firstCall, secondCall] = mockSendEmail.mock.calls;
    // Subject contains count
    expect(firstCall[0].subject).toMatch(/1 ticket/i);
    expect(secondCall[0].subject).toMatch(/1 ticket/i);
    // HTML contains the ticket title
    expect(firstCall[0].html).toContain("Camera offline – Board Room");
    expect(secondCall[0].html).toContain("Camera offline – Board Room");
    // Sent to correct addresses
    expect(firstCall[0].to).toBe("alice@example.com");
    expect(secondCall[0].to).toBe("bob@example.com");
  });

  // ── 5. Per-recipient email failure → errors[] but ActivityLog still written

  it("records per-recipient email failures in errors[] but still writes ActivityLog and emits SSE", async () => {
    const ticket = makeTicket({ id: "t-fail", title: "Failing ticket" });
    mockTicketFindMany.mockResolvedValue([ticket] as never);
    mockUserFindMany.mockResolvedValue([
      makeRecipient("good@example.com"),
      makeRecipient("bad@example.com"),
    ] as never);

    // bad@example.com fails
    mockSendEmail.mockImplementation(async ({ to }) => {
      if (to === "bad@example.com") throw new Error("SES throttled");
    });

    const result = await runSlaWarningSweep();

    // warned still counts the ticket (surfacing happened)
    expect(result.warned).toBe(1);
    // One error entry for the failed address
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/bad@example\.com/);
    expect(result.errors[0]).toMatch(/SES throttled/);

    // ActivityLog MUST still have been written for the ticket
    expect(mockActivityLogCreate).toHaveBeenCalledTimes(1);
    expect(mockActivityLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ticketId: "t-fail" }) })
    );

    // SSE event MUST still have been emitted
    expect(mockEmitSseEvent).toHaveBeenCalledTimes(1);
  });

  // ── 6. SSE event emitted once with correct shape ──────────────────────────

  it("emits one sla_warning SSE event with ticketIds and count", async () => {
    const t1 = makeTicket({ id: "t-sse-1", title: "Ticket A" });
    const t2 = makeTicket({ id: "t-sse-2", title: "Ticket B" });
    mockTicketFindMany.mockResolvedValue([t1, t2] as never);
    mockUserFindMany.mockResolvedValue([makeRecipient("mgr@example.com")] as never);

    await runSlaWarningSweep();

    expect(mockEmitSseEvent).toHaveBeenCalledTimes(1);
    expect(mockEmitSseEvent).toHaveBeenCalledWith("sla_warning", {
      ticketIds: expect.arrayContaining(["t-sse-1", "t-sse-2"]),
      count: 2,
    });
  });

  // ── 7. ActivityLog written with correct fields ────────────────────────────

  it("writes an ActivityLog row with type sla_warning and correct message for each warned ticket", async () => {
    const deadline = new Date("2025-12-01T10:00:00.000Z");
    const ticket = makeTicket({ id: "t-log", title: "Switch down", priority: "P1", slaDeadline: deadline });
    mockTicketFindMany.mockResolvedValue([ticket] as never);
    mockUserFindMany.mockResolvedValue([makeRecipient("mgr@example.com")] as never);

    await runSlaWarningSweep();

    expect(mockActivityLogCreate).toHaveBeenCalledWith({
      data: {
        type: "sla_warning",
        ticketId: "t-log",
        message: `SLA at risk: Switch down (PP1) due ${deadline.toISOString()}`,
      },
    });
  });

  // ── 8. Ticket query uses correct at-risk cutoff (OPEN + IN_PROGRESS, slaDeadline <= now+2h) ──

  it("queries only OPEN and IN_PROGRESS tickets with slaDeadline within the next 2 hours", async () => {
    mockTicketFindMany.mockResolvedValue([] as never);

    const before = Date.now();
    await runSlaWarningSweep();
    const after = Date.now();

    const call = mockTicketFindMany.mock.calls[0][0] as {
      where: { status: { in: string[] }; slaDeadline: { lte: Date } };
    };

    expect(call.where.status.in).toEqual(
      expect.arrayContaining(["OPEN", "IN_PROGRESS"])
    );

    const cutoff = call.where.slaDeadline.lte.getTime();
    // cutoff should be approximately now + 2 hours (within 5 seconds of tolerance)
    expect(cutoff).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000 - 5000);
    expect(cutoff).toBeLessThanOrEqual(after + 2 * 60 * 60 * 1000 + 5000);
  });
});
