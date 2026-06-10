import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SidebarLayout from "../components/team/Sidebar";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [customers, totalCustomers, myQueueCount, profile, configuredCreds] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 5 }),
    prisma.customer.count(),
    prisma.ticket.count({
      where: { assignedTo: session.user.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.profile.findUnique({
      where: { userId: session.user.id },
      select: { firstName: true, lastName: true },
    }),
    prisma.platformCredential.findMany({
      select: {
        platform: true,
        clientId: true,
        apiKey: true,
        webhookSecret: true,
        config: true,
      },
    }),
  ]);

  // A platform is "connected" when it has scalar credentials or, like
  // Logitech Sync, cert material stored in the config JSON.
  const configuredPlatforms = configuredCreds
    .filter((c) => {
      const config = (c.config as Record<string, unknown>) ?? {};
      return Boolean(c.clientId || c.apiKey || c.webhookSecret || config.certPem || config.keyPem);
    })
    .map((c) => c.platform as string);

  const firstName = profile?.firstName ?? "";
  const lastName = profile?.lastName ?? "";
  const userName = ([firstName, lastName].filter(Boolean).join(" ")) || (session.user.email ?? "User");
  const userInitials = [firstName[0], lastName[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <SidebarLayout
      isSuperAdmin={session.user.isSuperAdmin}
      vnocRole={session.user.vnocRole}
      customers={customers}
      totalCustomers={totalCustomers}
      myQueueCount={myQueueCount}
      userInitials={userInitials}
      userName={userName}
      configuredPlatforms={configuredPlatforms}
    >
      {children}
    </SidebarLayout>
  );
}
