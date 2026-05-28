import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AlertsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">All Alerts</h1>
      <p className="text-muted">Alert table coming in Plan 05.</p>
    </div>
  );
}
