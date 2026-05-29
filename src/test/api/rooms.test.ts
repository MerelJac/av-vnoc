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
