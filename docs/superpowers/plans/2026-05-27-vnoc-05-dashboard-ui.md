# VNOC Phase 1+2: Dashboard UI & Ticket System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all VNOC UI: the live dashboard overview (KPI strip, active alerts panel, open tickets panel, activity feed), the full alerts table with filters, the ticket queue (My Queue / All Tickets), and the ticket detail page (alert summary, action timeline, Add Note / Reboot / Escalate / Close buttons). Wire SSE for real-time updates.

**Architecture:** Server components fetch initial data on load. Client components subscribe to the SSE stream for updates via a `useSSE` hook. All data mutations (add note, reboot, escalate, close ticket) go through typed API routes that write `TicketAction` rows and emit SSE events. Role-based rendering is gate-kept server-side in page components and route handlers.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, lucide-react, Prisma 7

**Prerequisites:** Plans 01–04 must be complete (schema, sidebar, integration layer, correlation engine).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/app/api/dashboard/kpis/route.ts` | KPI counts: active alerts, open tickets, devices online, SLA at risk |
| Create | `src/app/api/alerts/route.ts` | Paginated, filtered alerts list |
| Create | `src/app/api/tickets/route.ts` | Paginated ticket list (with `assignedTo=me` filter) |
| Create | `src/app/api/tickets/[id]/route.ts` | Single ticket with alert, device, action timeline |
| Create | `src/app/api/tickets/[id]/actions/route.ts` | POST — add note, reboot, escalate, status change |
| Create | `src/app/api/activity/route.ts` | Recent ActivityLog entries |
| Create | `src/hooks/useSSE.ts` | React hook for subscribing to SSE stream |
| Modify | `src/app/(app)/dashboard/page.tsx` | Dashboard overview with all panels |
| Create | `src/app/(app)/dashboard/KpiStrip.tsx` | KPI strip client component |
| Create | `src/app/(app)/dashboard/AlertsFeed.tsx` | Live alerts feed client component |
| Create | `src/app/(app)/dashboard/TicketsFeed.tsx` | Open tickets panel client component |
| Create | `src/app/(app)/dashboard/ActivityFeed.tsx` | VNOC activity feed client component |
| Modify | `src/app/(app)/alerts/page.tsx` | Full alerts table with filters |
| Create | `src/app/(app)/alerts/AlertsTable.tsx` | Alerts table client component |
| Modify | `src/app/(app)/tickets/page.tsx` | Ticket queue (My Queue / All Tickets tabs) |
| Create | `src/app/(app)/tickets/TicketQueue.tsx` | Ticket queue client component |
| Create | `src/app/(app)/tickets/[id]/page.tsx` | Ticket detail server component |
| Create | `src/app/(app)/tickets/[id]/TicketDetail.tsx` | Ticket detail client component |

---

### Task 1: KPIs API endpoint

**Files:**
- Create: `src/app/api/dashboard/kpis/route.ts`

- [ ] **Step 1: Write tests for KPI calculations**

Create `src/test/kpis-api.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

// Test the SLA-at-risk calculation logic in isolation
function countSlaAtRisk(tickets: Array<{ slaDeadline: Date; status: string }>): number {
  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000)
  return tickets.filter(
    (t) =>
      (t.status === 'OPEN' || t.status === 'IN_PROGRESS') &&
      t.slaDeadline <= twoHoursFromNow
  ).length
}

