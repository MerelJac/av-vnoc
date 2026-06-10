import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    passwordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn() } }));
vi.mock("@/lib/email-templates/forgotPassword", () => ({
  sendForgotPasswordEmail: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
  clientIpFrom: vi.fn(() => "1.2.3.4"),
  resetRateLimits: vi.fn(),
}));

import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendForgotPasswordEmail } from "@/lib/email-templates/forgotPassword";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

const mockUserFind = vi.mocked(prisma.user.findUnique);
const mockTokenCreate = vi.mocked(prisma.passwordResetToken.create);
const mockTokenFind = vi.mocked(prisma.passwordResetToken.findUnique);
const mockSendEmail = vi.mocked(sendForgotPasswordEmail);
const mockTransaction = vi.mocked(prisma.$transaction);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

function jsonReq(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  resetRateLimits();
  vi.mocked(bcrypt.hash).mockResolvedValue("hashed-pw" as never);
  // Default: rate limit passes
  mockCheckRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
});

describe("POST /api/auth/forgot-password", () => {
  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 60 });
    const res = await forgotPassword(
      jsonReq("http://localhost/api/auth/forgot-password", { email: "x@y.com" })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Too many requests");
    expect(mockUserFind).not.toHaveBeenCalled();
  });

  it("returns 200 for an unknown email without creating a token (no enumeration)", async () => {
    mockUserFind.mockResolvedValueOnce(null);

    const res = await forgotPassword(
      jsonReq("http://localhost/api/auth/forgot-password", { email: "ghost@nowhere.io" })
    );

    expect(res.status).toBe(200);
    expect(mockTokenCreate).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("creates a hashed token and emails a reset link for a known user", async () => {
    mockUserFind.mockResolvedValueOnce({ id: "u1", email: "alex@callone.com" } as never);
    mockTokenCreate.mockResolvedValueOnce({} as never);

    const res = await forgotPassword(
      jsonReq("http://localhost/api/auth/forgot-password", { email: "alex@callone.com" })
    );

    expect(res.status).toBe(200);
    const createArgs = mockTokenCreate.mock.calls[0][0] as {
      data: { token: string; userId: string };
    };
    expect(createArgs.data.userId).toBe("u1");
    // Stored token must be a sha256 hash, not the raw token from the URL
    expect(createArgs.data.token).toMatch(/^[a-f0-9]{64}$/);

    const [, resetUrl] = mockSendEmail.mock.calls[0] as [string, string];
    expect(resetUrl).toContain("/reset-password?token=");
    expect(resetUrl).not.toContain(createArgs.data.token);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("returns 429 when rate limit is exceeded", async () => {
    mockCheckRateLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 45 });
    const res = await resetPassword(
      jsonReq("http://localhost/api/auth/reset-password", { token: "t", password: "p" })
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = await res.json() as { error: string };
    expect(body.error).toBe("Too many requests");
    expect(mockTokenFind).not.toHaveBeenCalled();
  });

  it("returns 400 when token or password is missing", async () => {
    const res = await resetPassword(
      jsonReq("http://localhost/api/auth/reset-password", { token: "only-token" })
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid, used, or expired token", async () => {
    mockTokenFind.mockResolvedValueOnce(null);
    const res = await resetPassword(
      jsonReq("http://localhost/api/auth/reset-password", { token: "bad", password: "newpass123" })
    );
    expect(res.status).toBe(400);

    mockTokenFind.mockResolvedValueOnce({
      id: "t1",
      userId: "u1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
    } as never);
    const res2 = await resetPassword(
      jsonReq("http://localhost/api/auth/reset-password", { token: "used", password: "newpass123" })
    );
    expect(res2.status).toBe(400);

    mockTokenFind.mockResolvedValueOnce({
      id: "t1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    const res3 = await resetPassword(
      jsonReq("http://localhost/api/auth/reset-password", { token: "old", password: "newpass123" })
    );
    expect(res3.status).toBe(400);
  });

  it("hashes the new password and consumes the token", async () => {
    mockTokenFind.mockResolvedValueOnce({
      id: "t1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    } as never);
    mockTransaction.mockResolvedValueOnce([] as never);

    const res = await resetPassword(
      jsonReq("http://localhost/api/auth/reset-password", { token: "good", password: "newpass123" })
    );

    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u1" },
        data: { password: "hashed-pw" },
      })
    );
    expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usedAt: expect.any(Date) } })
    );
  });
});
