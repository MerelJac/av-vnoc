# Customer & Site Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `/customers` page with a tree-style surface that supports full CRUD on customers and their sites, with Zod-validated APIs, role-gated writes, audit logging, and cascade-aware delete confirmation.

**Architecture:** Mirror the existing `rooms/` feature. A server component fetches the customer→site tree (with per-site room counts) and hands it to a client tree component. Modals perform writes against new REST routes (`/api/customers`, `/api/sites`) that return the standard `{ success, data }` / `{ error }` envelope. Delete routes compute cascade impact counts and write `ActivityLog` entries.

**Tech Stack:** Next.js 15 App Router, React 19, Prisma 7 (PostgreSQL), NextAuth v4 (JWT), Zod 4, Tailwind v4, Vitest (unit), Playwright (E2E).

**Spec:** `docs/superpowers/specs/2026-06-01-customer-site-management-design.md`

---

## File Structure

**Create:**
- `src/lib/vnoc-access.ts` — `canManageCustomers(session)` role helper (DRY across routes).
- `src/lib/customer-site-schemas.ts` — Zod schemas for customer/site create/update.
- `src/app/api/customers/route.ts` — `GET` (list), `POST` (create).
- `src/app/api/customers/[id]/route.ts` — `GET` (impact counts), `PATCH` (rename), `DELETE`.
- `src/app/api/sites/route.ts` — `POST` (create).
- `src/app/api/sites/[id]/route.ts` — `GET` (impact counts), `PATCH` (edit), `DELETE`.
- `src/app/(app)/customers/types.ts` — client types.
- `src/app/(app)/customers/CustomersClient.tsx` — state container.
- `src/app/(app)/customers/CustomersTree.tsx` — expandable Customer→Site tree.
- `src/app/(app)/customers/CustomerModal.tsx` — add/edit customer.
- `src/app/(app)/customers/SiteModal.tsx` — add/edit site.
- `src/app/(app)/customers/ConfirmDeleteModal.tsx` — cascade-aware delete confirm.
- `src/test/customer-site-schemas.test.ts` — schema unit tests.
- `src/test/api/customers.test.ts` — customers route tests.
- `src/test/api/sites.test.ts` — sites route tests.
- `tests/e2e/customer-site-management.spec.ts` — E2E flow (path per existing Playwright config; if none exists, create `playwright.config.ts` per Task 11).

**Modify:**
- `src/app/(app)/customers/page.tsx` — replace placeholder with server fetch + `CustomersClient`.

---

## Task 1: Role-access helper

**Files:**
- Create: `src/lib/vnoc-access.ts`
- Test: `src/test/vnoc-access.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/vnoc-access.test.ts
import { describe, it, expect } from "vitest";
import { canManageCustomers } from "@/lib/vnoc-access";

describe("canManageCustomers", () => {
  it("allows super admins", () => {
    expect(canManageCustomers({ user: { isSuperAdmin: true, vnocRole: null } } as never)).toBe(true);
  });
  it("allows MANAGER and TIER2", () => {
    expect(canManageCustomers({ user: { isSuperAdmin: false, vnocRole: "MANAGER" } } as never)).toBe(true);
    expect(canManageCustomers({ user: { isSuperAdmin: false, vnocRole: "TIER2" } } as never)).toBe(true);
  });
  it("denies TIER1 and null session", () => {
    expect(canManageCustomers({ user: { isSuperAdmin: false, vnocRole: "TIER1" } } as never)).toBe(false);
    expect(canManageCustomers(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/vnoc-access.test.ts`
Expected: FAIL — `Cannot find module '@/lib/vnoc-access'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/vnoc-access.ts
import type { Session } from "next-auth";

/** Customers & sites can be managed by super admins, MANAGER, or TIER2. */
export function canManageCustomers(session: Session | null): boolean {
  if (!session?.user) return false;
  const { isSuperAdmin, vnocRole } = session.user;
  return Boolean(isSuperAdmin) || vnocRole === "MANAGER" || vnocRole === "TIER2";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/vnoc-access.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/vnoc-access.ts src/test/vnoc-access.test.ts
git commit -m "feat: add canManageCustomers access helper"
```

---

## Task 2: Zod schemas

**Files:**
- Create: `src/lib/customer-site-schemas.ts`
- Test: `src/test/customer-site-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/customer-site-schemas.test.ts
import { describe, it, expect } from "vitest";
import {
  customerCreateSchema,
  customerUpdateSchema,
  siteCreateSchema,
  siteUpdateSchema,
} from "@/lib/customer-site-schemas";

describe("customer schemas", () => {
  it("accepts a trimmed name", () => {
    expect(customerCreateSchema.parse({ name: "  Acme  " })).toEqual({ name: "Acme" });
  });
  it("rejects empty name", () => {
    expect(customerCreateSchema.safeParse({ name: "   " }).success).toBe(false);
  });
  it("rejects name over 120 chars", () => {
    expect(customerCreateSchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
  });
  it("update mirrors create", () => {
    expect(customerUpdateSchema.parse({ name: "New" })).toEqual({ name: "New" });
  });
});

describe("site schemas", () => {
  const validUuid = "11111111-1111-1111-1111-111111111111";
  it("accepts full payload", () => {
    const parsed = siteCreateSchema.parse({
      customerId: validUuid, name: "HQ", address: "1 St", city: "NYC", state: "NY", lat: 40.7, lng: -74,
    });
    expect(parsed.name).toBe("HQ");
    expect(parsed.lat).toBe(40.7);
  });
  it("accepts name-only payload", () => {
    expect(siteCreateSchema.safeParse({ customerId: validUuid, name: "HQ" }).success).toBe(true);
  });
  it("rejects non-uuid customerId", () => {
    expect(siteCreateSchema.safeParse({ customerId: "nope", name: "HQ" }).success).toBe(false);
  });
  it("update requires at least one field", () => {
    expect(siteUpdateSchema.safeParse({}).success).toBe(false);
    expect(siteUpdateSchema.safeParse({ city: "LA" }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/customer-site-schemas.test.ts`
