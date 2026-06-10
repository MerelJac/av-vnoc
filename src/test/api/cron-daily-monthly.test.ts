import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/integrations/sync", () => ({ syncAllDevices: vi.fn() }));
vi.mock("@/lib/correlation", () => ({ runAutoResolveSweep: vi.fn() }));

import { GET as dailyCron } from "@/app/api/cron/daily/route";
import { GET as monthlyCron } from "@/app/api/cron/monthly/route";
import { syncAllDevices } from "@/lib/integrations/sync";
import { runAutoResolveSweep } from "@/lib/correlation";

const mockSync = vi.mocked(syncAllDevices);
const mockSweep = vi.mocked(runAutoResolveSweep);

const CRON_SECRET = "test-cron-secret";

function makeRequest(url: string, auth?: string): Request {
  return new Request(url, { headers: auth ? { authorization: auth } : {} });
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CRON_SECRET = CRON_SECRET;
});

describe("GET /api/cron/daily", () => {
  it("returns 401 without the cron bearer token", async () => {
    const res = await dailyCron(makeRequest("http://localhost/api/cron/daily"));
    expect(res.status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("syncs devices, runs the auto-resolve sweep, and reports results", async () => {
    mockSync.mockResolvedValueOnce({ synced: 7, errors: [] });
    mockSweep.mockResolvedValueOnce({ resolved: 2 });

    const res = await dailyCron(
      makeRequest("http://localhost/api/cron/daily", `Bearer ${CRON_SECRET}`)
    );
    const body = (await res.json()) as {
      success: boolean;
      synced: number;
      errors: string[];
      autoResolved: number;
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.synced).toBe(7);
    expect(body.autoResolved).toBe(2);
  });

  it("returns 500 with the message when the sync fails", async () => {
    mockSync.mockRejectedValueOnce(new Error("db down"));

    const res = await dailyCron(
      makeRequest("http://localhost/api/cron/daily", `Bearer ${CRON_SECRET}`)
    );
    const body = (await res.json()) as { success: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/db down/);
  });
});

describe("GET /api/cron/monthly", () => {
  it("returns 401 without the cron bearer token", async () => {
    const res = await monthlyCron(makeRequest("http://localhost/api/cron/monthly"));
    expect(res.status).toBe(401);
  });

  it("returns success with the bearer token", async () => {
    const res = await monthlyCron(
      makeRequest("http://localhost/api/cron/monthly", `Bearer ${CRON_SECRET}`)
    );
    expect(res.status).toBe(200);
  });
});
