import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: Request) {
  let body: { token?: unknown; password?: unknown };
  try {
    body = (await req.json()) as { token?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const invite = await prisma.invite.findUnique({ where: { token } });

  if (!invite || invite.accepted || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);

  // POST /api/invites pre-creates the user with a random temp password, so an
  // existing user means "claim the account", not a conflict.
  const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });

  if (existingUser) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existingUser.id },
        data: { password: hashed, active: true },
      }),
      prisma.organizationMember.upsert({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId: invite.organizationId,
          },
        },
        create: {
          userId: existingUser.id,
          organizationId: invite.organizationId,
          role: invite.role,
        },
        update: { role: invite.role },
      }),
      prisma.invite.update({
        where: { id: invite.id },
        data: { accepted: true },
      }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.user.create({
        data: {
          email: invite.email,
          password: hashed,
          memberships: {
            create: {
              organizationId: invite.organizationId,
              role: invite.role,
            },
          },
        },
      }),
      prisma.invite.update({
        where: { id: invite.id },
        data: { accepted: true },
      }),
    ]);
  }

  return NextResponse.json({ success: true });
}
