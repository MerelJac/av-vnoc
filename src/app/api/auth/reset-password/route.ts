import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

const RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

export async function POST(req: Request) {
  const { allowed, retryAfterSeconds } = checkRateLimit(
    `reset-password:${clientIpFrom(req)}`,
    RATE_LIMIT,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const reset = await prisma.passwordResetToken.findUnique({
    where: { token: tokenHash },
    include: { user: true },
  });

  if (
    !reset ||
    reset.usedAt ||
    reset.expiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset.userId },
      data: {  password: passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: reset.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ success: true });
}
