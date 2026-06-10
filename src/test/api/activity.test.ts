import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/activity", () => ({ getRecentActivity: vi.fn() }));

import { GET } from "@/app/api/activity/route";
import { getServerSession } from "next-auth";
import { getRecentActivity } from "@/lib/activity";

const mockSession = vi.mocked(getServerSession);
const mockGetRecent = vi.mocked(getRecentActivity);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/activity", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/activity"));
    expect(res.status).toBe(401);
  });

  it("returns the 50 most recent activity entries", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockGetRecent.mockResolvedValueOnce([{ id: "log-1" }] as never);

    const res = await GET(new NextRequest("http://localhost/api/activity"));
    const body = (await res.json()) as { success: boolean; data: unknown[] };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: "log-1" }]);
    expect(mockGetRecent).toHaveBeenCalledWith(50);
  });
});
