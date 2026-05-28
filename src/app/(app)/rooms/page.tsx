import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function RoomsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Rooms</h1>
      <p className="text-muted">Room browser coming in Plan 05.</p>
    </div>
  );
}
