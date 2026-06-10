import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    invite: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    organizationMember: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn() } }));
vi.mock("@/lib/email-templates/welcomeEmail", () => ({ sendWelcomeEmail: vi.fn() }));

import { GET, POST } from "@/app/api/invites/route";
import { POST as acceptInvite } from "@/app/api/invites/accept/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "@/lib/email-templates/welcomeEmail";

const mockSession = vi.mocked(getServerSession);
const mockInviteFindMany = vi.mocked(prisma.invite.findMany);
const mockInviteFindUnique = vi.mocked(prisma.invite.findUnique);
const mockUserFindUnique = vi.mocked(prisma.user.findUnique);
const mockTransaction = vi.mocked(prisma.$transaction);

const superAdmin = { user: { id: "admin-1", isSuperAdmin: true } };
const regular = { user: { id: "u-1", isSuperAdmin: false } };

function postReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const FULL_INVITE_BODY = {
  email: "new@callone.com",
  role: "MEMBER",
  firstName: "New",
  lastName: "Tech",
  organizationId: "org-1",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(bcrypt.hash).mockResolvedValue("hashed-pw" as never);
});

describe("GET /api/invites", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockInviteFindMany).not.toHaveBeenCalled();
  });

  it("returns 403 for non-super-admins (tokens must not leak)", async () => {
    mockSession.mockResolvedValueOnce(regular as never);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(mockInviteFindMany).not.toHaveBeenCalled();
  });

  it("returns pending invites for super-admins", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockInviteFindMany.mockResolvedValueOnce([{ id: "inv-1" }] as never);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown[]).toHaveLength(1);
  });
});

describe("POST /api/invites", () => {
  it("rejects non-super-admins", async () => {
    mockSession.mockResolvedValueOnce(regular as never);
    const res = await POST(postReq("http://localhost/api/invites", FULL_INVITE_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 400 when fields are missing", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const res = await POST(postReq("http://localhost/api/invites", { email: "x@y.z" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid role", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    const res = await POST(
      postReq("http://localhost/api/invites", { ...FULL_INVITE_BODY, role: "SUPREME_LEADER" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when a user with that email exists", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockUserFindUnique.mockResolvedValueOnce({ id: "existing" } as never);
    const res = await POST(postReq("http://localhost/api/invites", FULL_INVITE_BODY));
    expect(res.status).toBe(409);
  });

  it("creates the invite, sends the welcome email, and returns the invite link", async () => {
    mockSession.mockResolvedValueOnce(superAdmin as never);
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockTransaction.mockResolvedValueOnce([
      { id: "user-new" },
      { id: "inv-1", email: "new@callone.com", role: "MEMBER", token: "tok-123" },
    ] as never);

    const res = await POST(postReq("http://localhost/api/invites", FULL_INVITE_BODY));
    const body = (await res.json()) as { invite: { token: string }; inviteLink: string };

    expect(res.status).toBe(201);
    expect(body.invite.token).toBe("tok-123");
    expect(body.inviteLink).toContain("/invite/tok-123");
    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@callone.com");
  });
});

describe("POST /api/invites/accept", () => {
  const validInvite = {
    id: "inv-1",
    email: "new@callone.com",
    organizationId: "org-1",
    role: "MEMBER",
    accepted: false,
    expiresAt: new Date(Date.now() + 86_400_000),
  };

  it("returns 400 when token or password is missing", async () => {
    const res = await acceptInvite(
      postReq("http://localhost/api/invites/accept", { token: "t" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for a too-short password", async () => {
    const res = await acceptInvite(
      postReq("http://localhost/api/invites/accept", { token: "t", password: "short" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown, used, or expired invite", async () => {
    mockInviteFindUnique.mockResolvedValueOnce(null);
    const res = await acceptInvite(
      postReq("http://localhost/api/invites/accept", { token: "bad", password: "longenough" })
    );
    expect(res.status).toBe(400);

    mockInviteFindUnique.mockResolvedValueOnce({ ...validInvite, accepted: true } as never);
    const res2 = await acceptInvite(
      postReq("http://localhost/api/invites/accept", { token: "used", password: "longenough" })
    );
    expect(res2.status).toBe(400);

    mockInviteFindUnique.mockResolvedValueOnce({
      ...validInvite,
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    const res3 = await acceptInvite(
      postReq("http://localhost/api/invites/accept", { token: "old", password: "longenough" })
    );
    expect(res3.status).toBe(400);
  });

  it("sets the password on the pre-created user instead of failing on a duplicate", async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite as never);
    // POST /api/invites pre-creates the user — accept must update, not re-create
    mockUserFindUnique.mockResolvedValueOnce({ id: "user-pre" } as never);
    mockTransaction.mockResolvedValueOnce([] as never);

    const res = await acceptInvite(
      postReq("http://localhost/api/invites/accept", { token: "tok", password: "longenough" })
    );

    expect(res.status).toBe(200);
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-pre" },
        data: expect.objectContaining({ password: "hashed-pw" }),
      })
    );
    expect(prisma.organizationMember.upsert).toHaveBeenCalled();
    expect(prisma.invite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { accepted: true } })
    );
  });

  it("creates the user with membership when none exists yet", async () => {
    mockInviteFindUnique.mockResolvedValueOnce(validInvite as never);
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockTransaction.mockResolvedValueOnce([] as never);

    const res = await acceptInvite(
      postReq("http://localhost/api/invites/accept", { token: "tok", password: "longenough" })
    );

    expect(res.status).toBe(200);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@callone.com",
          password: "hashed-pw",
        }),
      })
    );
  });
});
