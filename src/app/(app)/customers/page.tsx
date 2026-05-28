import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function CustomersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const { isSuperAdmin, vnocRole } = session.user;
  const canAccess = isSuperAdmin || vnocRole === "MANAGER" || vnocRole === "TIER2";
  if (!canAccess) redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Customers</h1>
      <p className="text-muted">Customer list coming in Plan 05.</p>
    </div>
  );
}
