import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SidebarLayout from "../components/team/Sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");

  const [customers, totalCustomers, myQueueCount, profile] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 5 }),
    prisma.customer.count(),
    prisma.ticket.count({
      where: { assignedTo: session.user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { firstName: true, lastName: true },
    }),
  ]);

  const firstName = profile?.firstName ?? "";
  const lastName = profile?.lastName ?? "";
  const userName = ([firstName, lastName].filter(Boolean).join(" ")) || (session.user.email ?? "User");
  const userInitials = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <SidebarLayout
      isSuperAdmin={session.user.isSuperAdmin}
      customers={customers}
      totalCustomers={totalCustomers}
      myQueueCount={myQueueCount}
      userInitials={userInitials}
      userName={userName}
    >
      {children}
    </SidebarLayout>
  );
}
