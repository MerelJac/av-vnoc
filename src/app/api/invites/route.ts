import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID, randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { OrgRole } from "@prisma/client";
import { sendWelcomeEmail } from "@/lib/email-templates/welcomeEmail";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Invite tokens grant account access — only super-admins may list them.
  if (!session.user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.invite.findMany({
    where: { accepted: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, token: true, createdAt: true, expiresAt: true },
  });
  return NextResponse.json(invites);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, role, firstName, lastName, phone, organizationId } = await req.json();

  if (!email?.trim() || !role || !firstName?.trim() || !lastName?.trim() || !organizationId) {
    return NextResponse.json({ error: "Email, role, name, and organizationId are required" }, { status: 400 });
  }

  if (!Object.values(OrgRole).includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const tempPassword = await bcrypt.hash(randomBytes(32).toString("hex"), 12);

  const [, invite] = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: email.trim().toLowerCase(),
        password: tempPassword,
        profile: {
          create: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone?.trim() || null,
          },
        },
      },
    });

    const newInvite = await tx.invite.create({
      data: {
        email: email.trim().toLowerCase(),
        role: role as OrgRole,
        organizationId,
        invitedBy: session.user.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
      select: { id: true, email: true, role: true, token: true, createdAt: true, expiresAt: true },
    });

    return [newUser, newInvite];
  });

  await sendWelcomeEmail(email);

  return NextResponse.json(
    { invite, inviteLink: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${invite.token}` },
    { status: 201 },
  );
}