Expected: FAIL — `Cannot find module '@/lib/customer-site-schemas'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/customer-site-schemas.ts
import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(120, "Name is too long");
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const customerCreateSchema = z.object({ name });
export const customerUpdateSchema = z.object({ name });

export const siteCreateSchema = z.object({
  customerId: z.string().uuid("Invalid customer id"),
  name,
  address: optionalText(200),
  city: optionalText(120),
  state: optionalText(120),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const siteUpdateSchema = z
  .object({
    name: name.optional(),
    address: optionalText(200),
    city: optionalText(120),
    state: optionalText(120),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field is required" });

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/customer-site-schemas.test.ts`
Expected: PASS (all assertions).

> Note: Zod 4 keeps `.uuid()`; if a deprecation warning appears, it is non-blocking.

- [ ] **Step 5: Commit**

```bash
git add src/lib/customer-site-schemas.ts src/test/customer-site-schemas.test.ts
git commit -m "feat: add customer/site validation schemas"
```

---

## Task 3: `/api/customers` route (GET + POST)

**Files:**
- Create: `src/app/api/customers/route.ts`
- Test: `src/test/api/customers.test.ts` (GET + POST sections; `[id]` sections added in Task 4)

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/api/customers.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/customers/route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    site: { count: vi.fn() },
    room: { count: vi.fn() },
    device: { count: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.customer.findMany);
const mockCreate = vi.mocked(prisma.customer.create);
const mockLog = vi.mocked(prisma.activityLog.create);

const manager = { user: { id: "u1", isSuperAdmin: false, vnocRole: "MANAGER" } };
const tier1 = { user: { id: "u2", isSuperAdmin: false, vnocRole: "TIER1" } };

beforeEach(() => vi.resetAllMocks());

describe("GET /api/customers", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/customers"));
    expect(res.status).toBe(401);
  });

  it("returns customers with sites and roomCount", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "c1", name: "Acme",
        sites: [
          { id: "s1", name: "HQ", address: "1 St", city: "NYC", state: "NY", lat: null, lng: null, _count: { rooms: 4 } },
        ],
      },
    ] as never);
    const res = await GET(new NextRequest("http://localhost/api/customers"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].name).toBe("Acme");
    expect(body.data[0].sites[0]).toMatchObject({ id: "s1", name: "HQ", city: "NYC", roomCount: 4 });
  });
});

