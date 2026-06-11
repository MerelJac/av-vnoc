import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    alert: { findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenancy")>()),
  getAccessibleCustomerIds: vi.fn(),
}));

import { GET } from "@/app/api/alerts/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds } from "@/lib/tenancy";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.alert.findMany);
const mockCount = vi.mocked(prisma.alert.count);
const mockAccessibleIds = vi.mocked(getAccessibleCustomerIds);

beforeEach(() => {
  vi.resetAllMocks();
  mockAccessibleIds.mockResolvedValue(null);
});

describe("GET /api/alerts", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/alerts"));
    expect(res.status).toBe(401);
  });

  it("returns paginated alerts with meta", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([{ id: "a1" }, { id: "a2" }] as never);
    mockCount.mockResolvedValueOnce(12);

    const res = await GET(new NextRequest("http://localhost/api/alerts?page=2&limit=2"));
    const body = (await res.json()) as {
      success: boolean;
      data: unknown[];
      meta: { total: number; page: number; limit: number };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ total: 12, page: 2, limit: 2 });

    const findArgs = mockFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArgs.skip).toBe(2);
    expect(findArgs.take).toBe(2);
  });

  it("applies status/severity/platform filters and the room-assigned guard", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await GET(
      new NextRequest(
        "http://localhost/api/alerts?status=ACTIVE&severity=CRITICAL&platform=POLY_LENS"
      )
    );

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({
      status: "ACTIVE",
      severity: "CRITICAL",
      platform: "POLY_LENS",
      device: { roomId: { not: null } },
    });
  });

  it("scopes the where-clause for a TIER1 user with customer assignments", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-1", isSuperAdmin: false, vnocRole: "TIER1" },
    } as never);
    mockAccessibleIds.mockResolvedValue(["c1", "c2"]);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await GET(new NextRequest("http://localhost/api/alerts?status=ACTIVE"));

    expect(mockAccessibleIds).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tech-1", vnocRole: "TIER1" })
    );
    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({
      status: "ACTIVE",
      device: { roomId: { not: null } },
      AND: [{ device: { room: { site: { customerId: { in: ["c1", "c2"] } } } } }],
    });
    expect(mockCount.mock.calls[0][0]).toEqual({ where: findArgs.where });
  });

  it("does not scope super-admin/MANAGER sessions (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "mgr-1", isSuperAdmin: false, vnocRole: "MANAGER" },
    } as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await GET(new NextRequest("http://localhost/api/alerts"));

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).not.toHaveProperty("AND");
    expect(findArgs.where).toMatchObject({ device: { roomId: { not: null } } });
  });

  it("does not scope a TIER1 user with zero assignments (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-2", isSuperAdmin: false, vnocRole: "TIER1" },
    } as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await GET(new NextRequest("http://localhost/api/alerts"));

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).not.toHaveProperty("AND");
  });

  it("clamps limit to 100 and page to >= 1", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await GET(new NextRequest("http://localhost/api/alerts?page=0&limit=9999"));

    const findArgs = mockFindMany.mock.calls[0][0] as { skip: number; take: number };
    expect(findArgs.skip).toBe(0); // page clamped to 1
    expect(findArgs.take).toBe(100); // limit clamped to 100
  });
});
