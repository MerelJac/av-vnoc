# VNOC Phase 2: Correlation Engine & Alert Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the correlation engine that processes every inbound `NormalizedAlert` through three sequential passes: dedup, flap suppression, and pattern grouping. After correlation, auto-create a `Ticket` with the correct priority and SLA deadline, emit SSE events for real-time UI updates, and add an auto-resolve sweep to the cron job.

**Architecture:** `src/lib/correlation.ts` is a single pure module called synchronously by both webhook routes (Plan 03) and the cron polling endpoint. It takes a `NormalizedAlert`, queries the DB, and writes: one `Alert`, one `AlertGroup`, one `Ticket`, and one `ActivityLog` row. SSE events are emitted via `vnocBus` after each write. The auto-resolve sweep runs inside the existing cron job.

**Tech Stack:** Prisma 7, Node.js, `src/lib/sse-bus.ts` (Plan 02)

**Prerequisites:** Plans 01, 02, and 03 must be complete.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/lib/correlation.ts` | Dedup → flap suppression → grouping → ticket creation |
| Modify | `src/app/api/cron/alerts/route.ts` | Add auto-resolve sweep after polling |

---

### Task 1: Implement Pass 1 — Dedup

**Files:**
- Create: `src/lib/correlation.ts` (initial version, grows through Tasks 1–4)

- [ ] **Step 1: Write the dedup test**

Create `src/test/correlation.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alert: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    alertGroup: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    device: {
      findUnique: vi.fn(),
    },
    ticket: {
      create: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/sse-bus', () => ({
  emitSseEvent: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { emitSseEvent } from '@/lib/sse-bus'
import { processAlert } from '@/lib/correlation'
import { Platform, AlertSeverity } from '@prisma/client'

const makeAlert = (overrides = {}) => ({
  platform: 'POLY_LENS' as Platform,
  platformAlertId: 'alert-001',
  platformDeviceId: 'device-001',
  severity: 'HIGH' as AlertSeverity,
  title: 'Device offline: Poly X50',
  rawPayload: {},
  receivedAt: new Date('2026-05-27T10:00:00Z'),
  ...overrides,
})

describe('processAlert - Pass 1: Dedup', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns deduped when an ACTIVE alert with same platformAlertId exists', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue({
      id: 'existing-alert-1',
      platform: 'POLY_LENS',
      platformAlertId: 'alert-001',
      status: 'ACTIVE',
    } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)

    const result = await processAlert(makeAlert())

    expect(result.action).toBe('deduped')
    expect(result.alertId).toBe('existing-alert-1')
    expect(prisma.alert.create).not.toHaveBeenCalled()
    expect(prisma.ticket.create).not.toHaveBeenCalled()
  })

  it('updates receivedAt on the existing alert when deduped', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue({
      id: 'existing-alert-1',
      platform: 'POLY_LENS',
      platformAlertId: 'alert-001',
      status: 'ACTIVE',
    } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)

    await processAlert(makeAlert())

    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'existing-alert-1' },
      data: { receivedAt: expect.any(Date) },
    })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/correlation.test.ts
```

Expected: FAIL — `@/lib/correlation` does not exist.

- [ ] **Step 3: Create src/lib/correlation.ts with Pass 1 only**

```typescript
import { prisma } from "@/lib/prisma";
import { AlertSeverity, TicketPriority } from "@prisma/client";
import { NormalizedAlert } from "@/lib/integrations/types";
import { emitSseEvent } from "@/lib/sse-bus";

export type CorrelationAction = "deduped" | "suppressed" | "created";

export interface CorrelationResult {
  action: CorrelationAction;
  alertId?: string;
  ticketId?: string;
}

