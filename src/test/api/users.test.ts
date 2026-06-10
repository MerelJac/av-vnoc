import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn() },
}));

import { GET, POST } from "@/app/api/users/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.user.findMany);
const mockFindUnique = vi.mocked(prisma.user.findUnique);
const mockCreate = vi.mocked(prisma.user.create);

const superAdmin = { user: { id: "admin-1", isSuperAdmin: true } };
const regularUser = { user: { id: "u-2", isSuperAdmin: false } };

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/users", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(bcrypt.hash).mockResolvedValue("hashed-pw" as never);
});

describe("GET /api/users", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-super-admin users", async () => {
    mockSession.mockResolvedValueOnce(regularUser as never);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns the user list for super-admins", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockFindMany.mockResolvedValueOnce([{ id: "u1", email: "a@b.c" }] as never);

    const res = await GET();
    const body = (await res.json()) as Array<{ id: string }>;

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
  });
});

describe("POST /api/users", () => {
  it("returns 403 for non-super-admin", async () => {
    mockSession.mockResolvedValueOnce(regularUser as never);
    const res = await POST(postReq({ email: "x@y.z", password: "pw", firstName: "A", lastName: "B" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const res = await POST(postReq({ email: "x@y.z" }));
    expect(res.status).toBe(400);
  });

  it("returns 409 for a duplicate email", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockFindUnique.mockResolvedValueOnce({ id: "existing" } as never);
    const res = await POST(
      postReq({ email: "Dup@Email.com", password: "pw", firstName: "A", lastName: "B" })
    );
    expect(res.status).toBe(409);
  });

  it("creates the user with a hashed password and returns 201 without it", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "new-1", email: "x@y.z" } as never);

    const res = await POST(
      postReq({ email: "X@Y.Z", password: "pw", firstName: "A", lastName: "B" })
    );

    expect(res.status).toBe(201);
    const createArgs = mockCreate.mock.calls[0][0] as {
      data: { email: string; password: string };
      select: Record<string, unknown>;
    };
    expect(createArgs.data.email).toBe("x@y.z"); // lowercased
    expect(createArgs.data.password).toBe("hashed-pw"); // never plaintext
    expect(createArgs.select).not.toHaveProperty("password");
  });
});
