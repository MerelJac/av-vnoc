import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    profile: { update: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

import { PATCH } from "@/app/api/users/[id]/permissions/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockFind = vi.mocked(prisma.user.findUnique);
const mockUserUpdate = vi.mocked(prisma.user.update);
const mockProfileUpdate = vi.mocked(prisma.profile.update);
const mockLog = vi.mocked(prisma.activityLog.create);

const superAdmin = { user: { id: "admin-1", isSuperAdmin: true, vnocRole: null } };
const tier1 = { user: { id: "u-2", isSuperAdmin: false, vnocRole: "TIER1" } };

function req(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/users/u-9/permissions", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.resetAllMocks());

describe("PATCH /api/users/[id]/permissions", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await PATCH(req({ vnocRole: "TIER2" }), ctx("u-9"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const res = await PATCH(req({ vnocRole: "TIER2" }), ctx("u-9"));
    expect(res.status).toBe(403);
  });

  it("returns 400 when removing own super-admin (self-lockout guard)", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const res = await PATCH(req({ isSuperAdmin: false }), ctx("admin-1"));
    expect(res.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 for unknown user", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockFind.mockResolvedValueOnce(null);
    const res = await PATCH(req({ vnocRole: "MANAGER" }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  it("sets vnocRole + toggles super-admin and audits", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockFind.mockResolvedValueOnce({ id: "u-9", email: "x@y.com" } as never);
    const res = await PATCH(req({ vnocRole: "MANAGER", isSuperAdmin: true }), ctx("u-9"));
    expect(res.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: "u-9" }, data: { isSuperAdmin: true } });
    expect(mockProfileUpdate).toHaveBeenCalledWith({ where: { userId: "u-9" }, data: { vnocRole: "MANAGER" } });
    expect(mockLog).toHaveBeenCalled();
  });

  it("returns 400 when nothing to update", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const res = await PATCH(req({}), ctx("u-9"));
    expect(res.status).toBe(400);
  });
});
