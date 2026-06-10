import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    profile: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { PUT } from "@/app/api/profile/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockUserFind = vi.mocked(prisma.user.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

function putReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/profile", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  firstName: "Alex",
  lastName: "Zawadzki",
  email: "alex@callone.com",
  phone: "555-0100",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PUT /api/profile", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await PUT(putReq(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when names are missing", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    const res = await PUT(putReq({ ...VALID_BODY, firstName: " " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is missing", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    const res = await PUT(putReq({ ...VALID_BODY, email: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 when the email belongs to another user", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockUserFind.mockResolvedValueOnce({ id: "someone-else" } as never);
    const res = await PUT(putReq(VALID_BODY));
    expect(res.status).toBe(409);
  });

  it("updates only the caller's own user and profile", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockUserFind.mockResolvedValueOnce(null);
    mockTransaction.mockResolvedValueOnce([{ id: "u1", email: "alex@callone.com" }] as never);

    const res = await PUT(putReq(VALID_BODY));
    expect(res.status).toBe(200);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } })
    );
    expect(prisma.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });
});
