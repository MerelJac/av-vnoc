# Rooms & Devices Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build fully functional Rooms and Devices pages — split-tree room browser, device inventory, bidirectional room assignment, and smart vendor-room suggestions.

**Architecture:** Rooms page = server component (initial data fetch) + client RoomsClient orchestrator + RoomsTree (left panel) + RoomDetail (right panel) + modals. Devices page = same server+client split. Seven new API routes; shared UI components (StatusDot, PlatformPill, StatCard) also applied to the Alerts page.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 7 (PostgreSQL), Vitest + @testing-library/react, Tailwind v4, TypeScript

---

## File Map

**New API routes:**
- `src/app/api/rooms/route.ts` — GET (tree) + POST (create)
- `src/app/api/rooms/[id]/route.ts` — GET (detail+suggestions) + PUT (update) + DELETE
- `src/app/api/devices/route.ts` — GET (list with filters)
- `src/app/api/devices/[id]/route.ts` — PUT (assign room)

**New page components:**
- `src/app/(app)/rooms/page.tsx` — server component, auth + initial data
- `src/app/(app)/rooms/RoomsClient.tsx` — "use client" orchestrator, split panel state
- `src/app/(app)/rooms/RoomsTree.tsx` — "use client" left tree panel
- `src/app/(app)/rooms/RoomDetail.tsx` — "use client" right detail panel
- `src/app/(app)/rooms/AssignDeviceModal.tsx` — "use client" assign device modal
- `src/app/(app)/rooms/AddRoomModal.tsx` — "use client" create room modal
- `src/app/(app)/devices/page.tsx` — server component, auth + initial data
- `src/app/(app)/devices/DevicesTable.tsx` — "use client" filterable inventory table

**New shared UI:**
- `src/app/components/ui/StatusDot.tsx`
- `src/app/components/ui/PlatformPill.tsx`
- `src/app/components/ui/StatCard.tsx`

**New tests:**
- `src/test/api/rooms.test.ts`
- `src/test/api/devices-route.test.ts`
- `src/test/rooms-tree.test.tsx`
- `src/test/devices-table.test.tsx`

**Modified:**
- `src/app/(app)/alerts/AlertsTable.tsx` — replace inline pills with PlatformPill + StatusDot
- `prisma/seed.ts` — add rooms + devices seed data

---

## Task 1: Shared UI Components

**Files:**
- Create: `src/app/components/ui/StatusDot.tsx`
- Create: `src/app/components/ui/PlatformPill.tsx`
- Create: `src/app/components/ui/StatCard.tsx`

- [ ] **Step 1: Create StatusDot**

```tsx
// src/app/components/ui/StatusDot.tsx
interface StatusDotProps {
  status: "online" | "offline" | "warn" | "unknown";
  size?: "sm" | "md";
}

const COLOR: Record<StatusDotProps["status"], string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  warn: "bg-orange-400",
  unknown: "bg-gray-400",
};

export function StatusDot({ status, size = "sm" }: StatusDotProps) {
  const dim = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  return <span className={`inline-block rounded-full flex-shrink-0 ${dim} ${COLOR[status]}`} />;
}
```

- [ ] **Step 2: Create PlatformPill**

```tsx
// src/app/components/ui/PlatformPill.tsx
import { Platform } from "@prisma/client";

const LABEL: Partial<Record<Platform, string>> = {
  POLY_LENS: "Poly Lens",
  YEALINK_YMCS: "YMCS",
  NEAT_PULSE: "Neat",
  LOGITECH_SYNC: "Logitech",
  CISCO_CONTROL_HUB: "Cisco",
  UTELOGY: "Utelogy",
};

const STYLE: Partial<Record<Platform, string>> = {
  POLY_LENS: "bg-orange-100 text-orange-700",
  YEALINK_YMCS: "bg-blue-100 text-blue-700",
  NEAT_PULSE: "bg-purple-100 text-purple-700",
  LOGITECH_SYNC: "bg-teal-100 text-teal-700",
  CISCO_CONTROL_HUB: "bg-cyan-100 text-cyan-700",
  UTELOGY: "bg-gray-100 text-gray-600",
};

export function PlatformPill({ platform }: { platform: Platform }) {
  const label = LABEL[platform] ?? platform;
  const style = STYLE[platform] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 3: Create StatCard**

```tsx
// src/app/components/ui/StatCard.tsx
interface StatCardProps {
  value: number | string;
  label: string;
  valueColor?: string;
}

export function StatCard({ value, label, valueColor = "text-foreground" }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex-1 min-w-0">
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/components/ui/StatusDot.tsx src/app/components/ui/PlatformPill.tsx src/app/components/ui/StatCard.tsx
git commit -m "feat: add StatusDot, PlatformPill, StatCard shared UI components"
```

---

## Task 2: GET /api/rooms (tree)

**Files:**
- Create: `src/app/api/rooms/route.ts`
- Create: `src/test/api/rooms.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/api/rooms.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/rooms/route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    room: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    device: { findMany: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);
const mockDeviceFindMany = vi.mocked(prisma.device.findMany);

beforeEach(() => { vi.resetAllMocks(); });

describe("GET /api/rooms", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/rooms"));
    expect(res.status).toBe(401);
  });

  it("returns nested customer→site→room tree with device counts", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockCustomerFindMany.mockResolvedValueOnce([
      {
        id: "cust-1",
        name: "Acme Corp",
        sites: [
          {
            id: "site-1",
            name: "HQ",
            city: "Chicago",
            state: "IL",
            rooms: [
              {
                id: "room-1",
                name: "Conference A",
                devices: [
                  { id: "d1", status: "online" },
                  { id: "d2", status: "offline" },
                ],
                _count: { alerts: 1 },
              },
            ],
          },
        ],
      },
    ] as never);

    const res = await GET(new NextRequest("http://localhost/api/rooms"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].name).toBe("Acme Corp");
    expect(body.data[0].sites[0].rooms[0]).toMatchObject({
      id: "room-1",
      name: "Conference A",
      totalDevices: 2,
      onlineDevices: 1,
      activeAlerts: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/api/rooms.test.ts
```
Expected: FAIL — `GET` not found

- [ ] **Step 3: Implement GET /api/rooms**

```typescript
// src/app/api/rooms/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        include: {
          rooms: {
            orderBy: { name: "asc" },
            include: {
              devices: { select: { id: true, status: true } },
              _count: { select: { alerts: { where: { status: "ACTIVE" } } } },
            },
          },
        },
      },
    },
  });

  const data = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    sites: customer.sites.map((site) => ({
      id: site.id,
      name: site.name,
      city: site.city,
      state: site.state,
      rooms: site.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        totalDevices: room.devices.length,
        onlineDevices: room.devices.filter((d) => d.status === "online").length,
        activeAlerts: room._count.alerts,
      })),
    })),
  }));

  return NextResponse.json({ success: true, data });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/api/rooms.test.ts
