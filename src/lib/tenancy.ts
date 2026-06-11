import { prisma } from "@/lib/prisma";

/**
 * Per-customer tenancy helpers.
 *
 * Access rule:
 * - Super-admins and MANAGER are always unrestricted.
 * - TIER1/TIER2/no-role users with at least one CustomerAssignment only see
 *   data belonging to those customers.
 * - Users with ZERO assignments are unrestricted (backwards-compatible
 *   default so nobody is locked out before assignments are configured).
 */

export type TenancyUser = {
  id: string;
  isSuperAdmin?: boolean;
  vnocRole?: string | null;
};

/**
 * Resolve the customer ids the user may see.
 * Returns `null` to mean "unrestricted" (super-admin, MANAGER, or a user
 * with zero assignments); otherwise the assigned customerId list.
 */
export async function getAccessibleCustomerIds(user: TenancyUser): Promise<string[] | null> {
  if (user.isSuperAdmin || user.vnocRole === "MANAGER") return null;

  const assignments = await prisma.customerAssignment.findMany({
    where: { userId: user.id },
    select: { customerId: true },
  });

  if (assignments.length === 0) return null;
  return assignments.map((assignment) => assignment.customerId);
}

type IdInFilter = { in: string[] };

/** Where-fragment for models keyed by their own id (Customer). */
export function customerTenancyWhere(ids: string[] | null): { id?: IdInFilter } {
  return ids === null ? {} : { id: { in: [...ids] } };
}

/** Where-fragment for Ticket (direct customerId column). */
export function ticketTenancyWhere(ids: string[] | null): { customerId?: IdInFilter } {
  return ids === null ? {} : { customerId: { in: [...ids] } };
}

/** Where-fragment for Alert (reaches the customer via device→room→site). */
export function alertTenancyWhere(
  ids: string[] | null,
): { device?: { room: { site: { customerId: IdInFilter } } } } {
  return ids === null ? {} : { device: { room: { site: { customerId: { in: [...ids] } } } } };
}

/** Where-fragment for Device (reaches the customer via room→site). */
export function deviceTenancyWhere(
  ids: string[] | null,
): { room?: { site: { customerId: IdInFilter } } } {
  return ids === null ? {} : { room: { site: { customerId: { in: [...ids] } } } };
}

/** Where-fragment for Room (reaches the customer via site). */
export function roomTenancyWhere(
  ids: string[] | null,
): { site?: { customerId: IdInFilter } } {
  return ids === null ? {} : { site: { customerId: { in: [...ids] } } };
}
