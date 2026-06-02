import { describe, it, expect } from "vitest";
import { canManageCustomers } from "@/lib/vnoc-access";

describe("canManageCustomers", () => {
  it("allows super admins", () => {
    expect(canManageCustomers({ user: { isSuperAdmin: true, vnocRole: null } } as never)).toBe(true);
  });
  it("allows MANAGER and TIER2", () => {
    expect(canManageCustomers({ user: { isSuperAdmin: false, vnocRole: "MANAGER" } } as never)).toBe(true);
    expect(canManageCustomers({ user: { isSuperAdmin: false, vnocRole: "TIER2" } } as never)).toBe(true);
  });
  it("denies TIER1 and null session", () => {
    expect(canManageCustomers({ user: { isSuperAdmin: false, vnocRole: "TIER1" } } as never)).toBe(false);
    expect(canManageCustomers(null)).toBe(false);
  });
});
