import type { Session } from "next-auth";

/** Customers & sites can be managed by super admins, MANAGER, or TIER2. */
export function canManageCustomers(session: Session | null): boolean {
  if (!session?.user) return false;
  const { isSuperAdmin, vnocRole } = session.user;
  return Boolean(isSuperAdmin) || vnocRole === "MANAGER" || vnocRole === "TIER2";
}
