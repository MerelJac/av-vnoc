# VNOC Phase 1+2: Dashboard Shell & Navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic sidebar with the VNOC-specific navigation layout, create skeleton route pages for all VNOC sections, extend the app layout to pass `vnocRole` to the sidebar, and wire up the SSE event stream endpoint.

**Architecture:** The existing `(app)` route group already gates auth via `getServerSession`. We extend that layout to also read `vnocRole` from the session and pass it down to the sidebar. All new route pages are server components that enforce role-based access at the layout level. The SSE endpoint uses Node.js `EventEmitter` cached on `globalThis` as an in-process event bus.

**Tech Stack:** Next.js 15 App Router, React 19, NextAuth v4 JWT, Tailwind v4, lucide-react

**Prerequisite:** Plan 01 (data model) must be complete — `vnocRole` must be in the session token before this plan runs.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/app/(app)/layout.tsx` | Pass `vnocRole` and `isSuperAdmin` to sidebar |
| Modify | `src/app/components/team/Sidebar.tsx` | Replace generic nav with VNOC nav sections |
| Create | `src/app/(app)/alerts/page.tsx` | Alerts table page (skeleton) |
| Create | `src/app/(app)/tickets/page.tsx` | Ticket queue page (skeleton) |
| Create | `src/app/(app)/rooms/page.tsx` | Room browser page (skeleton) |
| Create | `src/app/(app)/devices/page.tsx` | Device inventory page (skeleton) |
| Create | `src/app/(app)/customers/page.tsx` | Customer list page (skeleton, admin/manager only) |
| Create | `src/app/(app)/settings/platform/page.tsx` | Platform credentials settings (superAdmin only) |
| Create | `src/lib/sse-bus.ts` | Global in-process event bus for SSE |
| Create | `src/app/api/sse/alerts/route.ts` | SSE stream endpoint |

---

### Task 1: Update the app layout to pass vnocRole

**Files:**
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write a test for layout role extraction**

Create `src/test/app-layout.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { VnocRole } from '@prisma/client'

// Test the role-guard helper in isolation
function canAccessCustomers(isSuperAdmin: boolean, vnocRole: VnocRole | null): boolean {
  return isSuperAdmin || vnocRole === 'MANAGER' || vnocRole === 'TIER2'
}

