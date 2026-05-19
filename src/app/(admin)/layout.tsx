import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SidebarLayout from "../components/team/Sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");

  return <SidebarLayout isSuperAdmin={session.user.isSuperAdmin}>{children}</SidebarLayout>;
}