```
Expected: PASS (2 tests)

---

## Task 3: POST /api/rooms + GET/PUT/DELETE /api/rooms/[id]

**Files:**
- Modify: `src/app/api/rooms/route.ts` (add POST)
- Create: `src/app/api/rooms/[id]/route.ts`
- Modify: `src/test/api/rooms.test.ts` (add tests)

- [ ] **Step 1: Write failing tests for POST and room CRUD**

Append to `src/test/api/rooms.test.ts`:

```typescript
import { POST } from "@/app/api/rooms/route";
import { GET as GETRoom, PUT, DELETE } from "@/app/api/rooms/[id]/route";

const mockRoomCreate = vi.mocked(prisma.room.create);
const mockRoomFindUnique = vi.mocked(prisma.room.findUnique);
const mockRoomUpdate = vi.mocked(prisma.room.update);
const mockRoomDelete = vi.mocked(prisma.room.delete);

describe("GET /api/rooms/[id]", () => {
  it("returns room detail with devices and suggestions", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockRoomFindUnique.mockResolvedValueOnce({
      id: "room-1", name: "Conference A",
      site: { id: "s1", name: "HQ", customer: { id: "c1", name: "Acme" } },
      devices: [{ id: "d1", name: "Studio X30", platform: "POLY_LENS", model: null, status: "online", lastSeenAt: null, macAddress: null, rawPayload: null }],
      _count: { alerts: 0 },
    } as never);
    mockDeviceFindMany.mockResolvedValueOnce([
      { id: "d2", name: "EaglEye", platform: "POLY_LENS", model: null, rawPayload: { room: { id: "x", name: "Conference A" } }, status: "offline" },
    ] as never);

    const req = new NextRequest("http://localhost/api/rooms/room-1");
    const res = await GETRoom(req, { params: Promise.resolve({ id: "room-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Conference A");
    expect(body.data.devices).toHaveLength(1);
    expect(body.data.suggestions).toHaveLength(1); // vendor name matches
    expect(body.data.suggestions[0].name).toBe("EaglEye");
  });
});

describe("POST /api/rooms", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/rooms", {
      method: "POST",
      body: JSON.stringify({ siteId: "site-1", name: "New Room" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 if name or siteId missing", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    const req = new NextRequest("http://localhost/api/rooms", {
      method: "POST",
      body: JSON.stringify({ siteId: "site-1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates room and returns it", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockRoomCreate.mockResolvedValueOnce({
      id: "room-new",
      siteId: "site-1",
      name: "New Room",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    const req = new NextRequest("http://localhost/api/rooms", {
      method: "POST",
      body: JSON.stringify({ siteId: "site-1", name: "New Room" }),
    });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.name).toBe("New Room");
  });
});

describe("PUT /api/rooms/[id]", () => {
  it("updates room name", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockRoomUpdate.mockResolvedValueOnce({ id: "room-1", name: "Renamed" } as never);
    const req = new NextRequest("http://localhost/api/rooms/room-1", {
      method: "PUT",
      body: JSON.stringify({ name: "Renamed" }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "room-1" }) });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/rooms/[id]", () => {
  it("deletes room", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockRoomDelete.mockResolvedValueOnce({ id: "room-1" } as never);
    const req = new NextRequest("http://localhost/api/rooms/room-1", { method: "DELETE" });
    const res = await DELETE(req, { params: Promise.resolve({ id: "room-1" }) });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/api/rooms.test.ts
```
Expected: FAIL on POST/PUT/DELETE tests

- [ ] **Step 3: Add POST to rooms/route.ts**

```typescript
// Append to src/app/api/rooms/route.ts
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { siteId?: string; name?: string };
  if (!body.name?.trim() || !body.siteId) {
    return NextResponse.json({ error: "siteId and name are required" }, { status: 400 });
  }

  const room = await prisma.room.create({
    data: { siteId: body.siteId, name: body.name.trim() },
  });

  return NextResponse.json({ success: true, data: room }, { status: 201 });
}
```

- [ ] **Step 4: Create /api/rooms/[id]/route.ts**

```typescript
// src/app/api/rooms/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      site: { include: { customer: { select: { id: true, name: true } } } },
      devices: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, platform: true, model: true,
          status: true, lastSeenAt: true, macAddress: true, rawPayload: true,
        },
      },
      _count: {
        select: {
          alerts: { where: { status: "ACTIVE" } },
        },
      },
    },
  });

  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Find unassigned devices whose vendor room name matches this room
  const unassigned = await prisma.device.findMany({
    where: { roomId: null },
    select: { id: true, name: true, platform: true, model: true, rawPayload: true, status: true },
  });

  const suggestions = unassigned.filter((d) => {
    const vendorName = extractVendorRoomName(d.rawPayload);
    if (!vendorName) return false;
    return vendorRoomNameMatches(vendorName, room.name);
  });

  const onlineDevices = room.devices.filter((d) => d.status === "online").length;

  return NextResponse.json({
    success: true,
    data: {
      id: room.id,
      name: room.name,
      site: room.site,
      devices: room.devices,
      totalDevices: room.devices.length,
      onlineDevices,
      activeAlerts: room._count.alerts,
      suggestions,
    },
  });
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const room = await prisma.room.update({
    where: { id },
    data: { name: body.name.trim() },
  });

  return NextResponse.json({ success: true, data: room });
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.room.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const p = rawPayload as Record<string, unknown>;
  const room = p["room"] as { name?: string } | null | undefined;
  return room?.name ?? null;
}