export async function processAlert(
  normalized: NormalizedAlert
): Promise<CorrelationResult> {
  // ── Pass 1: Dedup ─────────────────────────────────────────────────────────
  const existing = await prisma.alert.findFirst({
    where: {
      platform: normalized.platform,
      platformAlertId: normalized.platformAlertId,
      status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
    },
  });

  if (existing) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: { receivedAt: normalized.receivedAt },
    });
    return { action: "deduped", alertId: existing.id };
  }

  // Remaining passes implemented in Tasks 2–4
  throw new Error("correlation: passes 2–4 not yet implemented");
}
```

- [ ] **Step 4: Run dedup tests to verify they pass**

```bash
npm run test:run -- src/test/correlation.test.ts
```

Expected: The two dedup tests pass. The remaining tests in the file (not yet written) are absent.

- [ ] **Step 5: Commit**

```bash
git add src/lib/correlation.ts src/test/correlation.test.ts
git commit -m "feat: add correlation engine Pass 1 — dedup"
```

---

### Task 2: Implement Pass 2 — Flap Suppression & Alert Persistence

**Files:**
- Modify: `src/lib/correlation.ts` (replace the `throw` stub with real implementation)
- Modify: `src/test/correlation.test.ts` (add Pass 2 tests)

- [ ] **Step 1: Add Pass 2 tests to src/test/correlation.test.ts**

Append to the existing test file:

```typescript
describe('processAlert - Pass 2: Alert persistence with autoCloseAt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a new alert with autoCloseAt 60s after receivedAt', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({
      id: 'new-alert-1',
      roomId: null,
    } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const receivedAt = new Date('2026-05-27T10:00:00Z')
    await processAlert(makeAlert({ receivedAt }))

    const createCall = vi.mocked(prisma.alert.create).mock.calls[0][0]
    const autoCloseAt = createCall.data.autoCloseAt as Date
    expect(autoCloseAt.getTime()).toBe(receivedAt.getTime() + 60_000)
  })
})
```

- [ ] **Step 2: Run to verify new test fails**

```bash
npm run test:run -- src/test/correlation.test.ts
```

Expected: New test fails (the `throw` stub is hit).

- [ ] **Step 3: Replace the stub in correlation.ts with Pass 2 + device lookup**

Replace `src/lib/correlation.ts` completely:

```typescript
import { prisma } from "@/lib/prisma";
import { AlertSeverity, TicketPriority } from "@prisma/client";
import { NormalizedAlert } from "@/lib/integrations/types";
import { emitSseEvent } from "@/lib/sse-bus";
import { Prisma } from "@prisma/client";

export type CorrelationAction = "deduped" | "suppressed" | "created";

export interface CorrelationResult {
  action: CorrelationAction;
  alertId?: string;
  ticketId?: string;
}

const SEVERITY_TO_PRIORITY: Record<AlertSeverity, TicketPriority> = {
  CRITICAL: "P1",
  HIGH: "P2",
  MEDIUM: "P3",
  LOW: "P4",
  INFO: "P4",
};

const SLA_HOURS: Record<TicketPriority, number> = {
  P1: 1,
  P2: 4,
  P3: 8,
  P4: 24,
};

type DeviceWithRoom = Prisma.DeviceGetPayload<{
  include: { room: { include: { site: { include: { customer: true } } } } };
}>;

export async function processAlert(
  normalized: NormalizedAlert
): Promise<CorrelationResult> {
  // ── Pass 1: Dedup ─────────────────────────────────────────────────────────
  const existing = await prisma.alert.findFirst({
    where: {
      platform: normalized.platform,
      platformAlertId: normalized.platformAlertId,
      status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
    },
  });

  if (existing) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: { receivedAt: normalized.receivedAt },
    });
    return { action: "deduped", alertId: existing.id };
  }

  // ── Device lookup ─────────────────────────────────────────────────────────
  const device = await prisma.device.findUnique({
    where: {
      platform_platformId: {
        platform: normalized.platform,
        platformId: normalized.platformDeviceId,
      },
    },
    include: { room: { include: { site: { include: { customer: true } } } } },
  });

  // ── Pass 2: Flap suppression — persist with autoCloseAt ──────────────────
  const autoCloseAt = new Date(normalized.receivedAt.getTime() + 60_000);

  const alert = await prisma.alert.create({
    data: {
      platform: normalized.platform,
      platformAlertId: normalized.platformAlertId,
      deviceId: device?.id ?? null,
      roomId: device?.roomId ?? null,
      severity: normalized.severity,
      status: "ACTIVE",
      title: normalized.title,
      description: normalized.description ?? null,
      rawPayload: normalized.rawPayload as object,
      receivedAt: normalized.receivedAt,
      autoCloseAt,
    },
  });

  // ── Pass 3: Pattern grouping ───────────────────────────────────────────────
  await assignAlertGroup(alert, device as DeviceWithRoom | null);

  // ── Ticket auto-creation ───────────────────────────────────────────────────
  const priority = SEVERITY_TO_PRIORITY[normalized.severity];
  const slaDeadline = new Date(Date.now() + SLA_HOURS[priority] * 3_600_000);

  const ticket = await prisma.ticket.create({
    data: {
      alertId: alert.id,
      customerId: device?.room?.site?.customerId ?? null,
      priority,
      status: "OPEN",
      title: alert.title,
      description: alert.description ?? null,
      slaDeadline,
    },
  });

  await prisma.activityLog.create({
    data: {
      type: "ticket_created",
      platform: normalized.platform,
      alertId: alert.id,
      ticketId: ticket.id,
      message: `Ticket auto-created for alert: ${alert.title}`,
    },
  });

  // ── SSE events ────────────────────────────────────────────────────────────
  emitSseEvent("alert_created", { id: alert.id, title: alert.title, severity: alert.severity });
  emitSseEvent("ticket_opened", { id: ticket.id, title: ticket.title, priority: ticket.priority });
  emitSseEvent("kpi_updated", {});

  return { action: "created", alertId: alert.id, ticketId: ticket.id };
}

