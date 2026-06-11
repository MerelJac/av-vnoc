import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/customers/route";
import { GET as GETOne, PATCH, DELETE } from "@/app/api/customers/[id]/route";
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
vi.mock("@/lib/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenancy")>()),
  getAccessibleCustomerIds: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds } from "@/lib/tenancy";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.customer.findMany);
const mockCreate = vi.mocked(prisma.customer.create);
const mockLog = vi.mocked(prisma.activityLog.create);
const mockFindUnique = vi.mocked(prisma.customer.findUnique);
const mockUpdate = vi.mocked(prisma.customer.update);
const mockDelete = vi.mocked(prisma.customer.delete);
const mockSiteCount = vi.mocked(prisma.site.count);
const mockRoomCount = vi.mocked(prisma.room.count);
const mockDeviceCount = vi.mocked(prisma.device.count);
const ctx = { params: Promise.resolve({ id: "c1" }) };

const manager = { user: { id: "u1", isSuperAdmin: false, vnocRole: "MANAGER" } };
const tier1 = { user: { id: "u2", isSuperAdmin: false, vnocRole: "TIER1" } };
const mockAccessibleIds = vi.mocked(getAccessibleCustomerIds);

beforeEach(() => {
  vi.resetAllMocks();
  mockAccessibleIds.mockResolvedValue(null);
});

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

  it("scopes the list for a TIER1 user with customer assignments", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    mockAccessibleIds.mockResolvedValue(["c1", "c2"]);
    mockFindMany.mockResolvedValueOnce([] as never);

    await GET(new NextRequest("http://localhost/api/customers"));

    expect(mockAccessibleIds).toHaveBeenCalledWith(
      expect.objectContaining({ id: "u2", vnocRole: "TIER1" })
    );
    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toEqual({ id: { in: ["c1", "c2"] } });
  });

  it("does not scope super-admin/MANAGER sessions (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([] as never);

    await GET(new NextRequest("http://localhost/api/customers"));

    const findArgs = mockFindMany.mock.calls[0][0] as { where?: Record<string, unknown> };
    expect(findArgs.where ?? {}).toEqual({});
  });

  it("does not scope a TIER1 user with zero assignments (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([] as never);

    await GET(new NextRequest("http://localhost/api/customers"));

    const findArgs = mockFindMany.mock.calls[0][0] as { where?: Record<string, unknown> };
    expect(findArgs.where ?? {}).toEqual({});
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
