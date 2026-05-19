import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import UsersManager from "./UsersManager";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return notFound();

  const [users, invites] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
        createdAt: true,
        profile: { select: { firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invite.findMany({
      where: { accepted: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, token: true, createdAt: true, expiresAt: true },
    }),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#111] tracking-tight">Users</h1>
        <p className="text-sm text-[#999] mt-1">Manage team members and invites.</p>
      </div>

      <UsersManager
        initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        initialInvites={invites.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
          expiresAt: i.expiresAt.toISOString(),
        }))}
        currentUserId={session.user.id}
        appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""}
      />
    </div>
  );
}
