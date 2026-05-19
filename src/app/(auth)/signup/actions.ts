"use server";

import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

type SignupResult = { success: true } | { success: false; error: string };

export async function signupAction(formData: FormData): Promise<SignupResult> {
  const email = String(formData.get("email")).trim().toLowerCase();
  const password = String(formData.get("password"));
  const passwordConfirm = String(formData.get("password-confirm"));
  const firstName = String(formData.get("firstName"));
  const lastName = String(formData.get("lastName"));

  if (!email || !password || !passwordConfirm || !firstName || !lastName) {
    return { success: false, error: "Missing required fields" };
  }

  if (password !== passwordConfirm) {
    return { success: false, error: "Passwords do not match" };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { success: false, error: "This email is not authorized to register." };
  }

  const invite = await prisma.invite.findFirst({
    where: { email, accepted: false },
  });

  if (!invite) {
    return { success: false, error: "No pending invite found. Please log in or request a new invite." };
  }

  const hashed = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    }),
    prisma.profile.upsert({
      where: { userId: user.id },
      update: { firstName, lastName },
      create: { userId: user.id, firstName, lastName },
    }),
    prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: invite.organizationId } },
      update: {},
      create: { userId: user.id, organizationId: invite.organizationId, role: invite.role },
    }),
    prisma.invite.update({
      where: { id: invite.id },
      data: { accepted: true },
    }),
  ]);

  return { success: true };
}