function vendorRoomNameMatches(vendorName: string, roomName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const v = normalize(vendorName);
  const r = normalize(roomName);
  return v === r || v.includes(r) || r.includes(v);
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/api/rooms.test.ts
```
Expected: PASS (all rooms tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/rooms/ src/test/api/rooms.test.ts
git commit -m "feat: add /api/rooms CRUD endpoints with device-count tree response"
```

---

## Task 4: GET /api/devices + PUT /api/devices/[id]

**Files:**
- Create: `src/app/api/devices/route.ts`
- Create: `src/app/api/devices/[id]/route.ts`
- Create: `src/test/api/devices-route.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/api/devices-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/devices/route";
import { PUT } from "@/app/api/devices/[id]/route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    device: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.device.findMany);
const mockCount = vi.mocked(prisma.device.count);
const mockUpdate = vi.mocked(prisma.device.update);

beforeEach(() => { vi.resetAllMocks(); });

describe("GET /api/devices", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/devices"));
    expect(res.status).toBe(401);
  });

  it("returns paginated device list", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "d1", name: "Studio X30", platform: "POLY_LENS",
        model: "Poly Studio X30", status: "online", lastSeenAt: new Date(),
        macAddress: "aa:bb:cc:11:22:33", rawPayload: null,
        room: null,
      },
    ] as never);
    mockCount.mockResolvedValueOnce(1);

    const res = await GET(new NextRequest("http://localhost/api/devices"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0].name).toBe("Studio X30");
    expect(body.meta.total).toBe(1);
  });

  it("filters to unassigned devices when ?unassigned=true", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    const res = await GET(new NextRequest("http://localhost/api/devices?unassigned=true"));
    expect(res.status).toBe(200);
    // Verify prisma was called with roomId: null filter
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ roomId: null }) })
    );
  });
});

describe("PUT /api/devices/[id]", () => {
  it("assigns device to room", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockUpdate.mockResolvedValueOnce({ id: "d1", roomId: "room-1" } as never);

    const req = new NextRequest("http://localhost/api/devices/d1", {
      method: "PUT",
      body: JSON.stringify({ roomId: "room-1" }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "d1" }) });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.roomId).toBe("room-1");
  });

  it("unassigns device when roomId is null", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockUpdate.mockResolvedValueOnce({ id: "d1", roomId: null } as never);

    const req = new NextRequest("http://localhost/api/devices/d1", {
      method: "PUT",
      body: JSON.stringify({ roomId: null }),
    });
    const res = await PUT(req, { params: Promise.resolve({ id: "d1" }) });
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roomId: null } })
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/api/devices-route.test.ts
```
Expected: FAIL — routes not found

- [ ] **Step 3: Create GET /api/devices**

```typescript
// src/app/api/devices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Platform } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const customerId = searchParams.get("customerId");
  const platform = searchParams.get("platform") as Platform | null;
  const status = searchParams.get("status");
  const unassigned = searchParams.get("unassigned") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));

  const where = {
    ...(unassigned ? { roomId: null } : {}),
    ...(platform ? { platform } : {}),
    ...(status ? { status } : {}),
    ...(!unassigned && customerId
      ? { room: { site: { customerId } } }
      : {}),
  };

  const [devices, total] = await Promise.all([
    prisma.device.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, name: true, platform: true, platformId: true,
        model: true, status: true, lastSeenAt: true, macAddress: true,
        rawPayload: true,
        room: {
          select: {
            id: true, name: true,
            site: { select: { name: true, customer: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.device.count({ where }),
  ]);

  return NextResponse.json({ success: true, data: devices, meta: { total, page, limit } });
}
```

- [ ] **Step 4: Create PUT /api/devices/[id]**

```typescript
// src/app/api/devices/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as { roomId?: string | null };

  const device = await prisma.device.update({
    where: { id },
    data: { roomId: body.roomId ?? null },
    select: {
      id: true, name: true, roomId: true,
      room: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ success: true, data: device });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/api/devices-route.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/devices/ src/test/api/devices-route.test.ts
git commit -m "feat: add /api/devices list+filter and PUT /api/devices/[id] for room assignment"
```

---

## Task 5: RoomsTree Component

**Files:**
- Create: `src/app/(app)/rooms/RoomsTree.tsx`
- Create: `src/test/rooms-tree.test.tsx`

- [ ] **Step 1: Define shared types (used across rooms components)**

Create `src/app/(app)/rooms/types.ts`:

```typescript
// src/app/(app)/rooms/types.ts
export interface RoomSummary {
  id: string;
  name: string;
  totalDevices: number;
  onlineDevices: number;
  activeAlerts: number;
}

export interface SiteSummary {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  rooms: RoomSummary[];
}

export interface CustomerSummary {
  id: string;
  name: string;
  sites: SiteSummary[];
}
```

- [ ] **Step 2: Write failing component test**

```tsx
// src/test/rooms-tree.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoomsTree } from "@/app/(app)/rooms/RoomsTree";
import type { CustomerSummary } from "@/app/(app)/rooms/types";

const CUSTOMERS: CustomerSummary[] = [
  {
    id: "c1", name: "Acme Corp",
    sites: [
      {
        id: "s1", name: "HQ", city: "Chicago", state: "IL",
        rooms: [
          { id: "r1", name: "Conference A", totalDevices: 2, onlineDevices: 1, activeAlerts: 0 },
          { id: "r2", name: "Board Room", totalDevices: 3, onlineDevices: 3, activeAlerts: 0 },
        ],
      },
    ],
  },
];

describe("RoomsTree", () => {
  it("renders customer and site names", () => {
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={vi.fn()} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("HQ")).toBeInTheDocument();
  });

  it("renders room names", () => {
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={vi.fn()} />);
    expect(screen.getByText("Conference A")).toBeInTheDocument();
    expect(screen.getByText("Board Room")).toBeInTheDocument();
  });

  it("calls onSelectRoom when room is clicked", () => {
    const onSelectRoom = vi.fn();
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={onSelectRoom} />);
    fireEvent.click(screen.getByText("Conference A"));
    expect(onSelectRoom).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
  });

  it("filters rooms by search input", () => {
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={vi.fn()} />);
    const search = screen.getByPlaceholderText(/search rooms/i);
    fireEvent.change(search, { target: { value: "Board" } });
    expect(screen.queryByText("Conference A")).not.toBeInTheDocument();
    expect(screen.getByText("Board Room")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/rooms-tree.test.tsx
```
Expected: FAIL — RoomsTree not found

- [ ] **Step 4: Implement RoomsTree**

```tsx
// src/app/(app)/rooms/RoomsTree.tsx
"use client";
import { useState } from "react";
import { StatusDot } from "@/app/components/ui/StatusDot";
import type { CustomerSummary, RoomSummary } from "./types";

interface Props {
  customers: CustomerSummary[];
  selectedRoomId: string | null;
  onSelectRoom: (room: RoomSummary & { siteId: string; siteName: string; customerId: string; customerName: string }) => void;
}

function roomStatus(room: RoomSummary): "online" | "warn" | "offline" | "unknown" {
  if (room.totalDevices === 0) return "unknown";
  if (room.activeAlerts > 0) return "warn";
  if (room.onlineDevices === room.totalDevices) return "online";
  if (room.onlineDevices === 0) return "offline";
  return "warn";
}

export function RoomsTree({ customers, selectedRoomId, onSelectRoom }: Props) {
  const [search, setSearch] = useState("");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set(customers.map((c) => c.id))
  );
  const [expandedSites, setExpandedSites] = useState<Set<string>>(
    new Set(customers.flatMap((c) => c.sites.map((s) => s.id)))
  );

  const filtered = search.trim()
    ? customers
        .map((c) => ({
          ...c,
          sites: c.sites
            .map((s) => ({
              ...s,
              rooms: s.rooms.filter((r) =>
                r.name.toLowerCase().includes(search.toLowerCase())
              ),
            }))
            .filter((s) => s.rooms.length > 0),
        }))
        .filter((c) => c.sites.length > 0)
    : customers;

  const toggleCustomer = (id: string) =>
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSite = (id: string) =>
    setExpandedSites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <input
          className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search rooms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.map((customer) => (
          <div key={customer.id} className="mb-1">
            <button
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted rounded-md text-left"
              onClick={() => toggleCustomer(customer.id)}
            >
              <span className="text-muted-foreground text-xs">
                {expandedCustomers.has(customer.id) ? "▾" : "▸"}
              </span>
              🏢 {customer.name}
            </button>
            {expandedCustomers.has(customer.id) &&
              customer.sites.map((site) => (
                <div key={site.id} className="ml-3">
                  <button
                    className="w-full flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:bg-muted rounded-md text-left"
                    onClick={() => toggleSite(site.id)}
                  >
                    <span className="text-xs">
                      {expandedSites.has(site.id) ? "▾" : "▸"}
                    </span>
                    📍 {site.name}
                    {site.city && (
                      <span className="text-muted-foreground/60 ml-1">— {site.city}</span>
                    )}
                  </button>
                  {expandedSites.has(site.id) && (
                    <div className="ml-3 mt-0.5">
                      {site.rooms.map((room) => (
                        <button
                          key={room.id}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-md text-left transition-colors ${
                            selectedRoomId === room.id
                              ? "bg-primary/10 text-primary border-l-2 border-primary"
                              : "text-foreground hover:bg-muted"
                          }`}
                          onClick={() =>
                            onSelectRoom({
                              ...room,
                              siteId: site.id,
                              siteName: site.name,
                              customerId: customer.id,
                              customerName: customer.name,
                            })
                          }
                        >
                          <span className="flex items-center gap-2">
                            <StatusDot status={roomStatus(room)} />
                            {room.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {room.totalDevices}
                          </span>
                        </button>
                      ))}
                      <button
                        className="w-full text-left px-3 py-1 text-xs text-primary/70 hover:text-primary border border-dashed border-primary/20 hover:border-primary/40 rounded-md mt-1 transition-colors"
                        onClick={() =>
                          onSelectRoom({
                            id: "__new__",
                            name: "",
                            totalDevices: 0,
                            onlineDevices: 0,
                            activeAlerts: 0,
                            siteId: site.id,
                            siteName: site.name,
                            customerId: customer.id,
                            customerName: customer.name,
                          })
                        }
                      >
                        + Add room to {site.name}
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No rooms match your search.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/rooms-tree.test.tsx
```
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/rooms/types.ts src/app/(app)/rooms/RoomsTree.tsx src/test/rooms-tree.test.tsx
git commit -m "feat: add RoomsTree component with search, expand/collapse, status dots"
```

