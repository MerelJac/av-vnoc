import { describe, it, expect } from "vitest";
import {
  customerCreateSchema,
  customerUpdateSchema,
  siteCreateSchema,
  siteUpdateSchema,
} from "@/lib/customer-site-schemas";

describe("customer schemas", () => {
  it("accepts a trimmed name", () => {
    expect(customerCreateSchema.parse({ name: "  Acme  " })).toEqual({ name: "Acme" });
  });
  it("rejects empty name", () => {
    expect(customerCreateSchema.safeParse({ name: "   " }).success).toBe(false);
  });
  it("rejects name over 120 chars", () => {
    expect(customerCreateSchema.safeParse({ name: "x".repeat(121) }).success).toBe(false);
  });
  it("update mirrors create", () => {
    expect(customerUpdateSchema.parse({ name: "New" })).toEqual({ name: "New" });
  });
});

describe("site schemas", () => {
  const validUuid = "11111111-1111-4111-8111-111111111111";
  it("accepts full payload", () => {
    const parsed = siteCreateSchema.parse({
      customerId: validUuid, name: "HQ", address: "1 St", city: "NYC", state: "NY", lat: 40.7, lng: -74,
    });
    expect(parsed.name).toBe("HQ");
    expect(parsed.lat).toBe(40.7);
  });
  it("accepts name-only payload", () => {
    expect(siteCreateSchema.safeParse({ customerId: validUuid, name: "HQ" }).success).toBe(true);
  });
  it("rejects non-uuid customerId", () => {
    expect(siteCreateSchema.safeParse({ customerId: "nope", name: "HQ" }).success).toBe(false);
  });
  it("update requires at least one field", () => {
    expect(siteUpdateSchema.safeParse({}).success).toBe(false);
    expect(siteUpdateSchema.safeParse({ city: "LA" }).success).toBe(true);
  });
});
