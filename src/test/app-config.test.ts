import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: { appConfig: { findUnique: vi.fn(), upsert: vi.fn() } } }));
import { prisma } from "@/lib/prisma";
import { getSlaConfig, setAppConfig } from "@/lib/app-config";
import { DEFAULT_SLA } from "@/lib/settings-schemas";

const mockFind = vi.mocked(prisma.appConfig.findUnique);
const mockUpsert = vi.mocked(prisma.appConfig.upsert);
beforeEach(() => vi.resetAllMocks());

describe("app-config accessors", () => {
  it("returns defaults when unset", async () => {
    mockFind.mockResolvedValueOnce(null);
    expect(await getSlaConfig()).toEqual(DEFAULT_SLA);
  });
  it("returns stored sla when present", async () => {
    mockFind.mockResolvedValueOnce({ key: "sla", value: { ...DEFAULT_SLA, P1: 30 } } as never);
    expect((await getSlaConfig()).P1).toBe(30);
  });
  it("setAppConfig upserts", async () => {
    await setAppConfig("sla", DEFAULT_SLA);
    expect(mockUpsert).toHaveBeenCalled();
  });
});