---

## Task 6: AssignDeviceModal + AddRoomModal

**Files:**
- Create: `src/app/(app)/rooms/AssignDeviceModal.tsx`
- Create: `src/app/(app)/rooms/AddRoomModal.tsx`

- [ ] **Step 1: Create AssignDeviceModal**

```tsx
// src/app/(app)/rooms/AssignDeviceModal.tsx
"use client";
import { useState, useEffect } from "react";
import { PlatformPill } from "@/app/components/ui/PlatformPill";
import { Platform } from "@prisma/client";

interface UnassignedDevice {
  id: string;
  name: string;
  platform: Platform;
  model?: string | null;
  macAddress?: string | null;
  rawPayload: unknown;
  status: string;
}

interface Props {
  roomId: string;
  roomName: string;
  onClose: () => void;
  onAssigned: () => void;
}

function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const room = (rawPayload as Record<string, unknown>)["room"] as { name?: string } | null;
  return room?.name ?? null;
}

export function AssignDeviceModal({ roomId, roomName, onClose, onAssigned }: Props) {
  const [devices, setDevices] = useState<UnassignedDevice[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/devices?unassigned=true&limit=100")
      .then((r) => r.json())
      .then((j) => { if (j.success) setDevices(j.data); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.macAddress ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.model ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const assign = async (deviceId: string) => {
    setAssigning(deviceId);
    await fetch(`/api/devices/${deviceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
    setAssigning(null);
    onAssigned();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-5 w-[460px] max-h-[80vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-base font-semibold">Assign Device to {roomName}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing unassigned devices from all platforms
          </p>
        </div>
        <input
          className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring mb-3"
          placeholder="Search by name, MAC, model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No unassigned devices found.</p>
          )}
          {filtered.map((device) => {
            const vendorRoom = extractVendorRoomName(device.rawPayload);
            return (
              <div
                key={device.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {device.name}
                    <PlatformPill platform={device.platform} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {device.model && <span>{device.model} · </span>}
                    {device.macAddress && <span>{device.macAddress}</span>}
                  </div>
                  {vendorRoom && (
                    <div className="text-xs text-orange-500 mt-0.5">
                      Vendor says: &quot;{vendorRoom}&quot;
                      {vendorRoom.toLowerCase() === roomName.toLowerCase() && (
                        <span className="text-green-600 ml-1">— likely match</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50"
                  disabled={assigning === device.id}
                  onClick={() => assign(device.id)}
                >
                  {assigning === device.id ? "Adding…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm hover:bg-muted/80"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AddRoomModal**

```tsx
// src/app/(app)/rooms/AddRoomModal.tsx
"use client";
import { useState } from "react";

interface Props {
  siteId: string;
  siteName: string;
  onClose: () => void;
  onCreated: (room: { id: string; name: string }) => void;
}

export function AddRoomModal({ siteId, siteName, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Room name is required."); return; }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, name: name.trim() }),
    });
    const json = await res.json() as { success?: boolean; data?: { id: string; name: string }; error?: string };
    setLoading(false);
    if (json.success && json.data) {
      onCreated(json.data);
    } else {
      setError(json.error ?? "Failed to create room.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form
        className="bg-card border border-border rounded-xl p-5 w-[380px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-base font-semibold mb-1">Add Room to {siteName}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Creates a new room under this site. Devices can be assigned after creation.
        </p>
        <div className="mb-4">
          <label className="block text-xs text-muted-foreground mb-1">Room name</label>
          <input
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Conference Room A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Creating…" : "Create Room"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/rooms/AssignDeviceModal.tsx src/app/(app)/rooms/AddRoomModal.tsx
git commit -m "feat: add AssignDeviceModal and AddRoomModal for room management"
```

---

## Task 7: RoomDetail Component

**Files:**
- Create: `src/app/(app)/rooms/RoomDetail.tsx`

- [ ] **Step 1: Create RoomDetail**

```tsx
// src/app/(app)/rooms/RoomDetail.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { Platform } from "@prisma/client";
import { StatusDot } from "@/app/components/ui/StatusDot";
import { PlatformPill } from "@/app/components/ui/PlatformPill";
import { StatCard } from "@/app/components/ui/StatCard";
import { AssignDeviceModal } from "./AssignDeviceModal";

interface Device {
  id: string;
  name: string;
  platform: Platform;
  model?: string | null;
  status: string;
  lastSeenAt?: string | null;
  macAddress?: string | null;
  rawPayload: unknown;
}

interface Suggestion {
  id: string;
  name: string;
  platform: Platform;
  rawPayload: unknown;
}

interface RoomData {
  id: string;
  name: string;
  site: { name: string; customer: { name: string } };
  devices: Device[];
  totalDevices: number;
  onlineDevices: number;
  activeAlerts: number;
  suggestions: Suggestion[];
}

interface Props {
  roomId: string;
  roomName: string;
  onRoomUpdated: () => void;
}

function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const room = (rawPayload as Record<string, unknown>)["room"] as { name?: string } | null;
  return room?.name ?? null;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RoomDetail({ roomId, roomName, onRoomUpdated }: Props) {
  const [data, setData] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAssign, setShowAssign] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/rooms/${roomId}`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setData(j.data); })
      .finally(() => setLoading(false));
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  const unassign = async (deviceId: string) => {
    await fetch(`/api/devices/${deviceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: null }),
    });
    load();
    onRoomUpdated();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>;
  }

  if (!data) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Room not found.</div>;
  }

  return (
    <div className="p-6 overflow-y-auto h-full">

      {/* Suggestion banner */}
      {data.suggestions.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-800">
              ⚠ {data.suggestions.length} unassigned device{data.suggestions.length > 1 ? "s" : ""} may belong here
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              {data.suggestions.map((s) => {
                const v = extractVendorRoomName(s.rawPayload);
                return `${s.name}${v ? ` (vendor: "${v}")` : ""}`;
              }).join(", ")}
            </p>
          </div>
          <button
            className="bg-orange-500 text-white px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ml-4"
            onClick={() => setShowAssign(true)}
          >
            Review &amp; Assign →
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{data.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.site.customer.name} · {data.site.name}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="bg-muted border border-border text-foreground px-3 py-1.5 rounded-md text-sm">
            Edit Room
          </button>
          <button
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium"
            onClick={() => setShowAssign(true)}
          >
            + Assign Device
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6">
        <StatCard value={data.onlineDevices} label="Online" valueColor="text-green-600" />
        <StatCard value={data.totalDevices - data.onlineDevices} label="Offline" valueColor="text-red-500" />
        <StatCard value={data.activeAlerts} label="Active Alerts" valueColor={data.activeAlerts > 0 ? "text-orange-500" : undefined} />
        <StatCard value={data.totalDevices} label="Total Devices" />
      </div>

      {/* Device table */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Devices in this room
      </div>
      {data.devices.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
          No devices assigned. Click &quot;+ Assign Device&quot; to add one.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left py-2 px-3">Device</th>
              <th className="text-left py-2 px-3">Platform</th>
              <th className="text-left py-2 px-3">Model</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Last Seen</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {data.devices.map((device) => (
              <tr key={device.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                <td className="py-2.5 px-3">
                  <div className="font-medium">{device.name}</div>
                  {device.macAddress && (
                    <div className="text-xs text-muted-foreground font-mono">{device.macAddress}</div>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <PlatformPill platform={device.platform} />
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">{device.model ?? "—"}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <StatusDot status={device.status === "online" ? "online" : device.status === "offline" ? "offline" : "unknown"} />
                    <span className="capitalize">{device.status}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">{relativeTime(device.lastSeenAt)}</td>
                <td className="py-2.5 px-3 text-right">
                  <button
                    className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                    onClick={() => unassign(device.id)}
                  >
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAssign && (
        <AssignDeviceModal
          roomId={roomId}
          roomName={roomName}
          onClose={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); load(); onRoomUpdated(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(app)/rooms/RoomDetail.tsx
git commit -m "feat: add RoomDetail component with device table, stat cards, and suggestion banner"
```

---

## Task 8: RoomsClient + Rooms page.tsx

**Files:**
- Create: `src/app/(app)/rooms/RoomsClient.tsx`
- Modify: `src/app/(app)/rooms/page.tsx`

- [ ] **Step 1: Create RoomsClient**

```tsx
// src/app/(app)/rooms/RoomsClient.tsx
"use client";
import { useState, useCallback } from "react";
import { RoomsTree } from "./RoomsTree";
import { RoomDetail } from "./RoomDetail";
import { AddRoomModal } from "./AddRoomModal";
import type { CustomerSummary, RoomSummary } from "./types";

type SelectedRoom = RoomSummary & {
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;
};

interface Props {
  initialCustomers: CustomerSummary[];
}

export function RoomsClient({ initialCustomers }: Props) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [selectedRoom, setSelectedRoom] = useState<SelectedRoom | null>(null);
  const [addRoomContext, setAddRoomContext] = useState<{ siteId: string; siteName: string } | null>(null);

  const refreshTree = useCallback(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((j) => { if (j.success) setCustomers(j.data); });
  }, []);

  const handleSelectRoom = (room: SelectedRoom) => {
    if (room.id === "__new__") {
      setAddRoomContext({ siteId: room.siteId, siteName: room.siteName });
    } else {
      setSelectedRoom(room);
    }
  };

  return (
    <div className="flex h-[calc(100vh-120px)] border border-border rounded-lg overflow-hidden">
      {/* Tree panel */}
      <div className="w-64 border-r border-border bg-card flex-shrink-0">
        <RoomsTree
          customers={customers}
          selectedRoomId={selectedRoom?.id ?? null}
          onSelectRoom={handleSelectRoom}
        />
      </div>

      {/* Detail panel */}
      <div className="flex-1 bg-background overflow-hidden">
        {selectedRoom ? (
          <RoomDetail
            key={selectedRoom.id}
            roomId={selectedRoom.id}
            roomName={selectedRoom.name}
            onRoomUpdated={refreshTree}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-4xl mb-3">🏢</p>
            <p className="text-sm">Select a room from the tree to view details</p>
          </div>
        )}
      </div>

      {/* Add room modal */}
      {addRoomContext && (
        <AddRoomModal
          siteId={addRoomContext.siteId}
          siteName={addRoomContext.siteName}
          onClose={() => setAddRoomContext(null)}
          onCreated={(newRoom) => {
            setAddRoomContext(null);
            refreshTree();
            // Auto-select the new room
            if (addRoomContext) {
              setSelectedRoom({
                id: newRoom.id,
                name: newRoom.name,
                totalDevices: 0,
                onlineDevices: 0,
                activeAlerts: 0,
                siteId: addRoomContext.siteId,
                siteName: addRoomContext.siteName,
                customerId: "",
                customerName: "",
              });
            }
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace rooms page.tsx stub**

```tsx
// src/app/(app)/rooms/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RoomsClient } from "./RoomsClient";

export default async function RoomsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        include: {
          rooms: {
            orderBy: { name: "asc" },
            include: {
              devices: { select: { id: true, status: true } },
              _count: { select: { alerts: { where: { status: "ACTIVE" } } } },
            },
          },
        },
      },
    },
  });

  const initialCustomers = customers.map((c) => ({
    id: c.id,
    name: c.name,
    sites: c.sites.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      state: s.state,
      rooms: s.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        totalDevices: r.devices.length,
        onlineDevices: r.devices.filter((d) => d.status === "online").length,
        activeAlerts: r._count.alerts,
      })),
    })),
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Rooms</h1>
      </div>
      <RoomsClient initialCustomers={initialCustomers} />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/rooms/
git commit -m "feat: wire up Rooms page — split tree/detail, add room modal, refresh on mutation"
```

---

## Task 9: Devices Page

**Files:**
- Create: `src/app/(app)/devices/DevicesTable.tsx`
- Modify: `src/app/(app)/devices/page.tsx`
- Create: `src/test/devices-table.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/test/devices-table.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DevicesTable } from "@/app/(app)/devices/DevicesTable";

const DEVICES = [
  {
    id: "d1", name: "Studio X30", platform: "POLY_LENS" as const,
    model: "Poly Studio X30", status: "online", lastSeenAt: new Date().toISOString(),
    macAddress: "aa:bb:cc:11:22:33", rawPayload: null,
    room: { id: "r1", name: "Conference A", site: { name: "HQ", customer: { id: "c1", name: "Acme" } } },
  },
  {
    id: "d2", name: "T57W-001", platform: "YEALINK_YMCS" as const,
    model: "Yealink T57W", status: "offline", lastSeenAt: null,
    macAddress: null, rawPayload: { room: { id: "r-ext", name: "Board Room" } },
    room: null,
  },
];

const global = window as typeof window & { fetch: unknown };

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("DevicesTable", () => {
  it("renders device names and platforms", () => {
    render(<DevicesTable initialDevices={DEVICES as never} initialTotal={2} />);
    expect(screen.getByText("Studio X30")).toBeInTheDocument();
    expect(screen.getByText("T57W-001")).toBeInTheDocument();
    expect(screen.getByText("Poly Lens")).toBeInTheDocument();
    expect(screen.getByText("YMCS")).toBeInTheDocument();
  });

  it("shows unassigned badge for devices with no room", () => {
    render(<DevicesTable initialDevices={DEVICES as never} initialTotal={2} />);
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });

  it("shows room name for assigned devices", () => {
    render(<DevicesTable initialDevices={DEVICES as never} initialTotal={2} />);
    expect(screen.getByText("Conference A")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/devices-table.test.tsx
```
Expected: FAIL — DevicesTable not found

- [ ] **Step 3: Create DevicesTable**

```tsx
// src/app/(app)/devices/DevicesTable.tsx
"use client";
import { useState, useCallback } from "react";
import { Platform } from "@prisma/client";
import { StatusDot } from "@/app/components/ui/StatusDot";
import { PlatformPill } from "@/app/components/ui/PlatformPill";

interface RoomRef {
  id: string;
  name: string;
  site: { name: string; customer: { id: string; name: string } };
}

interface Device {
  id: string;
  name: string;
  platform: Platform;
  model?: string | null;
  status: string;
  lastSeenAt?: string | null;
  macAddress?: string | null;
  rawPayload: unknown;
  room: RoomRef | null;
}

interface Props {
  initialDevices: Device[];
  initialTotal: number;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const room = (rawPayload as Record<string, unknown>)["room"] as { name?: string } | null;
  return room?.name ?? null;
}

export function DevicesTable({ initialDevices, initialTotal }: Props) {
  const [devices, setDevices] = useState(initialDevices);
  const [total, setTotal] = useState(initialTotal);
  const [platformFilter, setPlatformFilter] = useState<Platform | "">("");
  const [statusFilter, setStatusFilter] = useState<"" | "online" | "offline">("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  const unassignedCount = devices.filter((d) => !d.room).length;

  const refresh = useCallback(async (overrides?: {
    platform?: Platform | "";
    status?: "" | "online" | "offline";
    unassigned?: boolean;
  }) => {
    const p = overrides?.platform ?? platformFilter;
    const s = overrides?.status ?? statusFilter;
    const u = overrides?.unassigned ?? unassignedOnly;
    const params = new URLSearchParams({ limit: "100" });
    if (p) params.set("platform", p);
    if (s) params.set("status", s);
    if (u) params.set("unassigned", "true");
    const res = await fetch(`/api/devices?${params}`);
    const json = await res.json() as { success: boolean; data: Device[]; meta: { total: number } };
    if (json.success) { setDevices(json.data); setTotal(json.meta.total); }
  }, [platformFilter, statusFilter, unassignedOnly]);

  const setAndRefreshPlatform = (v: Platform | "") => {
    setPlatformFilter(v);
    refresh({ platform: v });
  };
  const setAndRefreshStatus = (v: "" | "online" | "offline") => {
    setStatusFilter(v);
    refresh({ status: v });
  };
  const setAndRefreshUnassigned = (v: boolean) => {
    setUnassignedOnly(v);
    refresh({ unassigned: v });
  };

  const assignDevice = async (deviceId: string, roomId: string) => {
    setAssigning(deviceId);
    await fetch(`/api/devices/${deviceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
    setAssigning(null);
    refresh();
  };

  return (
    <div>
      {/* Unassigned banner */}
      {unassignedCount > 0 && !unassignedOnly && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between">
          <p className="text-sm text-orange-800">
            <strong>{unassignedCount}</strong> device{unassignedCount > 1 ? "s" : ""} not assigned to a room
          </p>
          <button
            className="text-xs text-orange-600 font-medium hover:text-orange-800"
            onClick={() => setAndRefreshUnassigned(true)}
          >
            Show unassigned →
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={platformFilter}
          onChange={(e) => setAndRefreshPlatform(e.target.value as Platform | "")}
        >
          <option value="">All Platforms</option>
          <option value="POLY_LENS">Poly Lens</option>
          <option value="YEALINK_YMCS">YMCS</option>
          <option value="NEAT_PULSE">Neat</option>
          <option value="LOGITECH_SYNC">Logitech</option>
          <option value="CISCO_CONTROL_HUB">Cisco</option>
        </select>
        <select
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={statusFilter}
          onChange={(e) => setAndRefreshStatus(e.target.value as "" | "online" | "offline")}
        >
          <option value="">All Statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
        <button
          className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
            unassignedOnly
              ? "bg-orange-100 border-orange-300 text-orange-700 font-medium"
              : "bg-card border-border text-muted-foreground hover:border-foreground/40"
          }`}
          onClick={() => setAndRefreshUnassigned(!unassignedOnly)}
        >
          Unassigned only {unassignedOnly && `(${total})`}
        </button>
        <span className="ml-auto text-sm text-muted-foreground self-center">
          {total} device{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left py-3 px-4">Device</th>
              <th className="text-left py-3 px-4">Platform</th>
              <th className="text-left py-3 px-4">Model</th>
              <th className="text-left py-3 px-4">Room</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Last Seen</th>
              <th className="py-3 px-4" />
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => {
              const vendorRoom = !device.room ? extractVendorRoomName(device.rawPayload) : null;
              return (
                <tr key={device.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium">{device.name}</div>
                    {device.macAddress && (
                      <div className="text-xs text-muted-foreground font-mono">{device.macAddress}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <PlatformPill platform={device.platform} />
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{device.model ?? "—"}</td>
                  <td className="py-3 px-4">
                    {device.room ? (
                      <div>
                        <div className="font-medium">{device.room.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.room.site.customer.name} · {device.room.site.name}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-orange-500 text-xs font-medium">⚠ unassigned</span>
                        {vendorRoom && (
                          <div className="text-xs text-muted-foreground">vendor: &quot;{vendorRoom}&quot;</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        status={
                          device.status === "online" ? "online"
                          : device.status === "offline" ? "offline"
                          : "unknown"
                        }
                      />
                      <span className="capitalize">{device.status}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{relativeTime(device.lastSeenAt)}</td>
                  <td className="py-3 px-4 text-right">
                    {!device.room && (
                      <button
                        className="text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded-md disabled:opacity-50"
                        disabled={assigning === device.id}
                        onClick={() => {
                          const roomId = prompt("Enter room ID to assign:");
                          if (roomId) assignDevice(device.id, roomId);
                        }}
                      >
                        Assign
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground text-sm">
                  No devices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

> **Note:** The "Assign" button uses `prompt()` as a placeholder. This is intentional for v1 — a future iteration can replace it with a proper room-picker dropdown. The Rooms page's AssignDeviceModal is the primary assignment UI; the Devices page Assign button is a secondary convenience path.

- [ ] **Step 4: Replace devices page.tsx stub**

```tsx
// src/app/(app)/devices/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DevicesTable } from "./DevicesTable";

export default async function DevicesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [devices, total] = await Promise.all([
    prisma.device.findMany({
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true, name: true, platform: true, platformId: true,
        model: true, status: true, lastSeenAt: true, macAddress: true, rawPayload: true,
        room: {
          select: {
            id: true, name: true,
            site: { select: { name: true, customer: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.device.count(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Device Inventory</h1>
      </div>
      <DevicesTable initialDevices={devices as never} initialTotal={total} />
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run src/test/devices-table.test.tsx
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/devices/ src/test/devices-table.test.tsx
git commit -m "feat: add Devices page with filterable inventory table, unassigned detection"
```

---

## Task 10: Apply UI Components to Alerts Page

**Files:**
- Modify: `src/app/(app)/alerts/AlertsTable.tsx`

The existing AlertsTable uses inline string classes for platform and severity pills. Replace the platform display with `<PlatformPill>` and device status with `<StatusDot>`.

- [ ] **Step 1: Update AlertsTable to use PlatformPill**

In `src/app/(app)/alerts/AlertsTable.tsx`, add imports:

```typescript
import { PlatformPill } from "@/app/components/ui/PlatformPill";
```

Find where `platform` is rendered as text or an ad-hoc pill and replace with:

```tsx
<PlatformPill platform={alert.platform} />
```

- [ ] **Step 2: Run full test suite to confirm no regressions**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run
```
Expected: PASS — all existing tests still green

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/alerts/AlertsTable.tsx
git commit -m "refactor: use PlatformPill component in AlertsTable"
```

---

## Task 11: Seed Data — Rooms and Devices

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Read current seed file**

Read `prisma/seed.ts` to understand existing seed structure before modifying.

- [ ] **Step 2: Add rooms and devices to seed**

After existing Customer/Site seed data, add:

```typescript
// After site creation — add rooms
const confA = await prisma.room.upsert({
  where: { id: "seed-room-conf-a" },
  update: {},
  create: {
    id: "seed-room-conf-a",
    siteId: hqSite.id, // use the seeded site id
    name: "Conference Room A",
  },
});

const boardRoom = await prisma.room.upsert({
  where: { id: "seed-room-board" },
  update: {},
  create: {
    id: "seed-room-board",
    siteId: hqSite.id,
    name: "Board Room",
  },
});

// Add devices
await prisma.device.upsert({
  where: { platform_platformId: { platform: "POLY_LENS", platformId: "seed-poly-001" } },
  update: {},
  create: {
    platformId: "seed-poly-001",
    platform: "POLY_LENS",
    name: "Studio X30 (Conf A)",
    model: "Poly Studio X30",
    status: "online",
    macAddress: "aa:bb:cc:11:22:33",
    lastSeenAt: new Date(),
    roomId: confA.id,
    rawPayload: { id: "seed-poly-001", name: "Studio X30", connected: true, hardwareModel: "Poly Studio X30", room: { id: "ext-room-1", name: "Conference Room A" } },
  },
});

await prisma.device.upsert({
  where: { platform_platformId: { platform: "YEALINK_YMCS", platformId: "seed-ymcs-001" } },
  update: {},
  create: {
    platformId: "seed-ymcs-001",
    platform: "YEALINK_YMCS",
    name: "T57W-ConfA",
    model: "Yealink T57W",
    status: "online",
    macAddress: "dd:ee:ff:44:55:66",
    lastSeenAt: new Date(),
    roomId: confA.id,
    rawPayload: { deviceSN: "seed-ymcs-001", deviceName: "T57W-ConfA", onlineStatus: "online" },
  },
});

// Unassigned device with vendor room name (for suggestion testing)
await prisma.device.upsert({
  where: { platform_platformId: { platform: "POLY_LENS", platformId: "seed-poly-002" } },
  update: {},
  create: {
    platformId: "seed-poly-002",
    platform: "POLY_LENS",
    name: "EaglEye IV",
    model: "Poly EaglEye IV",
    status: "offline",
    macAddress: "77:88:99:aa:bb:cc",
    lastSeenAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    roomId: null, // unassigned — should suggest "Board Room"
    rawPayload: { id: "seed-poly-002", name: "EaglEye IV", connected: false, hardwareModel: "Poly EaglEye IV", room: { id: "ext-room-2", name: "Board Room" } },
  },
});
```

> **Note:** Replace `hqSite.id` with the actual variable referencing the seeded HQ site. Read the existing seed file before editing to find the correct variable name.

- [ ] **Step 3: Run seed**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx prisma db seed
```
Expected: Seed completes without errors

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore: add rooms and devices seed data for development"
```

---

## Task 12: Run Full Test Suite + Lint

- [ ] **Step 1: Run all tests**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npx vitest run
```
Expected: All tests pass (no failures)

- [ ] **Step 2: Run lint**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npm run lint
```
Expected: No errors (warnings acceptable)

- [ ] **Step 3: Run build**

```bash
cd /Users/alexzawadzki/Documents/GitHub/av-vnoc && npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Final commit if any lint fixes needed**

```bash
git add -A
git commit -m "fix: address lint warnings from rooms/devices implementation"
```

---

## Verification Checklist

After all tasks complete, verify these flows manually by running `npm run dev` and visiting `http://localhost:3001`:

- [ ] `/rooms` — page loads, tree shows customers/sites/rooms
- [ ] Clicking a room — detail panel shows device table and stat cards
- [ ] "+ Add room" in tree — modal creates room, tree refreshes
- [ ] "+ Assign Device" — modal shows unassigned devices, adding one updates the table
- [ ] "Unassign" button on device row — removes device from room
- [ ] Suggestion banner — appears when an unassigned device's vendor room name matches
- [ ] `/devices` — loads all devices with platform pills and status dots
- [ ] Platform filter — filters table correctly
- [ ] "Unassigned only" toggle — shows only unassigned devices
- [ ] `/alerts` — platform column uses PlatformPill (no visual regressions)