async function assignAlertGroup(
  alert: { id: string; roomId: string | null },
  device: DeviceWithRoom | null
): Promise<void> {
  if (!alert.roomId) {
    // No room context — create a device_fault group with no location
    const group = await prisma.alertGroup.create({
      data: {
        type: "DEVICE_FAULT",
        customerId: device?.room?.site?.customerId ?? null,
      },
    });
    await prisma.alert.update({
      where: { id: alert.id },
      data: { groupId: group.id },
    });
    return;
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);

  const recentRoomAlertCount = await prisma.alert.count({
    where: {
      roomId: alert.roomId,
      status: "ACTIVE",
      createdAt: { gte: twoMinutesAgo },
      id: { not: alert.id },
    },
  });

  if (recentRoomAlertCount >= 1) {
    // 2+ active devices in same room → room_outage
    const existingRoomGroup = await prisma.alertGroup.findFirst({
      where: { roomId: alert.roomId, type: "ROOM_OUTAGE", resolvedAt: null },
    });

    const roomGroup =
      existingRoomGroup ??
      (await prisma.alertGroup.create({
        data: {
          type: "ROOM_OUTAGE",
          roomId: alert.roomId,
          siteId: device?.room?.siteId ?? null,
          customerId: device?.room?.site?.customerId ?? null,
        },
      }));

    await prisma.alert.update({
      where: { id: alert.id },
      data: { groupId: roomGroup.id },
    });

    // Check for site_outage escalation (3+ rooms at same site)
    if (device?.room?.siteId) {
      const activeRoomGroupsAtSite = await prisma.alertGroup.count({
        where: {
          siteId: device.room.siteId,
          type: "ROOM_OUTAGE",
          resolvedAt: null,
        },
      });

      if (activeRoomGroupsAtSite >= 3) {
        const existingSiteGroup = await prisma.alertGroup.findFirst({
          where: {
            siteId: device.room.siteId,
            type: "SITE_OUTAGE",
            resolvedAt: null,
          },
        });

        if (!existingSiteGroup) {
          await prisma.alertGroup.create({
            data: {
              type: "SITE_OUTAGE",
              siteId: device.room.siteId,
              customerId: device.room.site?.customerId ?? null,
            },
          });
        }
      }
    }
  } else {
    // Single device — device_fault group
    const group = await prisma.alertGroup.create({
      data: {
        type: "DEVICE_FAULT",
        roomId: alert.roomId,
        siteId: device?.room?.siteId ?? null,
        customerId: device?.room?.site?.customerId ?? null,
      },
    });
    await prisma.alert.update({
      where: { id: alert.id },
      data: { groupId: group.id },
    });
  }
}
```

- [ ] **Step 4: Run all correlation tests**

```bash
npm run test:run -- src/test/correlation.test.ts
```

Expected: All tests that exist pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/correlation.ts src/test/correlation.test.ts
git commit -m "feat: correlation engine Passes 2–3 (flap suppression, grouping) + ticket auto-creation"
```

---

### Task 3: Add grouping and ticket creation tests

**Files:**
- Modify: `src/test/correlation.test.ts`

- [ ] **Step 1: Add pattern grouping tests**

Append to `src/test/correlation.test.ts`:

