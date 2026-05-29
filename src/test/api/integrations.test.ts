import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PUT } from "@/app/api/integrations/route";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformCredential: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.platformCredential.findMany);
const mockFindUnique = vi.mocked(prisma.platformCredential.findUnique);
const mockUpsert = vi.mocked(prisma.platformCredential.upsert);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/integrations", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not superAdmin", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: false } } as never);
    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns credentials list with secrets masked for superAdmin", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "cred-1",
        platform: "POLY_LENS" as never,
        clientId: "cid",
        clientSecret: "secret",
        apiKey: null,
        webhookSecret: null,
        config: { tenantId: "tenant-uuid" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ clientSecret: string; config: unknown }> };

    expect(res.status).toBe(200);
    expect(body.data[0].clientSecret).toBe("••••••••");
    // config should be returned (not masked) so tenantId is visible
    expect(body.data[0].config).toEqual({ tenantId: "tenant-uuid" });
  });

  it("strips accessToken and tokenExpiresAt from config in GET response", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "cred-1",
        platform: "POLY_LENS" as never,
        clientId: "cid",
        clientSecret: "secret",
        apiKey: null,
        webhookSecret: null,
        config: { tenantId: "tenant-uuid", accessToken: "live-bearer-token", tokenExpiresAt: 9999999 },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ config: Record<string, unknown> }> };

    expect(res.status).toBe(200);
    expect(body.data[0].config).toEqual({ tenantId: "tenant-uuid" });
    expect(body.data[0].config).not.toHaveProperty("accessToken");
    expect(body.data[0].config).not.toHaveProperty("tokenExpiresAt");
  });

  it("masks apiKey and webhookSecret in GET response", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "cred-2",
        platform: "YEALINK_YMCS" as never,
        clientId: null,
        clientSecret: null,
        apiKey: "real-api-key",
        webhookSecret: "real-webhook-secret",
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ apiKey: string; webhookSecret: string }> };
    expect(body.data[0].apiKey).toBe("••••••••");
    expect(body.data[0].webhookSecret).toBe("••••••••");
  });
});

describe("PUT /api/integrations", () => {
  it("returns 403 when user is not superAdmin", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: false } } as never);
    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({ platform: "POLY_LENS" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(403);
  });

  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({ platform: "POLY_LENS" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid platform", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({ platform: "FAKE_PLATFORM" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req);
    expect(res.status).toBe(400);
  });

  it("upserts credentials and config for superAdmin", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    // findUnique is called to read existing config when clientId/clientSecret are rotated
    mockFindUnique.mockResolvedValueOnce({
      config: { tenantId: "tenant-abc", accessToken: "old-token", tokenExpiresAt: 12345 },
    } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "POLY_LENS",
        clientId: "cid",
        clientSecret: "sec",
        config: { tenantId: "tenant-abc" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform: "POLY_LENS" },
        update: expect.objectContaining({
          clientId: "cid",
          clientSecret: "sec",
          // accessToken and tokenExpiresAt are stripped; tenantId is preserved
          config: { tenantId: "tenant-abc" },
        }),
      })
    );
  });

  it("clears cached accessToken when clientSecret is rotated", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce({
      config: { tenantId: "t-uuid", accessToken: "stale-token", tokenExpiresAt: 99999999 },
    } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({ platform: "POLY_LENS", clientSecret: "new-secret" }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockUpsert.mock.calls[0][0] as { update: { config?: Record<string, unknown> } };
    const savedConfig = upsertCall.update.config ?? {};
    expect(savedConfig).not.toHaveProperty("accessToken");
    expect(savedConfig).not.toHaveProperty("tokenExpiresAt");
    expect(savedConfig).toHaveProperty("tenantId", "t-uuid");
  });
});
