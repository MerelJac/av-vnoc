import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/sites/route";
import { GET as GETOne, PATCH, DELETE } from "@/app/api/sites/[id]/route";
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
const mockSiteFindUnique = vi.mocked(prisma.site.findUnique);
const mockSiteUpdate = vi.mocked(prisma.site.update);
const mockSiteDelete = vi.mocked(prisma.site.delete);
const mockRoomCount = vi.mocked(prisma.room.count);
const mockDeviceCount = vi.mocked(prisma.device.count);
const sctx = { params: Promise.resolve({ id: "s1" }) };

const manager = { user: { id: "u1", isSuperAdmin: false, vnocRole: "MANAGER" } };
const tier1 = { user: { id: "u2", isSuperAdmin: false, vnocRole: "TIER1" } };
const validUuid = "11111111-1111-4111-8111-111111111111";

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
