import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    customerAssignment: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    activityLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { GET, PUT } from "@/app/api/users/[id]/customers/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockUserFind = vi.mocked(prisma.user.findUnique);
const mockAssignmentFindMany = vi.mocked(prisma.customerAssignment.findMany);
const mockDeleteMany = vi.mocked(prisma.customerAssignment.deleteMany);
const mockCreateMany = vi.mocked(prisma.customerAssignment.createMany);
const mockLog = vi.mocked(prisma.activityLog.create);
const mockTransaction = vi.mocked(prisma.$transaction);

const superAdmin = { user: { id: "admin-1", isSuperAdmin: true, vnocRole: null } };
const tier1 = { user: { id: "u-2", isSuperAdmin: false, vnocRole: "TIER1" } };

function getReq(): NextRequest {
  return new NextRequest("http://localhost/api/users/u-9/customers");
}

function putReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/users/u-9/customers", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.resetAllMocks());

describe("GET /api/users/[id]/customers", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(getReq(), ctx("u-9"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const res = await GET(getReq(), ctx("u-9"));
    expect(res.status).toBe(403);
  });

  it("returns the assigned customer ids", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockAssignmentFindMany.mockResolvedValueOnce([
      { customerId: "c1" },
      { customerId: "c2" },
    ] as never);

    const res = await GET(getReq(), ctx("u-9"));
    const body = (await res.json()) as { success: boolean; data: { customerIds: string[] } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.customerIds).toEqual(["c1", "c2"]);
    expect(mockAssignmentFindMany).toHaveBeenCalledWith({
      where: { userId: "u-9" },
      select: { customerId: true },
    });
  });
});

describe("PUT /api/users/[id]/customers", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await PUT(putReq({ customerIds: ["c1"] }), ctx("u-9"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const res = await PUT(putReq({ customerIds: ["c1"] }), ctx("u-9"));
    expect(res.status).toBe(403);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const req = new NextRequest("http://localhost/api/users/u-9/customers", {
      method: "PUT",
      body: "not-json",
    });
    const res = await PUT(req, ctx("u-9"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when customerIds is missing", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const res = await PUT(putReq({}), ctx("u-9"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when customerIds is not an array of strings", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const res = await PUT(putReq({ customerIds: [1, 2] }), ctx("u-9"));
    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown user", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockUserFind.mockResolvedValueOnce(null);
    const res = await PUT(putReq({ customerIds: ["c1"] }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("replaces assignments in a transaction and writes an audit log", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockUserFind.mockResolvedValueOnce({ id: "u-9", email: "tech@callone.com" } as never);
    mockTransaction.mockResolvedValueOnce([] as never);

    const res = await PUT(putReq({ customerIds: ["c1", "c2", "c1"] }), ctx("u-9"));
    const body = (await res.json()) as { success: boolean; data: { customerIds: string[] } };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    // Replace semantics: delete all, then recreate (deduped).
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-9" } });
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { userId: "u-9", customerId: "c1" },
        { userId: "u-9", customerId: "c2" },
      ],
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(body.data.customerIds).toEqual(["c1", "c2"]);
    expect(mockLog).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "permissions_changed",
          userId: "admin-1",
          message: expect.stringContaining("tech@callone.com"),
          meta: expect.objectContaining({
            targetUserId: "u-9",
            customerIds: ["c1", "c2"],
          }),
        }),
      }),
    );
  });

  it("clears all assignments when given an empty array", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockUserFind.mockResolvedValueOnce({ id: "u-9", email: "tech@callone.com" } as never);
    mockTransaction.mockResolvedValueOnce([] as never);

    const res = await PUT(putReq({ customerIds: [] }), ctx("u-9"));

    expect(res.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { userId: "u-9" } });
    expect(mockCreateMany).toHaveBeenCalledWith({ data: [] });
  });

  it("returns 500 when the transaction fails", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockUserFind.mockResolvedValueOnce({ id: "u-9", email: "tech@callone.com" } as never);
    mockTransaction.mockRejectedValueOnce(new Error("db down"));

    const res = await PUT(putReq({ customerIds: ["c1"] }), ctx("u-9"));
    expect(res.status).toBe(500);
  });
});