describe("POST /api/customers", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/customers", { method: "POST", body: JSON.stringify({ name: "X" }) });
    expect((await POST(req)).status).toBe(401);
  });

  it("returns 403 for TIER1", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const req = new NextRequest("http://localhost/api/customers", { method: "POST", body: JSON.stringify({ name: "X" }) });
    expect((await POST(req)).status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    const req = new NextRequest("http://localhost/api/customers", { method: "POST", body: JSON.stringify({ name: "   " }) });
    expect((await POST(req)).status).toBe(400);
  });

  it("creates a customer and writes an audit log", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockCreate.mockResolvedValueOnce({ id: "c-new", name: "Acme" } as never);
    const req = new NextRequest("http://localhost/api/customers", { method: "POST", body: JSON.stringify({ name: "Acme" }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.name).toBe("Acme");
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "customer_created", userId: "u1" }),
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api/customers.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/customers/route'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/customers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { customerCreateSchema } from "@/lib/customer-site-schemas";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, address: true, city: true, state: true,
          lat: true, lng: true, _count: { select: { rooms: true } },
        },
      },
    },
  });

  const data = customers.map((c) => ({
    id: c.id,
    name: c.name,
    sites: c.sites.map((s) => ({
      id: s.id, name: s.name, address: s.address, city: s.city,
      state: s.state, lat: s.lat, lng: s.lng, roomCount: s._count.rooms,
    })),
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = customerCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.create({ data: { name: parsed.data.name } });
    await prisma.activityLog.create({
      data: { type: "customer_created", userId: session.user.id, message: `Customer "${customer.name}" created`, meta: { customerId: customer.id } },
    });
    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (err) {
    console.error("Failed to create customer:", err);
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/api/customers.test.ts`
Expected: PASS (GET + POST describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/customers/route.ts src/test/api/customers.test.ts
git commit -m "feat: add GET/POST /api/customers"
```

---

## Task 4: `/api/customers/[id]` route (GET impact + PATCH + DELETE)

**Files:**
- Create: `src/app/api/customers/[id]/route.ts`
- Modify: `src/test/api/customers.test.ts` (append `[id]` sections)

- [ ] **Step 1: Write the failing test (append to `src/test/api/customers.test.ts`)**

Add this import near the top, beside the existing route import:

```typescript
import { GET as GETOne, PATCH, DELETE } from "@/app/api/customers/[id]/route";
```

Add these mock handles below the existing ones:

```typescript
const mockFindUnique = vi.mocked(prisma.customer.findUnique);
const mockUpdate = vi.mocked(prisma.customer.update);
const mockDelete = vi.mocked(prisma.customer.delete);
const mockSiteCount = vi.mocked(prisma.site.count);
const mockRoomCount = vi.mocked(prisma.room.count);
const mockDeviceCount = vi.mocked(prisma.device.count);
const ctx = { params: Promise.resolve({ id: "c1" }) };
```

Add these describe blocks at the end of the file:

```typescript
describe("GET /api/customers/[id] (impact)", () => {
  it("returns cascade impact counts", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindUnique.mockResolvedValueOnce({ id: "c1", name: "Acme" } as never);
    mockSiteCount.mockResolvedValueOnce(3);
    mockRoomCount.mockResolvedValueOnce(12);
    mockDeviceCount.mockResolvedValueOnce(40);
    const res = await GETOne(new NextRequest("http://localhost/api/customers/c1"), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.impact).toEqual({ sites: 3, rooms: 12, devices: 40 });
  });

  it("returns 404 when missing", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await GETOne(new NextRequest("http://localhost/api/customers/c1"), ctx);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/customers/[id]", () => {
  it("returns 403 for TIER1", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const req = new NextRequest("http://localhost/api/customers/c1", { method: "PATCH", body: JSON.stringify({ name: "New" }) });
    expect((await PATCH(req, ctx)).status).toBe(403);
  });

  it("renames a customer and logs it", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockUpdate.mockResolvedValueOnce({ id: "c1", name: "New" } as never);
    const req = new NextRequest("http://localhost/api/customers/c1", { method: "PATCH", body: JSON.stringify({ name: "New" }) });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(200);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "customer_updated" }),
    }));
  });

  it("returns 404 when prisma throws P2025", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockUpdate.mockRejectedValueOnce({ code: "P2025" });
    const req = new NextRequest("http://localhost/api/customers/c1", { method: "PATCH", body: JSON.stringify({ name: "New" }) });
    expect((await PATCH(req, ctx)).status).toBe(404);
  });
});

describe("DELETE /api/customers/[id]", () => {
  it("returns 403 for TIER1", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    expect((await DELETE(new NextRequest("http://localhost/api/customers/c1", { method: "DELETE" }), ctx)).status).toBe(403);
  });

  it("deletes with cascade counts in the audit log", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockFindUnique.mockResolvedValueOnce({ id: "c1", name: "Acme" } as never);
    mockSiteCount.mockResolvedValueOnce(3);
    mockRoomCount.mockResolvedValueOnce(12);
    mockDeviceCount.mockResolvedValueOnce(40);
    mockDelete.mockResolvedValueOnce({ id: "c1" } as never);
    const res = await DELETE(new NextRequest("http://localhost/api/customers/c1", { method: "DELETE" }), ctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.impact).toEqual({ sites: 3, rooms: 12, devices: 40 });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "customer_deleted", meta: expect.objectContaining({ counts: { sites: 3, rooms: 12, devices: 40 } }) }),
    }));
  });

  it("returns 404 when customer missing", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockFindUnique.mockResolvedValueOnce(null);
    expect((await DELETE(new NextRequest("http://localhost/api/customers/c1", { method: "DELETE" }), ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api/customers.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/customers/[id]/route'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/customers/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { customerUpdateSchema } from "@/lib/customer-site-schemas";

type RouteContext = { params: Promise<{ id: string }> };

async function customerImpact(customerId: string) {
  const [sites, rooms, devices] = await Promise.all([
    prisma.site.count({ where: { customerId } }),
    prisma.room.count({ where: { site: { customerId } } }),
    prisma.device.count({ where: { room: { site: { customerId } } } }),
  ]);
  return { sites, rooms, devices };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await customerImpact(id);
  return NextResponse.json({ success: true, data: { ...customer, impact } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = customerUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const customer = await prisma.customer.update({ where: { id }, data: { name: parsed.data.name } });
    await prisma.activityLog.create({
      data: { type: "customer_updated", userId: session.user.id, message: `Customer renamed to "${customer.name}"`, meta: { customerId: customer.id } },
    });
    return NextResponse.json({ success: true, data: customer });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Failed to update customer:", err);
    return NextResponse.json({ error: "Failed to update customer" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!customer) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await customerImpact(id);

  try {
    await prisma.customer.delete({ where: { id } });
    await prisma.activityLog.create({
      data: {
        type: "customer_deleted",
        userId: session.user.id,
        message: `Customer "${customer.name}" deleted (${impact.sites} sites, ${impact.rooms} rooms, ${impact.devices} devices)`,
        meta: { customerId: id, counts: impact },
      },
    });
    return NextResponse.json({ success: true, data: { impact } });
  } catch (err) {
    console.error("Failed to delete customer:", err);
    return NextResponse.json({ error: "Failed to delete customer" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/api/customers.test.ts`
Expected: PASS (all describe blocks, including `[id]`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/customers/[id]/route.ts" src/test/api/customers.test.ts
git commit -m "feat: add GET/PATCH/DELETE /api/customers/[id] with cascade impact + audit"
```

---

## Task 5: `/api/sites` route (POST)

**Files:**
- Create: `src/app/api/sites/route.ts`
- Test: `src/test/api/sites.test.ts` (POST section; `[id]` sections added in Task 6)

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/api/sites.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/sites/route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    site: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    customer: { findUnique: vi.fn() },
    room: { count: vi.fn() },
    device: { count: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockSiteCreate = vi.mocked(prisma.site.create);
const mockCustomerFindUnique = vi.mocked(prisma.customer.findUnique);
const mockLog = vi.mocked(prisma.activityLog.create);

const manager = { user: { id: "u1", isSuperAdmin: false, vnocRole: "MANAGER" } };
const tier1 = { user: { id: "u2", isSuperAdmin: false, vnocRole: "TIER1" } };
const validUuid = "11111111-1111-1111-1111-111111111111";

beforeEach(() => vi.resetAllMocks());

describe("POST /api/sites", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/sites", { method: "POST", body: JSON.stringify({ customerId: validUuid, name: "HQ" }) });
    expect((await POST(req)).status).toBe(401);
  });

  it("returns 403 for TIER1", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const req = new NextRequest("http://localhost/api/sites", { method: "POST", body: JSON.stringify({ customerId: validUuid, name: "HQ" }) });
    expect((await POST(req)).status).toBe(403);
  });

  it("returns 400 for invalid body", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    const req = new NextRequest("http://localhost/api/sites", { method: "POST", body: JSON.stringify({ customerId: "nope", name: "HQ" }) });
    expect((await POST(req)).status).toBe(400);
  });

  it("returns 404 when customer does not exist", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockCustomerFindUnique.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/sites", { method: "POST", body: JSON.stringify({ customerId: validUuid, name: "HQ" }) });
    expect((await POST(req)).status).toBe(404);
  });

  it("creates a site and logs it", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockCustomerFindUnique.mockResolvedValueOnce({ id: validUuid, name: "Acme" } as never);
    mockSiteCreate.mockResolvedValueOnce({ id: "s-new", name: "HQ", customerId: validUuid } as never);
    const req = new NextRequest("http://localhost/api/sites", { method: "POST", body: JSON.stringify({ customerId: validUuid, name: "HQ", city: "NYC" }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.name).toBe("HQ");
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "site_created" }),
    }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api/sites.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/sites/route'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/sites/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { siteCreateSchema } from "@/lib/customer-site-schemas";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = siteCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId }, select: { id: true, name: true } });
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  try {
    const site = await prisma.site.create({ data: parsed.data });
    await prisma.activityLog.create({
      data: { type: "site_created", userId: session.user.id, message: `Site "${site.name}" added to ${customer.name}`, meta: { siteId: site.id, customerId: customer.id } },
    });
    return NextResponse.json({ success: true, data: site }, { status: 201 });
  } catch (err) {
    console.error("Failed to create site:", err);
    return NextResponse.json({ error: "Failed to create site" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/api/sites.test.ts`
Expected: PASS (POST describe block).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sites/route.ts src/test/api/sites.test.ts
git commit -m "feat: add POST /api/sites"
```

---

## Task 6: `/api/sites/[id]` route (GET impact + PATCH + DELETE)

**Files:**
- Create: `src/app/api/sites/[id]/route.ts`
- Modify: `src/test/api/sites.test.ts` (append `[id]` sections)

- [ ] **Step 1: Write the failing test (append to `src/test/api/sites.test.ts`)**

Add this import beside the existing route import:

```typescript
import { GET as GETOne, PATCH, DELETE } from "@/app/api/sites/[id]/route";
```

Add these mock handles below the existing ones:

```typescript
const mockSiteFindUnique = vi.mocked(prisma.site.findUnique);
const mockSiteUpdate = vi.mocked(prisma.site.update);
const mockSiteDelete = vi.mocked(prisma.site.delete);
const mockRoomCount = vi.mocked(prisma.room.count);
const mockDeviceCount = vi.mocked(prisma.device.count);
const sctx = { params: Promise.resolve({ id: "s1" }) };
```

Add these describe blocks at the end of the file:

```typescript
describe("GET /api/sites/[id] (impact)", () => {
  it("returns site with cascade impact", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockSiteFindUnique.mockResolvedValueOnce({ id: "s1", name: "HQ", customerId: validUuid, address: null, city: "NYC", state: "NY", lat: null, lng: null } as never);
    mockRoomCount.mockResolvedValueOnce(4);
    mockDeviceCount.mockResolvedValueOnce(10);
    const res = await GETOne(new NextRequest("http://localhost/api/sites/s1"), sctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.impact).toEqual({ rooms: 4, devices: 10 });
    expect(body.data.name).toBe("HQ");
  });

  it("returns 404 when missing", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockSiteFindUnique.mockResolvedValueOnce(null);
    expect((await GETOne(new NextRequest("http://localhost/api/sites/s1"), sctx)).status).toBe(404);
  });
});

describe("PATCH /api/sites/[id]", () => {
  it("returns 403 for TIER1", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const req = new NextRequest("http://localhost/api/sites/s1", { method: "PATCH", body: JSON.stringify({ city: "LA" }) });
    expect((await PATCH(req, sctx)).status).toBe(403);
  });

  it("returns 400 when no fields supplied", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    const req = new NextRequest("http://localhost/api/sites/s1", { method: "PATCH", body: JSON.stringify({}) });
    expect((await PATCH(req, sctx)).status).toBe(400);
  });

  it("updates a site and logs it", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockSiteUpdate.mockResolvedValueOnce({ id: "s1", name: "HQ", city: "LA" } as never);
    const req = new NextRequest("http://localhost/api/sites/s1", { method: "PATCH", body: JSON.stringify({ city: "LA" }) });
    const res = await PATCH(req, sctx);
    expect(res.status).toBe(200);
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "site_updated" }) }));
  });

  it("returns 404 on P2025", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockSiteUpdate.mockRejectedValueOnce({ code: "P2025" });
    const req = new NextRequest("http://localhost/api/sites/s1", { method: "PATCH", body: JSON.stringify({ city: "LA" }) });
    expect((await PATCH(req, sctx)).status).toBe(404);
  });
});

