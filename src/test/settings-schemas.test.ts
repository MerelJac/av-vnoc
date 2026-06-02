import { describe, it, expect } from "vitest";
import { orgConfigSchema, slaConfigSchema, routingConfigSchema } from "@/lib/settings-schemas";

describe("orgConfigSchema", () => {
  it("accepts a valid org config", () => {
    expect(
      orgConfigSchema.parse({
        name: "CallOne",
        timezone: "America/New_York",
        supportEmail: "noc@callone.com",
        businessHours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      }).name,
    ).toBe("CallOne");
  });
  it("rejects bad email", () => {
    expect(orgConfigSchema.safeParse({ name: "X", timezone: "UTC", supportEmail: "nope" }).success).toBe(false);
  });
});

describe("slaConfigSchema", () => {
  it("requires positive minutes for each priority", () => {
    const ok = slaConfigSchema.safeParse({ P1: 60, P2: 240, P3: 480, P4: 1440, autoResolveHours: 24 });
    expect(ok.success).toBe(true);
    expect(slaConfigSchema.safeParse({ P1: -1, P2: 1, P3: 1, P4: 1, autoResolveHours: 1 }).success).toBe(false);
  });
});

describe("routingConfigSchema", () => {
  it("maps each AlertSeverity to a priority", () => {
    const r = routingConfigSchema.safeParse({
      severityToPriority: { CRITICAL: "P1", HIGH: "P2", MEDIUM: "P3", LOW: "P4", INFO: "P4" },
    });
    expect(r.success).toBe(true);
  });
});
