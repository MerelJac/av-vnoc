// src/app/(team)/profile
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { UserWithProfile } from "@/types/user";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return notFound();

  const user: UserWithProfile | null = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { profile: true },
  });

  if (!user) return notFound();

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#111] tracking-tight">Your Profile</h1>
        <p className="text-sm text-[#999] mt-1">Manage your account details.</p>
      </div>

      <ProfileForm
        email={user.email}
        profile={user.profile}
      />
    </div>
  );
}
