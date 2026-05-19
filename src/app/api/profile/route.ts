import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { firstName, lastName, email, phone } = await req.json();

  if (!firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  }

  if (!email?.trim()) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Check email uniqueness if changed
  const existing = await prisma.user.findUnique({ where: { email: email.trim() } });
  if (existing && existing.id !== session.user.id) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { email: email.trim() },
    }),
    prisma.profile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone?.trim() || null,
      },
      update: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone?.trim() || null,
      },
    }),
  ]);

  return NextResponse.json(user);
}