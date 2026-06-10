import { describe, it, expect } from "vitest";
import { logiConfigSchema } from "@/lib/integrations/logi-config-schema";

describe("logiConfigSchema", () => {
  it("accepts full config", () => {
    const r = logiConfigSchema.safeParse({
      orgId: "o",
      certPem: "C",
      keyPem: "K",
      apiServer: "https://x/v1",
    });
    expect(r.success).toBe(true);
  });

  it("requires orgId, certPem, keyPem", () => {
    expect(logiConfigSchema.safeParse({ orgId: "o" }).success).toBe(false);
    expect(logiConfigSchema.safeParse({ orgId: "o", certPem: "C" }).success).toBe(false);
    expect(logiConfigSchema.safeParse({ certPem: "C", keyPem: "K" }).success).toBe(false);
  });

  it("defaults apiServer when omitted", () => {
    const r = logiConfigSchema.parse({ orgId: "o", certPem: "C", keyPem: "K" });
    expect(r.apiServer).toMatch(/api\.sync\.logitech\.com/);
  });

  it("rejects a non-URL apiServer", () => {
    const r = logiConfigSchema.safeParse({
      orgId: "o",
      certPem: "C",
      keyPem: "K",
      apiServer: "not-a-url",
    });
    expect(r.success).toBe(false);
  });
});