```typescript
describe('processAlert - Pass 3: Pattern grouping', () => {
  beforeEach(() => vi.clearAllMocks())

  const setupMocks = (recentRoomAlertCount: number) => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: 'device-1',
      roomId: 'room-1',
      room: {
        id: 'room-1',
        siteId: 'site-1',
        site: {
          id: 'site-1',
          customerId: 'customer-1',
          customer: { id: 'customer-1', name: 'Acme' },
        },
      },
    } as any)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'new-alert-1', roomId: 'room-1' } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(recentRoomAlertCount)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Device offline' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)
  }

  it('creates DEVICE_FAULT group when only 1 device alert in room', async () => {
    setupMocks(0) // no other recent alerts in room

    await processAlert(makeAlert())

    const createCalls = vi.mocked(prisma.alertGroup.create).mock.calls
    expect(createCalls[0][0].data.type).toBe('DEVICE_FAULT')
  })

  it('creates ROOM_OUTAGE group when 2+ devices alert in same room', async () => {
    setupMocks(1) // one other recent alert in room

    await processAlert(makeAlert())

    const createCalls = vi.mocked(prisma.alertGroup.create).mock.calls
    expect(createCalls[0][0].data.type).toBe('ROOM_OUTAGE')
  })
})

describe('processAlert - Ticket auto-creation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a P1 ticket with 1h SLA for CRITICAL alert', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'alert-1', roomId: null } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Critical alert' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const before = Date.now()
    await processAlert(makeAlert({ severity: 'CRITICAL' as AlertSeverity }))
    const after = Date.now()

    const ticketCall = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    expect(ticketCall.data.priority).toBe('P1')

    const slaDeadline = ticketCall.data.slaDeadline as Date
    const slaMs = slaDeadline.getTime()
    // Should be ~1 hour from now
    expect(slaMs).toBeGreaterThanOrEqual(before + 3_600_000 - 100)
    expect(slaMs).toBeLessThanOrEqual(after + 3_600_000 + 100)
  })

  it('creates a P4 ticket with 24h SLA for INFO alert', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'alert-1', roomId: null } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Info alert' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const before = Date.now()
    await processAlert(makeAlert({ severity: 'INFO' as AlertSeverity }))
    const after = Date.now()

    const ticketCall = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    expect(ticketCall.data.priority).toBe('P4')

    const slaMs = (ticketCall.data.slaDeadline as Date).getTime()
    expect(slaMs).toBeGreaterThanOrEqual(before + 24 * 3_600_000 - 100)
    expect(slaMs).toBeLessThanOrEqual(after + 24 * 3_600_000 + 100)
  })

  it('emits alert_created and ticket_opened SSE events', async () => {
    vi.mocked(prisma.alert.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.alert.create).mockResolvedValue({ id: 'alert-1', roomId: null, title: 'Test', severity: 'HIGH' } as any)
    vi.mocked(prisma.alert.count).mockResolvedValue(0)
    vi.mocked(prisma.alertGroup.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.alertGroup.create).mockResolvedValue({ id: 'group-1' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 'ticket-1', title: 'Test', priority: 'P2' } as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    await processAlert(makeAlert())

    expect(emitSseEvent).toHaveBeenCalledWith('alert_created', expect.objectContaining({ id: 'alert-1' }))
    expect(emitSseEvent).toHaveBeenCalledWith('ticket_opened', expect.objectContaining({ id: 'ticket-1' }))
  })
})
```

- [ ] **Step 2: Run to verify tests pass**

```bash
npm run test:run -- src/test/correlation.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/test/correlation.test.ts
git commit -m "test: add grouping and ticket auto-creation tests for correlation engine"
```

---

### Task 4: Add auto-resolve sweep to cron

**Files:**
- Modify: `src/app/api/cron/alerts/route.ts`

- [ ] **Step 1: Write test for auto-resolve sweep logic**

