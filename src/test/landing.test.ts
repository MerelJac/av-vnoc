import { describe, it, expect } from "vitest";
import { landingPathFor } from "@/lib/landing";

describe("landingPathFor", () => {
  it("TIER1 → /tickets?queue=mine", () => {
    expect(landingPathFor({ isSuperAdmin: false, vnocRole: "TIER1" })).toBe(
      "/tickets?queue=mine"
    );
  });

  it("MANAGER → /reports", () => {
    expect(landingPathFor({ isSuperAdmin: false, vnocRole: "MANAGER" })).toBe(
      "/reports"
    );
  });

  it("TIER2 → /dashboard", () => {
    expect(landingPathFor({ isSuperAdmin: false, vnocRole: "TIER2" })).toBe(
      "/dashboard"
    );
  });

  it("null role → /dashboard", () => {
    expect(landingPathFor({ isSuperAdmin: false, vnocRole: null })).toBe(
      "/dashboard"
    );
  });

  it("undefined role → /dashboard", () => {
    expect(landingPathFor({ isSuperAdmin: false, vnocRole: undefined })).toBe(
      "/dashboard"
    );
  });

  it("super-admin with no vnocRole → /dashboard", () => {
    expect(landingPathFor({ isSuperAdmin: true, vnocRole: null })).toBe(
      "/dashboard"
    );
  });

  it("super-admin with TIER1 vnocRole → /dashboard (super-admin wins)", () => {
    expect(landingPathFor({ isSuperAdmin: true, vnocRole: "TIER1" })).toBe(
      "/dashboard"
    );
  });

  it("super-admin with MANAGER vnocRole → /dashboard (super-admin wins)", () => {
    expect(landingPathFor({ isSuperAdmin: true, vnocRole: "MANAGER" })).toBe(
      "/dashboard"
    );
  });
});