describe('countSlaAtRisk', () => {
  it('counts tickets whose deadline is within 2 hours', () => {
    const soonDeadline = new Date(Date.now() + 30 * 60_000) // 30 min from now
    const laterDeadline = new Date(Date.now() + 5 * 3_600_000) // 5 hours from now
    const tickets = [
      { slaDeadline: soonDeadline, status: 'OPEN' },
      { slaDeadline: laterDeadline, status: 'OPEN' },
      { slaDeadline: soonDeadline, status: 'RESOLVED' }, // resolved — should not count
    ]
    expect(countSlaAtRisk(tickets)).toBe(1)
  })

  it('returns 0 when no tickets are at risk', () => {
    const safe = new Date(Date.now() + 10 * 3_600_000)
    expect(countSlaAtRisk([{ slaDeadline: safe, status: 'OPEN' }])).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify tests pass**

```bash
npm run test:run -- src/test/kpis-api.test.ts
```

Expected: Both tests pass.

- [ ] **Step 3: Create src/app/api/dashboard/kpis/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface KpiData {
  activeAlerts: number;
  openTickets: number;
  devicesOnline: number;
  devicesTotal: number;
  slaAtRisk: number;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000);

  const [activeAlerts, openTickets, devicesOnline, devicesTotal, slaAtRisk] =
    await Promise.all([
      prisma.alert.count({ where: { status: "ACTIVE" } }),
      prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.device.count({ where: { status: "online" } }),
      prisma.device.count(),
      prisma.ticket.count({
        where: {
          status: { in: ["OPEN", "IN_PROGRESS"] },
          slaDeadline: { lte: twoHoursFromNow },
        },
      }),
    ]);

  const data: KpiData = { activeAlerts, openTickets, devicesOnline, devicesTotal, slaAtRisk };

  return NextResponse.json({ success: true, data });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard/kpis/route.ts src/test/kpis-api.test.ts
git commit -m "feat: add KPIs API endpoint"
```

---

### Task 2: Alerts and Tickets list API endpoints

**Files:**
- Create: `src/app/api/alerts/route.ts`
- Create: `src/app/api/tickets/route.ts`
- Create: `src/app/api/activity/route.ts`

- [ ] **Step 1: Create src/app/api/alerts/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AlertStatus, AlertSeverity, Platform } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") as AlertStatus | null;
  const severity = searchParams.get("severity") as AlertSeverity | null;
  const platform = searchParams.get("platform") as Platform | null;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  const where = {
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(platform ? { platform } : {}),
  };

  const [alerts, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        device: { select: { name: true, model: true, room: { select: { name: true } } } },
        ticket: { select: { id: true, status: true, priority: true } },
      },
    }),
    prisma.alert.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: alerts,
    meta: { total, page, limit },
  });
}
```

- [ ] **Step 2: Create src/app/api/tickets/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TicketStatus, TicketPriority } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const queue = searchParams.get("queue"); // "mine" = My Queue
  const status = searchParams.get("status") as TicketStatus | null;
  const priority = searchParams.get("priority") as TicketPriority | null;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25")));

  const where = {
    ...(queue === "mine" ? { assignedTo: session.user.id } : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: [{ priority: "asc" }, { slaDeadline: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        alert: { select: { platform: true, severity: true, title: true } },
        assignee: { select: { profile: { select: { firstName: true, lastName: true } } } },
        customer: { select: { name: true } },
      },
    }),
    prisma.ticket.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    data: tickets,
    meta: { total, page, limit },
  });
}
```

- [ ] **Step 3: Create src/app/api/activity/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ success: true, data: logs });
}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/alerts/route.ts src/app/api/tickets/route.ts src/app/api/activity/route.ts
git commit -m "feat: add alerts, tickets, and activity list API endpoints"
```

---

### Task 3: Ticket detail and actions API endpoints

**Files:**
- Create: `src/app/api/tickets/[id]/route.ts`
- Create: `src/app/api/tickets/[id]/actions/route.ts`

- [ ] **Step 1: Write tests for ticket action validation**

Create `src/test/ticket-actions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

const ActionSchema = z.object({
  type: z.enum(['NOTE', 'REBOOT', 'FIRMWARE_PUSH', 'ESCALATE', 'STATUS_CHANGE', 'CONFIG_RESTORE']),
  body: z.string().optional(),
  newStatus: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
})

describe('ticket action schema', () => {
  it('accepts a valid NOTE action', () => {
    const result = ActionSchema.safeParse({ type: 'NOTE', body: 'Checked device logs' })
    expect(result.success).toBe(true)
  })

  it('rejects unknown action type', () => {
    const result = ActionSchema.safeParse({ type: 'UNKNOWN_ACTION' })
    expect(result.success).toBe(false)
  })

  it('accepts a STATUS_CHANGE with newStatus', () => {
    const result = ActionSchema.safeParse({ type: 'STATUS_CHANGE', newStatus: 'IN_PROGRESS' })
    expect(result.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify tests pass**

```bash
npm run test:run -- src/test/ticket-actions.test.ts
```

- [ ] **Step 3: Create src/app/api/tickets/[id]/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      alert: {
        include: {
          device: {
            include: {
              room: {
                include: { site: { include: { customer: true } } },
              },
            },
          },
        },
      },
      customer: true,
      assignee: {
        include: { profile: { select: { firstName: true, lastName: true } } },
      },
      actions: {
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            include: { profile: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: ticket });
}
```

- [ ] **Step 4: Create src/app/api/tickets/[id]/actions/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { emitSseEvent } from "@/lib/sse-bus";
import { VnocRole } from "@prisma/client";

const ActionSchema = z.object({
  type: z.enum(["NOTE", "REBOOT", "FIRMWARE_PUSH", "ESCALATE", "STATUS_CHANGE", "CONFIG_RESTORE"]),
  body: z.string().optional(),
  newStatus: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});

function canPerformAction(
  actionType: string,
  isSuperAdmin: boolean,
  vnocRole: VnocRole | null
): boolean {
  // TIER1 and above can add notes, reboot, change status, close
  const tier1Actions = new Set(["NOTE", "REBOOT", "STATUS_CHANGE"]);
  if (tier1Actions.has(actionType)) return true;
  // ESCALATE requires TIER2+
  if (actionType === "ESCALATE") {
    return isSuperAdmin || vnocRole === "TIER2" || vnocRole === "MANAGER";
  }
  // Admin-only actions
  return isSuperAdmin;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { type, body: actionBody, newStatus } = parsed.data;

  if (!canPerformAction(type, session.user.isSuperAdmin, session.user.vnocRole)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, status: true, alert: { select: { deviceId: true } } },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Execute the action
  if (type === "REBOOT" && ticket.alert.deviceId) {
    // Fire-and-forget reboot — actual adapter call happens here in production
    // The adapter is looked up by the device's platform
    try {
      const device = await prisma.device.findUnique({
        where: { id: ticket.alert.deviceId },
        select: { platform: true, platformId: true },
      });
      if (device) {
        // Dynamic import to avoid circular dep with adapters
        const { createPolyLensAdapter } = await import("@/lib/integrations/poly-lens");
        const { createYealinkAdapter } = await import("@/lib/integrations/yealink");
        const adapter =
          device.platform === "POLY_LENS"
            ? await createPolyLensAdapter()
            : device.platform === "YEALINK_YMCS"
            ? await createYealinkAdapter()
            : null;
        if (adapter) await adapter.rebootDevice(device.platformId);
      }
    } catch (err) {
      // Log but don't fail — action is still recorded
      await prisma.activityLog.create({
        data: {
          type: "reboot_error",
          ticketId: id,
          message: `Reboot command failed: ${(err as Error).message}`,
        },
      });
    }
  }

  // Record the action
  const action = await prisma.ticketAction.create({
    data: {
      ticketId: id,
      userId: session.user.id,
      type,
      body: actionBody ?? null,
    },
    include: {
      user: { include: { profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  // Update ticket status if requested
  if (type === "STATUS_CHANGE" && newStatus) {
    const resolvedAt = newStatus === "RESOLVED" ? new Date() : undefined;
    const closedAt = newStatus === "CLOSED" ? new Date() : undefined;

    await prisma.ticket.update({
      where: { id },
      data: { status: newStatus, resolvedAt, closedAt },
    });

    emitSseEvent("ticket_updated", { id, status: newStatus });
  }

  return NextResponse.json({ success: true, data: action });
}
```

- [ ] **Step 5: Run tests**

```bash
npm run test:run -- src/test/ticket-actions.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tickets/[id]/route.ts src/app/api/tickets/[id]/actions/route.ts src/test/ticket-actions.test.ts
git commit -m "feat: add ticket detail and actions API endpoints"
```

---

### Task 4: Create useSSE hook

**Files:**
- Create: `src/hooks/useSSE.ts`

- [ ] **Step 1: Write test for useSSE hook**

Create `src/test/use-sse.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSSE } from '@/hooks/useSSE'

// Mock EventSource
class MockEventSource {
  url: string
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: Event) => void) | null = null
  listeners: Map<string, ((e: MessageEvent) => void)[]> = new Map()
  readyState = 1

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, [...existing, handler])
  }

  removeEventListener(type: string, handler: (e: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? []
    this.listeners.set(type, existing.filter((h) => h !== handler))
  }

  close() {
    this.readyState = 2
  }

  // Test helper: simulate an event
  dispatchSSEEvent(type: string, data: unknown) {
    const handlers = this.listeners.get(type) ?? []
    handlers.forEach((h) => h({ data: JSON.stringify(data) } as MessageEvent))
  }
}

let mockES: MockEventSource

vi.stubGlobal('EventSource', (url: string) => {
  mockES = new MockEventSource(url)
  return mockES
})

describe('useSSE', () => {
  afterEach(() => vi.clearAllMocks())

  it('calls the handler when a matching event is received', async () => {
    const handler = vi.fn()
    renderHook(() => useSSE('alert_created', handler))

    act(() => {
      mockES.dispatchSSEEvent('alert_created', { id: 'a1', title: 'Test' })
    })

    expect(handler).toHaveBeenCalledWith({ id: 'a1', title: 'Test' })
  })

  it('does not call handler for different event types', () => {
    const handler = vi.fn()
    renderHook(() => useSSE('ticket_updated', handler))

    act(() => {
      mockES.dispatchSSEEvent('alert_created', { id: 'a1' })
    })

    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/use-sse.test.ts
```

Expected: FAIL — `@/hooks/useSSE` does not exist.

- [ ] **Step 3: Create src/hooks/useSSE.ts**

```typescript
"use client";

import { useEffect, useRef } from "react";
import { SseEventType } from "@/lib/sse-bus";

const SSE_URL = "/api/sse/alerts";

// Singleton EventSource shared across hook instances on the same page
let sharedES: EventSource | null = null;
let refCount = 0;

function getSharedEventSource(): EventSource {
  if (!sharedES || sharedES.readyState === EventSource.CLOSED) {
    sharedES = new EventSource(SSE_URL);
  }
  return sharedES;
}

export function useSSE(
  eventType: SseEventType,
  handler: (data: unknown) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const es = getSharedEventSource();
    refCount++;

    const listener = (e: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(e.data));
      } catch {
        // Ignore parse errors
      }
    };

    es.addEventListener(eventType, listener);

    return () => {
      es.removeEventListener(eventType, listener);
      refCount--;
      if (refCount === 0 && sharedES) {
        sharedES.close();
        sharedES = null;
      }
    };
  }, [eventType]);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/test/use-sse.test.ts
```

Expected: Both tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSSE.ts src/test/use-sse.test.ts
git commit -m "feat: add useSSE hook for real-time SSE subscription"
```

---

### Task 5: Dashboard overview page

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/dashboard/KpiStrip.tsx`
- Create: `src/app/(app)/dashboard/AlertsFeed.tsx`
- Create: `src/app/(app)/dashboard/TicketsFeed.tsx`
- Create: `src/app/(app)/dashboard/ActivityFeed.tsx`

- [ ] **Step 1: Create KpiStrip client component**

Create `src/app/(app)/dashboard/KpiStrip.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import { AlertTriangle, Cpu, TicketIcon, Timer } from "lucide-react";

interface KpiData {
  activeAlerts: number;
  openTickets: number;
  devicesOnline: number;
  devicesTotal: number;
  slaAtRisk: number;
}

export function KpiStrip({ initial }: { initial: KpiData }) {
  const [kpis, setKpis] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/kpis");
      const json = await res.json();
      if (json.success) setKpis(json.data);
    } catch {
      // Silently ignore refresh failures
    }
  }, []);

  useSSE("kpi_updated", refresh);
  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);
  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  const cards = [
    {
      label: "Active Alerts",
      value: kpis.activeAlerts,
      icon: AlertTriangle,
      urgent: kpis.activeAlerts > 0,
    },
    {
      label: "Open Tickets",
      value: kpis.openTickets,
      icon: TicketIcon,
      urgent: false,
    },
    {
      label: "Devices Online",
      value: `${kpis.devicesOnline} / ${kpis.devicesTotal}`,
      icon: Cpu,
      urgent: kpis.devicesOnline < kpis.devicesTotal,
    },
    {
      label: "SLA at Risk",
      value: kpis.slaAtRisk,
      icon: Timer,
      urgent: kpis.slaAtRisk > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`bg-white rounded-2xl border p-5 flex flex-col gap-1 ${
            card.urgent ? "border-red-200 bg-red-50" : "border-surface2"
          }`}
        >
          <div className="flex items-center gap-2 text-muted text-sm">
            <card.icon className="w-4 h-4" />
            {card.label}
          </div>
          <p
            className={`text-3xl font-bold tabular-nums ${
              card.urgent ? "text-red-600" : "text-foreground"
            }`}
          >
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create AlertsFeed client component**

Create `src/app/(app)/dashboard/AlertsFeed.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface Alert {
  id: string;
  title: string;
  severity: string;
  status: string;
  platform: string;
  receivedAt: string;
  device?: { name: string; room?: { name: string } } | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-600 bg-red-100",
  HIGH: "text-orange-600 bg-orange-100",
  MEDIUM: "text-yellow-600 bg-yellow-100",
  LOW: "text-blue-600 bg-blue-100",
  INFO: "text-gray-600 bg-gray-100",
};

export function AlertsFeed({ initial }: { initial: Alert[] }) {
  const [alerts, setAlerts] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts?status=ACTIVE&limit=10");
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } catch {
      // Silently ignore
    }
  }, []);

  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  return (
    <div className="bg-white rounded-2xl border border-surface2 p-5">
      <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        Live Alerts
      </h2>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <CheckCircle className="w-4 h-4" />
          No active alerts
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start gap-3 text-sm">
              <span
                className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  SEVERITY_COLORS[alert.severity] ?? "text-gray-600 bg-gray-100"
                }`}
              >
                {alert.severity}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{alert.title}</p>
                <p className="text-muted text-xs">
                  {alert.device?.room?.name ?? alert.device?.name ?? alert.platform} ·{" "}
                  {new Date(alert.receivedAt).toLocaleTimeString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create TicketsFeed client component**

Create `src/app/(app)/dashboard/TicketsFeed.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";
import { TicketIcon, Clock } from "lucide-react";

interface Ticket {
  id: string;
  title: string;
  priority: string;
  status: string;
  slaDeadline: string;
  customer?: { name: string } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-red-500 text-white",
  P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-white",
  P4: "bg-gray-400 text-white",
};

export function TicketsFeed({ initial }: { initial: Ticket[] }) {
  const [tickets, setTickets] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets?queue=mine&limit=10");
      const json = await res.json();
      if (json.success) setTickets(json.data);
    } catch {
      // Silently ignore
    }
  }, []);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  return (
    <div className="bg-white rounded-2xl border border-surface2 p-5">
      <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <TicketIcon className="w-4 h-4 text-blue-500" />
        My Queue
      </h2>
      {tickets.length === 0 ? (
        <p className="text-muted text-sm">No tickets assigned to you.</p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((ticket) => {
            const deadline = new Date(ticket.slaDeadline)
            const isAtRisk = deadline <= new Date(Date.now() + 2 * 3_600_000)
            return (
              <li key={ticket.id}>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="flex items-start gap-3 text-sm hover:bg-surface2 rounded-xl p-2 transition-colors"
                >
                  <span
                    className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      PRIORITY_COLORS[ticket.priority] ?? "bg-gray-400 text-white"
                    }`}
                  >
                    {ticket.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{ticket.title}</p>
                    <p className={`text-xs flex items-center gap-1 ${isAtRisk ? "text-red-500" : "text-muted"}`}>
                      <Clock className="w-3 h-3" />
                      {deadline.toLocaleString()}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create ActivityFeed client component**

Create `src/app/(app)/dashboard/ActivityFeed.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import { Activity } from "lucide-react";

interface LogEntry {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export function ActivityFeed({ initial }: { initial: LogEntry[] }) {
  const [logs, setLogs] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      const json = await res.json();
      if (json.success) setLogs(json.data.slice(0, 20));
    } catch {
      // Silently ignore
    }
  }, []);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);
  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  return (
    <div className="bg-white rounded-2xl border border-surface2 p-5">
      <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-purple-500" />
        VNOC Activity
      </h2>
      <ul className="space-y-2">
        {logs.map((log) => (
          <li key={log.id} className="text-sm">
            <p className="text-foreground">{log.message}</p>
            <p className="text-muted text-xs">{new Date(log.createdAt).toLocaleString()}</p>
          </li>
        ))}
        {logs.length === 0 && <p className="text-muted text-sm">No recent activity.</p>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Replace src/app/(app)/dashboard/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KpiStrip } from "./KpiStrip";
import { AlertsFeed } from "./AlertsFeed";
import { TicketsFeed } from "./TicketsFeed";
import { ActivityFeed } from "./ActivityFeed";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const twoHoursFromNow = new Date(Date.now() + 2 * 3_600_000);

  const [activeAlerts, openTickets, devicesOnline, devicesTotal, slaAtRisk,
    recentAlerts, myTickets, activityLogs] = await Promise.all([
    prisma.alert.count({ where: { status: "ACTIVE" } }),
    prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.device.count({ where: { status: "online" } }),
    prisma.device.count(),
    prisma.ticket.count({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, slaDeadline: { lte: twoHoursFromNow } },
    }),
    prisma.alert.findMany({
      where: { status: "ACTIVE" },
      orderBy: { receivedAt: "desc" },
      take: 10,
      include: { device: { select: { name: true, room: { select: { name: true } } } } },
    }),
    prisma.ticket.findMany({
      where: { assignedTo: session.user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ priority: "asc" }, { slaDeadline: "asc" }],
      take: 10,
      include: { customer: { select: { name: true } } },
    }),
    prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">VNOC Operations</h1>
        <p className="text-muted text-sm mt-1">Live dashboard · updates in real time</p>
      </div>

      <KpiStrip
        initial={{ activeAlerts, openTickets, devicesOnline, devicesTotal, slaAtRisk }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AlertsFeed initial={recentAlerts as Parameters<typeof AlertsFeed>[0]["initial"]} />
        <TicketsFeed initial={myTickets as Parameters<typeof TicketsFeed>[0]["initial"]} />
      </div>

      <ActivityFeed initial={activityLogs} />
    </div>
  );
}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/dashboard/page.tsx src/app/(app)/dashboard/KpiStrip.tsx src/app/(app)/dashboard/AlertsFeed.tsx src/app/(app)/dashboard/TicketsFeed.tsx src/app/(app)/dashboard/ActivityFeed.tsx
git commit -m "feat: build dashboard overview page with live KPIs, alerts, tickets, and activity feed"
```

---

### Task 6: Full alerts table page

**Files:**
- Create: `src/app/(app)/alerts/AlertsTable.tsx`
- Modify: `src/app/(app)/alerts/page.tsx`

- [ ] **Step 1: Create AlertsTable client component**

Create `src/app/(app)/alerts/AlertsTable.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";
import { AlertSeverity, AlertStatus, Platform } from "@prisma/client";

interface Alert {
  id: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  platform: Platform;
  receivedAt: string;
  device?: { name: string; model?: string | null; room?: { name: string } | null } | null;
  ticket?: { id: string; status: string; priority: string } | null;
}

const SEVERITY_PILL: Record<AlertSeverity, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-blue-100 text-blue-700",
  INFO: "bg-gray-100 text-gray-600",
};

const STATUS_PILL: Record<AlertStatus, string> = {
  ACTIVE: "bg-red-50 text-red-600 border border-red-200",
  ACKNOWLEDGED: "bg-yellow-50 text-yellow-600 border border-yellow-200",
  AUTO_RESOLVED: "bg-green-50 text-green-600 border border-green-200",
  SUPPRESSED: "bg-gray-50 text-gray-500 border border-gray-200",
  RESOLVED: "bg-green-50 text-green-600 border border-green-200",
};

export function AlertsTable({ initial }: { initial: Alert[] }) {
  const [alerts, setAlerts] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "">("");

  const refresh = useCallback(async () => {
    const params = statusFilter ? `?status=${statusFilter}&limit=100` : "?limit=100";
    try {
      const res = await fetch(`/api/alerts${params}`);
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } catch {
      // Silently ignore
    }
  }, [statusFilter]);

  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  const filtered = statusFilter
    ? alerts.filter((a) => a.status === statusFilter)
    : alerts;

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["", "ACTIVE", "ACKNOWLEDGED", "AUTO_RESOLVED", "RESOLVED"] as const).map(
          (s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s as AlertStatus | "")}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                statusFilter === s
                  ? "bg-secondary-color/10 text-secondary-color border-secondary-color/20"
                  : "text-muted border-surface2 hover:bg-surface2"
              }`}
            >
              {s === "" ? "All" : s.replace("_", " ")}
            </button>
          )
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-surface2 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface2 text-muted text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Severity</th>
              <th className="text-left px-4 py-3">Alert</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Device</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Platform</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Received</th>
              <th className="text-left px-4 py-3">Ticket</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface2">
            {filtered.map((alert) => (
              <tr key={alert.id} className="hover:bg-surface2/50 transition-colors">
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      SEVERITY_PILL[alert.severity]
                    }`}
                  >
                    {alert.severity}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">
                  {alert.title}
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">
                  {alert.device?.room?.name ?? alert.device?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted hidden lg:table-cell">
                  {alert.platform.replace("_", " ")}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      STATUS_PILL[alert.status]
                    }`}
                  >
                    {alert.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted text-xs hidden lg:table-cell">
                  {new Date(alert.receivedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {alert.ticket ? (
                    <Link
                      href={`/tickets/${alert.ticket.id}`}
                      className="text-xs text-secondary-color hover:underline font-medium"
                    >
                      {alert.ticket.priority} · {alert.ticket.status}
                    </Link>
                  ) : (
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-muted py-8 text-sm">No alerts found.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace src/app/(app)/alerts/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { AlertsTable } from "./AlertsTable";

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const alerts = await prisma.alert.findMany({
    orderBy: { receivedAt: "desc" },
    take: 100,
    include: {
      device: { select: { name: true, model: true, room: { select: { name: true } } } },
      ticket: { select: { id: true, status: true, priority: true } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">All Alerts</h1>
      <AlertsTable initial={alerts as Parameters<typeof AlertsTable>[0]["initial"]} />
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/alerts/AlertsTable.tsx src/app/(app)/alerts/page.tsx
git commit -m "feat: add full alerts table page with severity/status filters and live updates"
```

---

### Task 7: Ticket queue page

**Files:**
- Create: `src/app/(app)/tickets/TicketQueue.tsx`
- Modify: `src/app/(app)/tickets/page.tsx`

- [ ] **Step 1: Create TicketQueue client component**

Create `src/app/(app)/tickets/TicketQueue.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";
import { Clock } from "lucide-react";

interface Ticket {
  id: string;
  title: string;
  priority: string;
  status: string;
  slaDeadline: string;
  customer?: { name: string } | null;
  alert?: { platform: string; severity: string } | null;
  assignee?: { profile?: { firstName: string; lastName: string } | null } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-red-500 text-white",
  P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-white",
  P4: "bg-gray-400 text-white",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-50 text-red-600",
  IN_PROGRESS: "bg-blue-50 text-blue-600",
  RESOLVED: "bg-green-50 text-green-600",
  CLOSED: "bg-gray-50 text-gray-500",
};

export function TicketQueue({
  initial,
  userId,
}: {
  initial: Ticket[];
  userId: string;
}) {
  const [tickets, setTickets] = useState(initial);
  const [tab, setTab] = useState<"mine" | "all">("mine");

  const refresh = useCallback(async () => {
    const q = tab === "mine" ? "?queue=mine" : "";
    try {
      const res = await fetch(`/api/tickets${q}&limit=50`);
      const json = await res.json();
      if (json.success) setTickets(json.data);
    } catch {
      // Silently ignore
    }
  }, [tab]);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["mine", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              tab === t
                ? "bg-secondary-color/10 text-secondary-color border-secondary-color/20"
                : "text-muted border-surface2 hover:bg-surface2"
            }`}
          >
            {t === "mine" ? "My Queue" : "All Tickets"}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      <div className="space-y-3">
        {tickets.length === 0 && (
          <p className="text-center text-muted py-8 text-sm">No tickets.</p>
        )}
        {tickets.map((ticket) => {
          const deadline = new Date(ticket.slaDeadline);
          const isAtRisk = deadline <= new Date(Date.now() + 2 * 3_600_000);
          return (
            <Link
              key={ticket.id}
              href={`/tickets/${ticket.id}`}
              className="flex items-start gap-4 bg-white rounded-2xl border border-surface2 p-4 hover:border-secondary-color/30 transition-colors"
            >
              <span
                className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg ${
                  PRIORITY_COLORS[ticket.priority] ?? "bg-gray-400 text-white"
                }`}
              >
                {ticket.priority}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{ticket.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
                  <span>{ticket.customer?.name ?? "No customer"}</span>
                  <span>·</span>
                  <span>{ticket.alert?.platform?.replace("_", " ") ?? "—"}</span>
                  <span>·</span>
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      STATUS_COLORS[ticket.status] ?? "bg-gray-50 text-gray-500"
                    }`}
                  >
                    {ticket.status.replace("_", " ")}
                  </span>
                </div>
              </div>
              <div className={`shrink-0 text-xs flex items-center gap-1 ${isAtRisk ? "text-red-500 font-medium" : "text-muted"}`}>
                <Clock className="w-3 h-3" />
                {deadline.toLocaleDateString()}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace src/app/(app)/tickets/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TicketQueue } from "./TicketQueue";

export default async function TicketsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const tickets = await prisma.ticket.findMany({
    where: { assignedTo: session.user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    orderBy: [{ priority: "asc" }, { slaDeadline: "asc" }],
    take: 50,
    include: {
      alert: { select: { platform: true, severity: true } },
      customer: { select: { name: true } },
      assignee: { include: { profile: { select: { firstName: true, lastName: true } } } },
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Ticket Queue</h1>
      <TicketQueue
        initial={tickets as Parameters<typeof TicketQueue>[0]["initial"]}
        userId={session.user.id}
      />
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/tickets/TicketQueue.tsx src/app/(app)/tickets/page.tsx
git commit -m "feat: add ticket queue page with My Queue / All Tickets tabs and live updates"
```

---

### Task 8: Ticket detail page

**Files:**
- Create: `src/app/(app)/tickets/[id]/page.tsx`
- Create: `src/app/(app)/tickets/[id]/TicketDetail.tsx`

- [ ] **Step 1: Create TicketDetail client component**

Create `src/app/(app)/tickets/[id]/TicketDetail.tsx`:

```typescript
"use client";

import { useState } from "react";
import { VnocRole } from "@prisma/client";
import { Clock, MessageSquare, RotateCw, ArrowUp, CheckCircle } from "lucide-react";

interface Action {
  id: string;
  type: string;
  body?: string | null;
  createdAt: string;
  user?: { profile?: { firstName: string; lastName: string } | null } | null;
}

interface TicketDetailProps {
  ticket: {
    id: string;
    title: string;
    priority: string;
    status: string;
    slaDeadline: string;
    description?: string | null;
    rootCause?: string | null;
    resolution?: string | null;
    actions: Action[];
    alert?: {
      severity: string;
      title: string;
      platform: string;
      device?: {
        name: string;
        model?: string | null;
        status: string;
        room?: { name: string; site?: { name: string } | null } | null;
      } | null;
    } | null;
    customer?: { name: string } | null;
    assignee?: { profile?: { firstName: string; lastName: string } | null } | null;
  };
  userId: string;
  vnocRole: VnocRole | null;
  isSuperAdmin: boolean;
}

export function TicketDetail({ ticket, userId, vnocRole, isSuperAdmin }: TicketDetailProps) {
  const [actions, setActions] = useState(ticket.actions);
  const [status, setStatus] = useState(ticket.status);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEscalate = isSuperAdmin || vnocRole === "TIER2" || vnocRole === "MANAGER";
  const isResolved = status === "RESOLVED" || status === "CLOSED";

  async function submitAction(type: string, body?: string, newStatus?: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, body, newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setActions((prev) => [...prev, json.data]);
      if (newStatus) setStatus(newStatus);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-surface2 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">{ticket.title}</h1>
            <p className="text-muted text-sm mt-1">
              {ticket.customer?.name ?? "No customer"} ·{" "}
              {ticket.alert?.platform?.replace("_", " ") ?? "—"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-bold px-2 py-1 rounded-lg bg-gray-900 text-white">
              {ticket.priority}
            </span>
            <span className="text-xs font-medium px-2 py-1 rounded-lg bg-surface2 text-foreground">
              {status.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* SLA */}
        <div className="flex items-center gap-1.5 mt-4 text-sm text-muted">
          <Clock className="w-4 h-4" />
          SLA: {new Date(ticket.slaDeadline).toLocaleString()}
        </div>

        {/* Alert info */}
        {ticket.alert?.device && (
          <div className="mt-4 p-3 bg-surface2/60 rounded-xl text-sm">
            <p className="font-medium text-foreground">{ticket.alert.device.name}</p>
            <p className="text-muted">
              {ticket.alert.device.room?.site?.name ?? ""}{" "}
              {ticket.alert.device.room?.name ?? ""}
              {" · "}Status: {ticket.alert.device.status}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isResolved && (
        <div className="bg-white rounded-2xl border border-surface2 p-6">
          <h2 className="font-semibold text-foreground mb-4">Actions</h2>
          <div className="flex gap-2 flex-wrap mb-4">
            <button
              onClick={() => submitAction("REBOOT")}
              disabled={submitting}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-surface2 hover:bg-surface2/80 disabled:opacity-50 transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              Reboot Device
            </button>
            {canEscalate && (
              <button
                onClick={() => submitAction("ESCALATE", "Escalated to TIER2")}
                disabled={submitting}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors"
              >
                <ArrowUp className="w-4 h-4" />
                Escalate
              </button>
            )}
            <button
              onClick={() => submitAction("STATUS_CHANGE", undefined, "IN_PROGRESS")}
              disabled={submitting || status === "IN_PROGRESS"}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              Claim / In Progress
            </button>
            <button
              onClick={() => submitAction("STATUS_CHANGE", undefined, "RESOLVED")}
              disabled={submitting}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Resolve
            </button>
          </div>

          {/* Add note */}
          <div className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              rows={3}
              className="w-full border border-surface2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary-color/30 resize-none"
            />
            <button
              onClick={() => submitAction("NOTE", note)}
              disabled={submitting || !note.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-secondary-color/10 text-secondary-color hover:bg-secondary-color/20 disabled:opacity-50 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Add Note
            </button>
          </div>

          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      )}

      {/* Action timeline */}
      <div className="bg-white rounded-2xl border border-surface2 p-6">
        <h2 className="font-semibold text-foreground mb-4">Timeline</h2>
        {actions.length === 0 && (
          <p className="text-muted text-sm">No actions recorded yet.</p>
        )}
        <ul className="space-y-4">
          {actions.map((action) => (
            <li key={action.id} className="flex gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-secondary-color mt-1.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">
                  {action.user?.profile
                    ? `${action.user.profile.firstName} ${action.user.profile.lastName}`
                    : "System"}{" "}
                  <span className="font-normal text-muted">
                    {action.type.toLowerCase().replace("_", " ")}
                  </span>
                </p>
                {action.body && <p className="text-foreground mt-0.5">{action.body}</p>}
                <p className="text-muted text-xs mt-0.5">
                  {new Date(action.createdAt).toLocaleString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/app/(app)/tickets/[id]/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TicketDetail } from "./TicketDetail";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      alert: {
        include: {
          device: {
            include: {
              room: { include: { site: { include: { customer: true } } } },
            },
          },
        },
      },
      customer: true,
      assignee: {
        include: { profile: { select: { firstName: true, lastName: true } } },
      },
      actions: {
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            include: { profile: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
  });

  if (!ticket) notFound();

  return (
    <TicketDetail
      ticket={ticket as Parameters<typeof TicketDetail>[0]["ticket"]}
      userId={session.user.id}
      vnocRole={session.user.vnocRole}
      isSuperAdmin={session.user.isSuperAdmin}
    />
  );
}
```

- [ ] **Step 3: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/tickets/[id]/page.tsx src/app/(app)/tickets/[id]/TicketDetail.tsx
git commit -m "feat: add ticket detail page with alert summary, action timeline, and action buttons"
```

---

## Completion Check

After all tasks:

- [ ] `npm run test:run` — all tests pass
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npm run dev` — start the dev server

Manual smoke test walkthrough:
1. Navigate to `/dashboard` — KPI strip shows counts, empty alert/ticket panels
2. Navigate to `/alerts` — table renders with filter buttons
3. Navigate to `/tickets` — My Queue and All Tickets tabs work
4. Simulate a webhook: `curl -X POST http://localhost:3000/api/webhooks/poly-lens -H "Content-Type: application/json" -H "x-poly-signature: <compute HMAC>" -d '...'` — alert appears in real time on dashboard
5. Navigate to a ticket detail page — action buttons work, adding a note refreshes the timeline
6. Navigate to `/settings/platform` as superAdmin — platform credentials page renders
7. Sidebar shows correct sections based on `vnocRole`

- [ ] `npm run build` — production build succeeds with no errors

**All 5 plans complete.** The VNOC Phase 1+2 dashboard is built and functional.
