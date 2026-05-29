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