describe("DELETE /api/sites/[id]", () => {
  it("returns 403 for TIER1", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    expect((await DELETE(new NextRequest("http://localhost/api/sites/s1", { method: "DELETE" }), sctx)).status).toBe(403);
  });

  it("deletes with cascade counts in the audit log", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockSiteFindUnique.mockResolvedValueOnce({ id: "s1", name: "HQ" } as never);
    mockRoomCount.mockResolvedValueOnce(4);
    mockDeviceCount.mockResolvedValueOnce(10);
    mockSiteDelete.mockResolvedValueOnce({ id: "s1" } as never);
    const res = await DELETE(new NextRequest("http://localhost/api/sites/s1", { method: "DELETE" }), sctx);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.impact).toEqual({ rooms: 4, devices: 10 });
    expect(mockLog).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "site_deleted", meta: expect.objectContaining({ counts: { rooms: 4, devices: 10 } }) }),
    }));
  });

  it("returns 404 when site missing", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockSiteFindUnique.mockResolvedValueOnce(null);
    expect((await DELETE(new NextRequest("http://localhost/api/sites/s1", { method: "DELETE" }), sctx)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api/sites.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/sites/[id]/route'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/sites/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { siteUpdateSchema } from "@/lib/customer-site-schemas";

type RouteContext = { params: Promise<{ id: string }> };

async function siteImpact(siteId: string) {
  const [rooms, devices] = await Promise.all([
    prisma.room.count({ where: { siteId } }),
    prisma.device.count({ where: { room: { siteId } } }),
  ]);
  return { rooms, devices };
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    select: { id: true, name: true, customerId: true, address: true, city: true, state: true, lat: true, lng: true },
  });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await siteImpact(id);
  return NextResponse.json({ success: true, data: { ...site, impact } });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let raw: unknown;
  try { raw = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const parsed = siteUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const site = await prisma.site.update({ where: { id }, data: parsed.data });
    await prisma.activityLog.create({
      data: { type: "site_updated", userId: session.user.id, message: `Site "${site.name}" updated`, meta: { siteId: site.id } },
    });
    return NextResponse.json({ success: true, data: site });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Not found" }, { status: 404 });
    console.error("Failed to update site:", err);
    return NextResponse.json({ error: "Failed to update site" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCustomers(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const impact = await siteImpact(id);

  try {
    await prisma.site.delete({ where: { id } });
    await prisma.activityLog.create({
      data: {
        type: "site_deleted",
        userId: session.user.id,
        message: `Site "${site.name}" deleted (${impact.rooms} rooms, ${impact.devices} devices)`,
        meta: { siteId: id, counts: impact },
      },
    });
    return NextResponse.json({ success: true, data: { impact } });
  } catch (err) {
    console.error("Failed to delete site:", err);
    return NextResponse.json({ error: "Failed to delete site" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/api/sites.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sites/[id]/route.ts" src/test/api/sites.test.ts
git commit -m "feat: add GET/PATCH/DELETE /api/sites/[id] with cascade impact + audit"
```

---

## Task 7: Client types

**Files:**
- Create: `src/app/(app)/customers/types.ts`

- [ ] **Step 1: Write the file**

```typescript
// src/app/(app)/customers/types.ts
export interface SiteNode {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  roomCount: number;
}

export interface CustomerNode {
  id: string;
  name: string;
  sites: SiteNode[];
}

/** Shape returned by GET /api/customers/[id] and /api/sites/[id] before delete. */
export interface CustomerImpact { sites: number; rooms: number; devices: number; }
export interface SiteImpact { rooms: number; devices: number; }
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `customers/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/customers/types.ts"
git commit -m "feat: add customers client types"
```

---

## Task 8: Server page

**Files:**
- Modify: `src/app/(app)/customers/page.tsx`

- [ ] **Step 1: Replace the placeholder page**

```typescript
// src/app/(app)/customers/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { CustomersClient } from "./CustomersClient";
import type { CustomerNode } from "./types";

export default async function CustomersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canManageCustomers(session)) redirect("/dashboard");

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, address: true, city: true, state: true,
          lat: true, lng: true, _count: { select: { rooms: true } },
        },
      },
    },
  });

  const initialCustomers: CustomerNode[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    sites: c.sites.map((s) => ({
      id: s.id, name: s.name, address: s.address, city: s.city,
      state: s.state, lat: s.lat, lng: s.lng, roomCount: s._count.rooms,
    })),
  }));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <CustomersClient initialCustomers={initialCustomers} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors only for not-yet-created `./CustomersClient` (resolved in Task 10).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/customers/page.tsx"
git commit -m "feat: wire customers page to server fetch"
```

> Note: `tsc` will not be clean until Task 10 creates `CustomersClient`. That is expected; commit anyway to keep tasks bite-sized.

---

## Task 9: Modals

**Files:**
- Create: `src/app/(app)/customers/CustomerModal.tsx`
- Create: `src/app/(app)/customers/SiteModal.tsx`
- Create: `src/app/(app)/customers/ConfirmDeleteModal.tsx`

- [ ] **Step 1: Create `CustomerModal.tsx`**

```tsx
// src/app/(app)/customers/CustomerModal.tsx
"use client";
import { useState } from "react";
import type { CustomerNode } from "./types";

interface Props {
  customer?: CustomerNode; // present = edit mode
  onClose: () => void;
  onSaved: () => void;
}

export function CustomerModal({ customer, onClose, onSaved }: Props) {
  const isEdit = Boolean(customer);
  const [name, setName] = useState(customer?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Customer name is required."); return; }
    setLoading(true);
    setError(null);
    const url = isEdit ? `/api/customers/${customer!.id}` : "/api/customers";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    setLoading(false);
    if (json.success) onSaved();
    else setError(json.error ?? "Failed to save customer.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form className="bg-card border border-border rounded-xl p-5 w-[380px] shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-base font-semibold mb-4">{isEdit ? "Rename customer" : "Add customer"}</h2>
        <div className="mb-4">
          <label className="block text-xs text-muted-foreground mb-1">Customer name</label>
          <input
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Acme Corp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" disabled={loading}>
            {loading ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `SiteModal.tsx`**

```tsx
// src/app/(app)/customers/SiteModal.tsx
"use client";
import { useState } from "react";
import type { SiteNode } from "./types";

interface Props {
  customerId: string;
  customerName: string;
  site?: SiteNode; // present = edit mode
  onClose: () => void;
  onSaved: () => void;
}

export function SiteModal({ customerId, customerName, site, onClose, onSaved }: Props) {
  const isEdit = Boolean(site);
  const [form, setForm] = useState({
    name: site?.name ?? "",
    address: site?.address ?? "",
    city: site?.city ?? "",
    state: site?.state ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Site name is required."); return; }
    setLoading(true);
    setError(null);

    const trimmed = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
    };
    const url = isEdit ? `/api/sites/${site!.id}` : "/api/sites";
    const body = isEdit ? trimmed : { customerId, ...trimmed };
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    setLoading(false);
    if (json.success) onSaved();
    else setError(json.error ?? "Failed to save site.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form className="bg-card border border-border rounded-xl p-5 w-[420px] shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-base font-semibold mb-1">{isEdit ? "Edit site" : `Add site to ${customerName}`}</h2>
        <div className="grid grid-cols-1 gap-3 mt-4">
          <Field label="Site name" value={form.name} onChange={set("name")} placeholder="e.g. HQ" autoFocus />
          <Field label="Address" value={form.address} onChange={set("address")} placeholder="123 Main St" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={form.city} onChange={set("city")} placeholder="New York" />
            <Field label="State" value={form.state} onChange={set("state")} placeholder="NY" />
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" disabled={loading}>
            {loading ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" {...props} />
    </div>
  );
}
```

- [ ] **Step 3: Create `ConfirmDeleteModal.tsx`**

```tsx
// src/app/(app)/customers/ConfirmDeleteModal.tsx
"use client";
import { useEffect, useState } from "react";

interface Props {
  title: string;
  /** URL to fetch impact counts (GET) and to delete (DELETE). */
  resourceUrl: string;
  /** Renders the impact summary from the GET payload's `data`. */
  describeImpact: (data: { impact?: Record<string, number> }) => string;
  onClose: () => void;
  onDeleted: () => void;
}

export function ConfirmDeleteModal({ title, resourceUrl, describeImpact, onClose, onDeleted }: Props) {
  const [summary, setSummary] = useState<string>("Loading impact…");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(resourceUrl)
      .then((r) => r.json())
      .then((j) => { if (active && j.success) setSummary(describeImpact(j.data)); })
      .catch(() => { if (active) setSummary("Could not load impact details."); });
    return () => { active = false; };
  }, [resourceUrl, describeImpact]);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    const res = await fetch(resourceUrl, { method: "DELETE" });
    const json = await res.json() as { success?: boolean; error?: string };
    setDeleting(false);
    if (json.success) onDeleted();
    else setError(json.error ?? "Failed to delete.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 w-[400px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-1">This cannot be undone.</p>
        <p className="text-sm text-red-500 mb-4">{summary}</p>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" disabled={deleting} onClick={confirmDelete}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors only for not-yet-created `CustomersTree`/`CustomersClient` (resolved in Task 10).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/customers/CustomerModal.tsx" "src/app/(app)/customers/SiteModal.tsx" "src/app/(app)/customers/ConfirmDeleteModal.tsx"
git commit -m "feat: add customer/site/delete modals"
```

---

## Task 10: Tree + client container

**Files:**
- Create: `src/app/(app)/customers/CustomersTree.tsx`
- Create: `src/app/(app)/customers/CustomersClient.tsx`

- [ ] **Step 1: Create `CustomersTree.tsx`**

```tsx
// src/app/(app)/customers/CustomersTree.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import type { CustomerNode, SiteNode } from "./types";

interface Props {
  customers: CustomerNode[];
  onAddCustomer: () => void;
  onEditCustomer: (c: CustomerNode) => void;
  onDeleteCustomer: (c: CustomerNode) => void;
  onAddSite: (c: CustomerNode) => void;
  onEditSite: (c: CustomerNode, s: SiteNode) => void;
  onDeleteSite: (c: CustomerNode, s: SiteNode) => void;
}

export function CustomersTree(props: Props) {
  const { customers, onAddCustomer } = props;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const filtered = q
    ? customers.filter((c) =>
        c.name.toLowerCase().includes(q) || c.sites.some((s) => s.name.toLowerCase().includes(q)))
    : customers;

  return (
    <div className="flex-1 flex flex-col min-h-0 border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center justify-between gap-2 p-3 border-b border-border shrink-0">
        <input
          className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search customers or sites…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap" onClick={onAddCustomer}>
          + Add customer
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground p-4 text-center">No customers yet.</p>
        )}
        {filtered.map((c) => (
          <CustomerRow key={c.id} customer={c} expanded={expanded.has(c.id)} onToggle={() => toggle(c.id)} {...props} />
        ))}
      </div>
    </div>
  );
}

function CustomerRow({
  customer, expanded, onToggle,
  onEditCustomer, onDeleteCustomer, onAddSite, onEditSite, onDeleteSite,
}: { customer: CustomerNode; expanded: boolean; onToggle: () => void } & Omit<Props, "customers" | "onAddCustomer">) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group">
        <button className="text-muted-foreground w-4" onClick={onToggle} aria-label={expanded ? "Collapse" : "Expand"}>
          {expanded ? "▼" : "▶"}
        </button>
        <span className="flex-1 text-sm font-medium truncate">{customer.name}</span>
        <span className="text-xs text-muted-foreground">{customer.sites.length} {customer.sites.length === 1 ? "site" : "sites"}</span>
        <RowActions
          onAdd={() => onAddSite(customer)}
          onEdit={() => onEditCustomer(customer)}
          onDelete={() => onDeleteCustomer(customer)}
          addLabel="Add site"
        />
      </div>
      {expanded && (
        <div className="ml-6 border-l border-border pl-2">
          {customer.sites.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-1.5">No sites yet.</p>
          )}
          {customer.sites.map((s) => (
            <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group">
              <span className="flex-1 text-sm truncate">
                {s.name}
                {(s.city || s.state) && <span className="text-xs text-muted-foreground ml-2">{[s.city, s.state].filter(Boolean).join(", ")}</span>}
              </span>
              <Link href={`/rooms?site=${s.id}`} className="text-xs text-muted-foreground hover:text-foreground">
                {s.roomCount} {s.roomCount === 1 ? "room" : "rooms"}
              </Link>
              <RowActions onEdit={() => onEditSite(customer, s)} onDelete={() => onDeleteSite(customer, s)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RowActions({ onAdd, onEdit, onDelete, addLabel }: { onAdd?: () => void; onEdit: () => void; onDelete: () => void; addLabel?: string }) {
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      {onAdd && (
        <button className="text-xs text-muted-foreground hover:text-foreground px-1" onClick={onAdd} title={addLabel}>＋</button>
      )}
      <button className="text-xs text-muted-foreground hover:text-foreground px-1" onClick={onEdit} title="Edit">✎</button>
      <button className="text-xs text-muted-foreground hover:text-red-500 px-1" onClick={onDelete} title="Delete">🗑</button>
    </div>
  );
}
```

- [ ] **Step 2: Create `CustomersClient.tsx`**

```tsx
// src/app/(app)/customers/CustomersClient.tsx
"use client";
import { useState, useCallback } from "react";
import { CustomersTree } from "./CustomersTree";
import { CustomerModal } from "./CustomerModal";
import { SiteModal } from "./SiteModal";
import { ConfirmDeleteModal } from "./ConfirmDeleteModal";
import type { CustomerNode, SiteNode } from "./types";

interface Props { initialCustomers: CustomerNode[]; }

type Modal =
  | { kind: "add-customer" }
  | { kind: "edit-customer"; customer: CustomerNode }
  | { kind: "add-site"; customer: CustomerNode }
  | { kind: "edit-site"; customer: CustomerNode; site: SiteNode }
  | { kind: "delete-customer"; customer: CustomerNode }
  | { kind: "delete-site"; site: SiteNode }
  | null;

export function CustomersClient({ initialCustomers }: Props) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [modal, setModal] = useState<Modal>(null);

  const refresh = useCallback(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((j) => { if (j.success) setCustomers(j.data); });
  }, []);

  const close = () => setModal(null);
  const afterWrite = () => { close(); refresh(); };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-foreground">Customers</h1>
      </div>

      <CustomersTree
        customers={customers}
        onAddCustomer={() => setModal({ kind: "add-customer" })}
        onEditCustomer={(customer) => setModal({ kind: "edit-customer", customer })}
        onDeleteCustomer={(customer) => setModal({ kind: "delete-customer", customer })}
        onAddSite={(customer) => setModal({ kind: "add-site", customer })}
        onEditSite={(customer, site) => setModal({ kind: "edit-site", customer, site })}
        onDeleteSite={(_customer, site) => setModal({ kind: "delete-site", site })}
      />

      {modal?.kind === "add-customer" && <CustomerModal onClose={close} onSaved={afterWrite} />}
      {modal?.kind === "edit-customer" && <CustomerModal customer={modal.customer} onClose={close} onSaved={afterWrite} />}
      {modal?.kind === "add-site" && (
        <SiteModal customerId={modal.customer.id} customerName={modal.customer.name} onClose={close} onSaved={afterWrite} />
      )}
      {modal?.kind === "edit-site" && (
        <SiteModal customerId={modal.customer.id} customerName={modal.customer.name} site={modal.site} onClose={close} onSaved={afterWrite} />
      )}
      {modal?.kind === "delete-customer" && (
        <ConfirmDeleteModal
          title={`Delete "${modal.customer.name}"?`}
          resourceUrl={`/api/customers/${modal.customer.id}`}
          describeImpact={(d) => {
            const i = d.impact ?? { sites: 0, rooms: 0, devices: 0 };
            return `Removes ${i.sites} sites, ${i.rooms} rooms, and ${i.devices} devices.`;
          }}
          onClose={close}
          onDeleted={afterWrite}
        />
      )}
      {modal?.kind === "delete-site" && (
        <ConfirmDeleteModal
          title={`Delete "${modal.site.name}"?`}
          resourceUrl={`/api/sites/${modal.site.id}`}
          describeImpact={(d) => {
            const i = d.impact ?? { rooms: 0, devices: 0 };
            return `Removes ${i.rooms} rooms and ${i.devices} devices.`;
          }}
          onClose={close}
          onDeleted={afterWrite}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify the whole project compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify all unit tests still pass**

Run: `npx vitest run`
Expected: PASS, including the new schema/route/access tests.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/customers/CustomersTree.tsx" "src/app/(app)/customers/CustomersClient.tsx"
git commit -m "feat: add customers tree + client container"
```

---

## Task 11: E2E flow

**Files:**
- Create: `tests/e2e/customer-site-management.spec.ts`

> First check whether Playwright + a config already exist: `ls playwright.config.* 2>/dev/null` and `npx playwright --version`. If neither exists, install and scaffold:
> `npm i -D @playwright/test && npx playwright install chromium`, then create a minimal `playwright.config.ts` with `use: { baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000" }` and `testDir: "tests/e2e"`. Reuse the project's existing seeded login (`INVITE_PASS`) credentials.

- [ ] **Step 1: Write the E2E spec**

```typescript
// tests/e2e/customer-site-management.spec.ts
import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "admin@example.com";
const PASSWORD = process.env.E2E_PASSWORD ?? process.env.INVITE_PASS ?? "";

async function login(page) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard|\/customers|\//);
}

test("create, edit, and delete a customer and site", async ({ page }) => {
  const stamp = Date.now();
  const customerName = `E2E Customer ${stamp}`;
  const siteName = `E2E Site ${stamp}`;

  await login(page);
  await page.goto("/customers");

  // Add customer
  await page.getByRole("button", { name: /add customer/i }).click();
  await page.getByPlaceholder(/Acme Corp/i).fill(customerName);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(customerName)).toBeVisible();

  // Expand + add site
  await page.getByText(customerName).locator("..").getByRole("button", { name: /expand/i }).click();
  await page.getByTitle("Add site").click();
  await page.getByPlaceholder(/^HQ$/i).fill(siteName);
  await page.getByPlaceholder(/New York/i).fill("Chicago");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(siteName)).toBeVisible();

  // Edit site city
  await page.getByText(siteName).locator("..").getByTitle("Edit").click();
  await page.getByPlaceholder(/New York/i).fill("Boston");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/Boston/)).toBeVisible();

  // Delete site (confirm)
  await page.getByText(siteName).locator("..").getByTitle("Delete").click();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(siteName)).toHaveCount(0);

  // Delete customer (confirm with cascade warning)
  await page.getByText(customerName).locator("..").getByTitle("Delete").click();
  await expect(page.getByText(/Removes .* sites/i)).toBeVisible();
  await page.getByRole("button", { name: /^delete$/i }).click();
  await expect(page.getByText(customerName)).toHaveCount(0);
});
```

- [ ] **Step 2: Run the dev server, then the E2E spec**

Run (in one terminal): `npm run dev`
Run (in another): `npx playwright test tests/e2e/customer-site-management.spec.ts`
Expected: PASS. If selectors need tuning for the actual login form, adjust to match `src/app/(auth)/login`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/customer-site-management.spec.ts playwright.config.ts package.json package-lock.json
git commit -m "test: add customer & site management E2E flow"
```

---

## Task 12: Lint + full verification

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no errors in new files. Fix any reported issues.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Full unit suite + coverage**

Run: `npx vitest run --coverage`
Expected: PASS; new files (`vnoc-access`, `customer-site-schemas`, both route groups) at 80%+.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds (Prisma generate + Next build).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint + verification fixes for customer/site management"
```

---

## Self-Review Notes

- **Spec coverage:** No-schema-change ✓ (Tasks use existing models). Full CRUD ✓ (Tasks 3–6). Role gate ✓ (Task 1 + write guards). Audit logging ✓ (all write handlers). `roomCount` rollup ✓ (Tasks 3, 8). Cascade-aware delete confirm ✓ (Tasks 4, 6, 9 `ConfirmDeleteModal`). Tree UI like Rooms ✓ (Task 10). Unit + E2E ✓ (Tasks 1–6, 11). Error handling (Zod 400, 401/403/404, 500, friendly client messages) ✓.
- **Type consistency:** `CustomerNode`/`SiteNode` defined in Task 7 are used consistently in Tasks 8–10. `impact` shapes (`{sites,rooms,devices}` / `{rooms,devices}`) match between routes (Tasks 4, 6) and `describeImpact` consumers (Task 10). Method names: `canManageCustomers`, schema exports, and route exports (`GET/POST/GETOne/PATCH/DELETE`) align across tasks.
- **Decision:** Routes use `PATCH` (per spec) rather than the `PUT` used by the older rooms route; this is intentional and isolated to the new endpoints.
- **Known seams to confirm at execution:** Rooms page `?site=` query param is a navigation convenience; if the Rooms page does not yet read it, the link still loads the Rooms page (non-blocking). E2E login selectors may need tuning to the real login form.