Create `src/test/auto-resolve.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    alert: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    device: {
      findUnique: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/sse-bus', () => ({
  emitSseEvent: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { emitSseEvent } from '@/lib/sse-bus'
import { runAutoResolveSweep } from '@/lib/correlation'

describe('runAutoResolveSweep', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves alerts where autoCloseAt has passed and device is back online', async () => {
    const pastTime = new Date(Date.now() - 120_000)
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { id: 'alert-1', deviceId: 'device-1', autoCloseAt: pastTime } as any,
    ])
    vi.mocked(prisma.device.findUnique).mockResolvedValue({ status: 'online' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const result = await runAutoResolveSweep()

    expect(prisma.alert.update).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { status: 'AUTO_RESOLVED', resolvedAt: expect.any(Date) },
    })
    expect(emitSseEvent).toHaveBeenCalledWith('alert_resolved', expect.objectContaining({ id: 'alert-1' }))
    expect(result.resolved).toBe(1)
  })

  it('skips alerts where device is still offline', async () => {
    const pastTime = new Date(Date.now() - 120_000)
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { id: 'alert-2', deviceId: 'device-2', autoCloseAt: pastTime } as any,
    ])
    vi.mocked(prisma.device.findUnique).mockResolvedValue({ status: 'offline' } as any)
    vi.mocked(prisma.alert.update).mockResolvedValue({} as any)
    vi.mocked(prisma.activityLog.create).mockResolvedValue({} as any)

    const result = await runAutoResolveSweep()

    expect(prisma.alert.update).not.toHaveBeenCalled()
    expect(result.resolved).toBe(0)
  })

  it('skips alerts with no associated device', async () => {
    const pastTime = new Date(Date.now() - 120_000)
    vi.mocked(prisma.alert.findMany).mockResolvedValue([
      { id: 'alert-3', deviceId: null, autoCloseAt: pastTime } as any,
    ])
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null)

    const result = await runAutoResolveSweep()

    expect(prisma.alert.update).not.toHaveBeenCalled()
    expect(result.resolved).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/auto-resolve.test.ts
```

Expected: FAIL — `runAutoResolveSweep` is not exported from `@/lib/correlation`.

- [ ] **Step 3: Add runAutoResolveSweep to src/lib/correlation.ts**

Append this function to the bottom of `src/lib/correlation.ts`:

```typescript
export async function runAutoResolveSweep(): Promise<{ resolved: number }> {
  const now = new Date();

  // Find all ACTIVE alerts past their autoCloseAt window
  const candidates = await prisma.alert.findMany({
    where: {
      status: "ACTIVE",
      autoCloseAt: { lte: now },
    },
    select: { id: true, deviceId: true, autoCloseAt: true },
  });

  let resolved = 0;

  for (const alert of candidates) {
    if (!alert.deviceId) continue;

    const device = await prisma.device.findUnique({
      where: { id: alert.deviceId },
      select: { status: true },
    });

    if (!device || device.status !== "online") continue;

    await prisma.alert.update({
      where: { id: alert.id },
      data: { status: "AUTO_RESOLVED", resolvedAt: now },
    });

    await prisma.activityLog.create({
      data: {
        type: "auto_resolved",
        alertId: alert.id,
        message: "Alert auto-resolved: device returned online within flap window",
      },
    });

    emitSseEvent("alert_resolved", { id: alert.id });
    resolved++;
  }

  return { resolved };
}
```

- [ ] **Step 4: Run auto-resolve tests**

```bash
npm run test:run -- src/test/auto-resolve.test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Wire runAutoResolveSweep into the cron endpoint**

Open `src/app/api/cron/alerts/route.ts`. Import and call the sweep at the **end** of the `GET` handler, after all platform polling, before the final `return`:

```typescript
// At the top of the file, add:
import { processAlert, runAutoResolveSweep } from "@/lib/correlation";

// At the end of the GET handler body, before the return:
let autoResolved = 0;
try {
  const sweep = await runAutoResolveSweep();
  autoResolved = sweep.resolved;
} catch (err) {
  // Sweep failure should not fail the whole cron run
}

return NextResponse.json({ ok: true, results, autoResolved });
```

- [ ] **Step 6: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/correlation.ts src/app/api/cron/alerts/route.ts src/test/auto-resolve.test.ts
git commit -m "feat: add auto-resolve sweep and wire into cron endpoint"
```

---

## Completion Check

After all tasks:

- [ ] `npm run test:run` — all tests pass, including all correlation and auto-resolve tests
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npm run dev` — server starts; posting a test webhook to `/api/webhooks/poly-lens` with a valid HMAC signature creates an Alert, AlertGroup, Ticket, and ActivityLog in the DB (verify via `npx prisma studio`)
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/alerts` — returns `{ ok: true, results: {...}, autoResolved: 0 }`

**Next plan:** `2026-05-27-vnoc-05-dashboard-ui.md` — KPIs API, alerts table, ticket queue, ticket detail, SSE subscription hooks.
