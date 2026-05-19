import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { email, firstName, lastName, phone } = await req.json();

  if (!email?.trim() || !firstName?.trim() || !lastName?.trim()) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const conflict = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), NOT: { id } },
  });
  if (conflict) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      email: email.trim().toLowerCase(),
      profile: {
        upsert: {
          create: { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone?.trim() || null },
          update: { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone?.trim() || null },
        },
      },
    },
    select: {
      id: true,
      email: true,
      isSuperAdmin: true,
      createdAt: true,
      profile: { select: { firstName: true, lastName: true, phone: true } },
    },
  });

  return NextResponse.json(user);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
