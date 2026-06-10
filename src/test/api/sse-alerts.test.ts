import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    alert: { count: vi.fn() },
    ticket: { count: vi.fn() },
  },
}));

import { GET } from "@/app/api/sse/alerts/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prisma.alert.count).mockResolvedValue(0);
  vi.mocked(prisma.ticket.count).mockResolvedValue(0);
});

describe("GET /api/sse/alerts", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(new NextRequest("http://localhost/api/sse/alerts"));
    expect(res.status).toBe(401);
  });

  it("returns an event-stream response for authenticated users", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);

    const controller = new AbortController();
    const req = new NextRequest("http://localhost/api/sse/alerts", {
      signal: controller.signal,
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.headers.get("Cache-Control")).toContain("no-cache");

    // Close the stream so the test doesn't leak the bus listener
    controller.abort();
  });
});
