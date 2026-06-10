import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/integrations/sync", () => ({ syncAllDevices: vi.fn() }));

import { POST } from "@/app/api/integrations/sync/route";
import { getServerSession } from "next-auth";
import { syncAllDevices } from "@/lib/integrations/sync";

const mockSession = vi.mocked(getServerSession);
const mockSync = vi.mocked(syncAllDevices);

function postReq(): NextRequest {
  return new NextRequest("http://localhost/api/integrations/sync", { method: "POST" });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/integrations/sync", () => {
  it("returns 403 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await POST(postReq());
    expect(res.status).toBe(403);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("returns 403 for non-super-admins", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: false } } as never);
    const res = await POST(postReq());
    expect(res.status).toBe(403);
  });

  it("runs the sync and returns its result for super-admins", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockSync.mockResolvedValueOnce({ synced: 5, errors: ["Yealink adapter init failed: x"] });

    const res = await POST(postReq());
    const body = (await res.json()) as { ok: boolean; synced: number; errors: string[] };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.synced).toBe(5);
    expect(body.errors).toHaveLength(1);
  });

  it("returns 500 when the sync throws", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockSync.mockRejectedValueOnce(new Error("pool exhausted"));

    const res = await POST(postReq());
    const body = (await res.json()) as { ok: boolean; error: string };

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/pool exhausted/);
  });
});
