import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canManageSettings } from "@/lib/vnoc-access";
import { getOrgConfig, getSlaConfig, getRoutingConfig } from "@/lib/app-config";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canManageSettings(session)) redirect("/dashboard");

  const [org, sla, routing] = await Promise.all([getOrgConfig(), getSlaConfig(), getRoutingConfig()]);
  const { tab } = await searchParams;

  return <SettingsTabs org={org} sla={sla} routing={routing} defaultTab={tab} />;
}
