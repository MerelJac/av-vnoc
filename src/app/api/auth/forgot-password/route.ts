import { sendForgotPasswordEmail } from "@/lib/email-templates/forgotPassword";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

const RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

export async function POST(req: Request) {
  const { allowed, retryAfterSeconds } = checkRateLimit(
    `forgot-password:${clientIpFrom(req)}`,
    RATE_LIMIT,
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ success: true });
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Always return success to prevent email enumeration
  if (!user) {
    return NextResponse.json({ success: true });
  }

  // 1️⃣ Create token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  // 2️⃣ Store token
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token: tokenHash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    },
  });

  // 3️⃣ Reset link
  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password?token=${rawToken}`;

  try {
    await sendForgotPasswordEmail(user.email, resetUrl);
  } catch (err) {
    console.error("Error sending forgot-password email:", err);
  }

  return NextResponse.json({ success: true });
}
