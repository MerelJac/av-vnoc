// Utilities for item classification logic.

/**
 * Returns true if this is an internal service item — meaning it's fulfilled
 * by Call One labor and should be tracked via time entries / project scopes,
 * NOT via a purchase order.
 *
 * External service items (third-party subcontractors, etc.) go through POs.
 */
export function isInternalService(item: {
  type: string;
  preferredVendor?: { name: string } | null;
}): boolean {
  return item.type === "INTERNAL_SERVICE";
}

/**
 * Returns true if this is an external service item — fulfilled by a third-party
 * vendor and tracked via purchase orders, not time entries.
 */
export function isExternalService(item: {
  type: string;
  preferredVendor?: { name: string } | null;
}): boolean {
  return item.type === "EXTERNAL_SERVICE" && !isInternalService(item);
}
