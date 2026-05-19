import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export async function POST(req: Request) {
  const { token, password } = await req.json()

  const invite = await prisma.invite.findUnique({ where: { token } })

  if (!invite || invite.accepted || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invalid invite" }, { status: 400 })
  }

  const hashed = await bcrypt.hash(password, 12)

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
  ])

  return NextResponse.json({ success: true })
}