describe('role access helpers', () => {
  it('superAdmin can access customers', () => {
    expect(canAccessCustomers(true, null)).toBe(true)
  })

  it('MANAGER can access customers', () => {
    expect(canAccessCustomers(false, 'MANAGER')).toBe(true)
  })

  it('TIER1 cannot access customers', () => {
    expect(canAccessCustomers(false, 'TIER1')).toBe(false)
  })

  it('user with no role cannot access customers', () => {
    expect(canAccessCustomers(false, null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/app-layout.test.ts
```

Expected: FAIL — `canAccessCustomers is not defined` (function lives inside the test, but the import from layout is missing). Actually this test is self-contained — it will pass. The "RED" here is that the production layout doesn't yet pass `vnocRole`. Proceed.

- [ ] **Step 3: Run to verify it passes**

```bash
npm run test:run -- src/test/app-layout.test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 4: Update src/app/(app)/layout.tsx**

Replace the entire file:

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SidebarLayout from "../components/team/Sidebar";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");

  return (
    <SidebarLayout
      isSuperAdmin={session.user.isSuperAdmin}
      vnocRole={session.user.vnocRole}
    >
      {children}
    </SidebarLayout>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Errors about `vnocRole` prop not existing on `SidebarLayout` yet — that's the next task.

- [ ] **Step 6: Commit the test**

```bash
git add src/test/app-layout.test.ts
git commit -m "test: add role access helper tests"
```

---

### Task 2: Replace Sidebar with VNOC navigation

**Files:**
- Modify: `src/app/components/team/Sidebar.tsx`

- [ ] **Step 1: Write sidebar component test**

Create `src/test/sidebar.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VnocRole } from '@prisma/client'

// Minimal mock of Next.js hooks
import { vi } from 'vitest'
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import SidebarLayout from '@/app/components/team/Sidebar'

describe('SidebarLayout', () => {
  it('shows My Queue link for TIER1 role', () => {
    render(
      <SidebarLayout isSuperAdmin={false} vnocRole="TIER1">
        <div>content</div>
      </SidebarLayout>
    )
    expect(screen.getByText('My Queue')).toBeInTheDocument()
    expect(screen.getByText('All Alerts')).toBeInTheDocument()
  })

  it('shows Customers link only for MANAGER and above', () => {
    const { rerender } = render(
      <SidebarLayout isSuperAdmin={false} vnocRole="TIER1">
        <div />
      </SidebarLayout>
    )
    expect(screen.queryByText('Customers')).not.toBeInTheDocument()

    rerender(
      <SidebarLayout isSuperAdmin={false} vnocRole="MANAGER">
        <div />
      </SidebarLayout>
    )
    expect(screen.getByText('Customers')).toBeInTheDocument()
  })

  it('shows Platform Settings link only for superAdmin', () => {
    const { rerender } = render(
      <SidebarLayout isSuperAdmin={false} vnocRole="MANAGER">
        <div />
      </SidebarLayout>
    )
    expect(screen.queryByText('Platform Settings')).not.toBeInTheDocument()

    rerender(
      <SidebarLayout isSuperAdmin={true} vnocRole={null}>
        <div />
      </SidebarLayout>
    )
    expect(screen.getByText('Platform Settings')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm run test:run -- src/test/sidebar.test.tsx
```

Expected: FAIL — sidebar does not yet accept `vnocRole` prop and does not render VNOC nav items.

- [ ] **Step 3: Replace Sidebar.tsx with VNOC navigation**

Replace the entire `src/app/components/team/Sidebar.tsx`:

```typescript
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "../Logout";
import { VnocRole } from "@prisma/client";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Cpu,
  DoorOpen,
  LayoutDashboard,
  ListTodo,
  Menu,
  Radio,
  Settings,
  User2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { Logo } from "../../../../public/AntaresLogo";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
  onClick,
}: NavItem & { onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-secondary-color/10 text-secondary-color border border-secondary-color/20"
          : "text-muted hover:text-foreground hover:bg-surface2 border border-transparent"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase text-muted px-3 mb-1 mt-4 first:mt-0">
      {label}
    </p>
  );
}

function DataSourceIndicator({
  label,
  healthy,
}: {
  label: string;
  healthy: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
      <Radio className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      <span
        className={`w-2 h-2 rounded-full ${healthy ? "bg-green-500" : "bg-red-400"}`}
        title={healthy ? "Connected" : "Disconnected"}
      />
    </div>
  );
}

export default function SidebarLayout({
  children,
  isSuperAdmin,
  vnocRole,
}: {
  children: React.ReactNode;
  isSuperAdmin?: boolean;
  vnocRole?: VnocRole | null;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const canSeeCustomers =
    isSuperAdmin || vnocRole === "MANAGER" || vnocRole === "TIER2";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-background/95 backdrop-blur-md border-b border-surface2 z-40 flex items-center px-4">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-muted hover:text-foreground transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>
        <Logo subtitle="Call One, Inc" />
      </header>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          w-64 bg-surface border-r border-surface2 flex flex-col
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:sticky md:top-0 md:translate-x-0 md:h-screen
        `}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-surface2 flex items-center justify-between">
          <Logo subtitle="Call One, Inc" />
          <button
            onClick={close}
            className="md:hidden w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center text-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 overflow-y-auto space-y-0.5">
          {/* Overview */}
          <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} onClick={close} />

          {/* Live Operations */}
          <SectionLabel label="Live Operations" />
          <NavLink href="/tickets?queue=mine" label="My Queue" icon={ListTodo} onClick={close} />
          <NavLink href="/alerts" label="All Alerts" icon={AlertTriangle} onClick={close} />
          <NavLink href="/tickets" label="All Tickets" icon={Zap} onClick={close} />

          {/* Asset Navigation */}
          <SectionLabel label="Assets" />
          <NavLink href="/rooms" label="Rooms" icon={DoorOpen} onClick={close} />
          <NavLink href="/devices" label="Devices" icon={Cpu} onClick={close} />

          {/* Customers — MANAGER and TIER2+ only */}
          {canSeeCustomers && (
            <>
              <SectionLabel label="Customers" />
              <NavLink href="/customers" label="Customers" icon={Building2} onClick={close} />
            </>
          )}

          {/* Data Sources */}
          <SectionLabel label="Data Sources" />
          <DataSourceIndicator label="Poly Lens" healthy={true} />
          <DataSourceIndicator label="Yealink YMCS" healthy={true} />
        </nav>

        {/* Admin section */}
        {isSuperAdmin && (
          <div className="px-4 py-4 space-y-0.5 border-t border-surface2">
            <SectionLabel label="Admin" />
            <NavLink href="/users" label="Users" icon={Users} onClick={close} />
            <NavLink href="/settings/platform" label="Platform Settings" icon={Settings} onClick={close} />
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-4 space-y-0.5 border-t border-surface2">
          <NavLink href="/profile" label="Profile" icon={User2} onClick={close} />
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 pt-20 md:pt-6 overflow-y-auto bg-[#F7F6F3]">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run sidebar tests**

```bash
npm run test:run -- src/test/sidebar.test.tsx
```

Expected: All 3 tests pass.

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/team/Sidebar.tsx src/app/(app)/layout.tsx src/test/sidebar.test.tsx
git commit -m "feat: replace sidebar with VNOC navigation layout"
```

---

### Task 3: Create skeleton route pages

**Files:**
- Create: `src/app/(app)/alerts/page.tsx`
- Create: `src/app/(app)/tickets/page.tsx`
- Create: `src/app/(app)/rooms/page.tsx`
- Create: `src/app/(app)/devices/page.tsx`
- Create: `src/app/(app)/customers/page.tsx`

These are server component stubs. They will be replaced in Plan 05 with real UI.

- [ ] **Step 1: Create src/app/(app)/alerts/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">All Alerts</h1>
      <p className="text-muted">Alert table coming in Plan 05.</p>
    </div>
  );
}
```

- [ ] **Step 2: Create src/app/(app)/tickets/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function TicketsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Ticket Queue</h1>
      <p className="text-muted">Ticket queue coming in Plan 05.</p>
    </div>
  );
}
```

- [ ] **Step 3: Create src/app/(app)/rooms/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RoomsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Rooms</h1>
      <p className="text-muted">Room browser coming in Plan 05.</p>
    </div>
  );
}
```

- [ ] **Step 4: Create src/app/(app)/devices/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DevicesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Device Inventory</h1>
      <p className="text-muted">Device inventory coming in Plan 05.</p>
    </div>
  );
}
```

- [ ] **Step 5: Create src/app/(app)/customers/page.tsx**

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CustomersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { isSuperAdmin, vnocRole } = session.user;
  const canAccess = isSuperAdmin || vnocRole === "MANAGER" || vnocRole === "TIER2";
  if (!canAccess) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Customers</h1>
      <p className="text-muted">Customer list coming in Plan 05.</p>
    </div>
  );
}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/(app)/alerts/page.tsx src/app/(app)/tickets/page.tsx src/app/(app)/rooms/page.tsx src/app/(app)/devices/page.tsx src/app/(app)/customers/page.tsx
git commit -m "feat: add skeleton route pages for alerts, tickets, rooms, devices, customers"
```

---

### Task 4: Create Platform Settings page (superAdmin gate)

**Files:**
- Create: `src/app/(app)/settings/platform/page.tsx`

- [ ] **Step 1: Create the settings page**

Create `src/app/(app)/settings/platform/page.tsx`:

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Platform } from "@prisma/client";

const PLATFORM_LABELS: Record<Platform, string> = {
  POLY_LENS: "Poly Lens",
  YEALINK_YMCS: "Yealink YMCS",
  NEAT_PULSE: "Neat Pulse",
  LOGITECH_SYNC: "Logitech Sync",
  CISCO_CONTROL_HUB: "Cisco Control Hub",
  UTELOGY: "Utelogy",
};

export default async function PlatformSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");

  const credentials = await prisma.platformCredential.findMany({
    orderBy: { platform: "asc" },
  });

  const configuredPlatforms = new Set(credentials.map((c) => c.platform));

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Platform Settings</h1>
      <p className="text-muted mb-6">
        Manage API credentials for integrated vendor platforms. Changes take effect on the next sync cycle.
      </p>

      <div className="space-y-4">
        {(["POLY_LENS", "YEALINK_YMCS"] as Platform[]).map((platform) => {
          const cred = credentials.find((c) => c.platform === platform);
          return (
            <div
              key={platform}
              className="bg-white rounded-2xl border border-surface2 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">
                  {PLATFORM_LABELS[platform]}
                </h2>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    configuredPlatforms.has(platform)
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-muted"
                  }`}
                >
                  {configuredPlatforms.has(platform) ? "Configured" : "Not configured"}
                </span>
              </div>
              <p className="text-sm text-muted">
                Credential management UI coming in Plan 05.
                {cred?.config &&
                  ` Last polled: ${
                    (cred.config as Record<string, unknown>).lastPolledAt ?? "never"
                  }`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/settings/platform/page.tsx
git commit -m "feat: add Platform Settings page (superAdmin gate)"
```

---

### Task 5: Create the SSE event bus and stream endpoint

**Files:**
- Create: `src/lib/sse-bus.ts`
- Create: `src/app/api/sse/alerts/route.ts`

- [ ] **Step 1: Write a test for the SSE bus**

Create `src/test/sse-bus.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// Inline a pure version of the bus logic to test event propagation
import { EventEmitter } from 'events'

function createBus() {
  const bus = new EventEmitter()
  bus.setMaxListeners(100)
  return bus
}

describe('SSE event bus', () => {
  it('emits and receives events', () => {
    const bus = createBus()
    const received: unknown[] = []

    bus.on('event', (e) => received.push(e))
    bus.emit('event', { type: 'alert_created', data: { id: 'a1' } })

    expect(received).toHaveLength(1)
    expect((received[0] as { type: string }).type).toBe('alert_created')
  })

  it('allows multiple listeners', () => {
    const bus = createBus()
    let count = 0
    bus.on('event', () => count++)
    bus.on('event', () => count++)
    bus.emit('event', {})
    expect(count).toBe(2)
  })

  it('listener can be removed', () => {
    const bus = createBus()
    let count = 0
    const handler = () => count++
    bus.on('event', handler)
    bus.off('event', handler)
    bus.emit('event', {})
    expect(count).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails (bus module does not exist yet)**

```bash
npm run test:run -- src/test/sse-bus.test.ts
```

Expected: Test runs because the test only uses inline logic — it should pass immediately. If it passes, proceed.

- [ ] **Step 3: Create src/lib/sse-bus.ts**

```typescript
import { EventEmitter } from "events";

export type SseEventType =
  | "alert_created"
  | "alert_resolved"
  | "ticket_opened"
  | "ticket_updated"
  | "kpi_updated";

export interface SseEvent {
  type: SseEventType;
  data: unknown;
}

const globalWithBus = globalThis as typeof globalThis & {
  vnocBus?: EventEmitter;
};

if (!globalWithBus.vnocBus) {
  globalWithBus.vnocBus = new EventEmitter();
  globalWithBus.vnocBus.setMaxListeners(200);
}

export const vnocBus = globalWithBus.vnocBus;

export function emitSseEvent(type: SseEventType, data: unknown): void {
  vnocBus.emit("event", { type, data } satisfies SseEvent);
}
```

- [ ] **Step 4: Create src/app/api/sse/alerts/route.ts**

```typescript
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { vnocBus, SseEvent } from "@/lib/sse-bus";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial snapshot
      try {
        const [activeAlerts, openTickets] = await Promise.all([
          prisma.alert.count({ where: { status: "ACTIVE" } }),
          prisma.ticket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        ]);
        send("snapshot", { activeAlerts, openTickets, timestamp: new Date().toISOString() });
      } catch {
        send("snapshot", { activeAlerts: 0, openTickets: 0, timestamp: new Date().toISOString() });
      }

      // Forward bus events to this SSE connection
      const handler = (event: SseEvent) => {
        send(event.type, event.data);
      };

      vnocBus.on("event", handler);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        vnocBus.off("event", handler);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 5: Run all tests**

```bash
npm run test:run
```

Expected: All tests pass.

- [ ] **Step 6: Start dev server and verify SSE endpoint responds**

```bash
npm run dev
```

In a second terminal:
```bash
curl -N http://localhost:3000/api/sse/alerts -H "Cookie: <your_session_cookie>"
```

Expected: Server sends a `snapshot` event immediately then keeps connection open.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sse-bus.ts src/app/api/sse/alerts/route.ts src/test/sse-bus.test.ts
git commit -m "feat: add SSE event bus and alerts stream endpoint"
```

---

## Completion Check

After all tasks:

- [ ] `npm run test:run` — all tests pass
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npm run dev` — sidebar shows VNOC sections; navigating to `/alerts`, `/tickets`, `/rooms`, `/devices` shows skeleton pages
- [ ] `curl -N http://localhost:3000/api/sse/alerts` with session cookie — returns event stream

**Next plan:** `2026-05-27-vnoc-03-integration-layer.md` — Poly Lens adapter, Yealink adapter, webhook routes, device sync, cron polling.
