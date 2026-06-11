import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { landingPathFor } from "@/lib/landing";

export default async function LandingPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const destination = landingPathFor({
    isSuperAdmin: session.user.isSuperAdmin,
    vnocRole: session.user.vnocRole,
  });

  redirect(destination);
}
