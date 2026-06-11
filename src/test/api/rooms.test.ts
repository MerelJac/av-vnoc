import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST } from "@/app/api/rooms/route";
import { GET as GETRoom, PUT, DELETE } from "@/app/api/rooms/[id]/route";
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
vi.mock("@/lib/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenancy")>()),
  getAccessibleCustomerIds: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds } from "@/lib/tenancy";

const mockSession = vi.mocked(getServerSession);
const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);
const mockDeviceFindMany = vi.mocked(prisma.device.findMany);
const mockRoomCreate = vi.mocked(prisma.room.create);
const mockRoomFindUnique = vi.mocked(prisma.room.findUnique);
const mockRoomUpdate = vi.mocked(prisma.room.update);
const mockRoomDelete = vi.mocked(prisma.room.delete);
const mockAccessibleIds = vi.mocked(getAccessibleCustomerIds);

beforeEach(() => {
  vi.resetAllMocks();
  mockAccessibleIds.mockResolvedValue(null);
});

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

  it("scopes the customer tree for a TIER1 user with customer assignments", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-1", isSuperAdmin: false, vnocRole: "TIER1" },
    } as never);
    mockAccessibleIds.mockResolvedValue(["c1", "c2"]);
    mockCustomerFindMany.mockResolvedValueOnce([] as never);

    await GET(new NextRequest("http://localhost/api/rooms"));

    expect(mockAccessibleIds).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tech-1", vnocRole: "TIER1" })
    );
    const findArgs = mockCustomerFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toEqual({ id: { in: ["c1", "c2"] } });
  });

  it("does not scope super-admin/MANAGER sessions (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "admin-1", isSuperAdmin: true, vnocRole: null },
    } as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockCustomerFindMany.mockResolvedValueOnce([] as never);

    await GET(new NextRequest("http://localhost/api/rooms"));

    const findArgs = mockCustomerFindMany.mock.calls[0][0] as { where?: Record<string, unknown> };
    expect(findArgs.where ?? {}).toEqual({});
  });

  it("does not scope a TIER1 user with zero assignments (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-2", isSuperAdmin: false, vnocRole: "TIER1" },
    } as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockCustomerFindMany.mockResolvedValueOnce([] as never);

    await GET(new NextRequest("http://localhost/api/rooms"));

    const findArgs = mockCustomerFindMany.mock.calls[0][0] as { where?: Record<string, unknown> };
    expect(findArgs.where ?? {}).toEqual({});
  });
});

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
    expect(body.data.suggestions).toHaveLength(1);
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
