export interface LandingUser {
  isSuperAdmin?: boolean;
  vnocRole?: string | null;
}

/**
 * Returns the post-login landing path for a given user.
 * Super-admins always land on /dashboard regardless of vnocRole.
 * TIER1 technicians land on their personal ticket queue.
 * VNOC managers land on reports.
 * Everyone else lands on /dashboard.
 */
export function landingPathFor(user: LandingUser): string {
  if (user.isSuperAdmin) {
    return "/dashboard";
  }

  if (user.vnocRole === "TIER1") {
    return "/tickets?queue=mine";
  }

  if (user.vnocRole === "MANAGER") {
    return "/reports";
  }

  return "/dashboard";
}
