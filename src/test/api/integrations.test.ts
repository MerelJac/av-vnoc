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

  it("does not clobber config sent alongside rotated credentials", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce({
      config: { tenantId: "old-tenant", accessToken: "stale", tokenExpiresAt: 1 },
    } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "POLY_LENS",
        clientSecret: "rotated",
        config: { tenantId: "new-tenant" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockUpsert.mock.calls[0][0] as { update: { config?: Record<string, unknown> } };
    expect(upsertCall.update.config).toMatchObject({ tenantId: "new-tenant" });
    expect(upsertCall.update.config).not.toHaveProperty("accessToken");
  });
});

describe("GET /api/integrations — Logitech Sync cert material", () => {
  it("strips keyPem/certPem from config and reports hasCert instead", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindMany.mockResolvedValueOnce([
      {
        id: "cred-3",
        platform: "LOGITECH_SYNC" as never,
        clientId: null,
        clientSecret: null,
        apiKey: null,
        webhookSecret: null,
        config: {
          orgId: "org-1",
          apiServer: "https://api.sync.logitech.com/v1",
          certPem: "-----BEGIN CERTIFICATE-----abc",
          keyPem: "-----BEGIN PRIVATE KEY-----xyz",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const req = new NextRequest("http://localhost/api/integrations");
    const res = await GET(req);
    const body = (await res.json()) as { data: Array<{ config: Record<string, unknown> }> };

    expect(res.status).toBe(200);
    expect(body.data[0].config).not.toHaveProperty("keyPem");
    expect(body.data[0].config).not.toHaveProperty("certPem");
    expect(body.data[0].config).toMatchObject({
      orgId: "org-1",
      apiServer: "https://api.sync.logitech.com/v1",
      hasCert: true,
    });
  });
});

describe("PUT /api/integrations — LOGITECH_SYNC config validation", () => {
  it("accepts full cert config and persists it (with defaulted apiServer)", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "LOGITECH_SYNC",
        config: { orgId: "org-1", certPem: "CERT", keyPem: "KEY" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockUpsert.mock.calls[0][0] as { update: { config?: Record<string, unknown> } };
    expect(upsertCall.update.config).toMatchObject({
      orgId: "org-1",
      certPem: "CERT",
      keyPem: "KEY",
      apiServer: expect.stringContaining("api.sync.logitech.com"),
    });
  });

  it("rejects incomplete cert material with 400", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "LOGITECH_SYNC",
        config: { orgId: "org-1" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("rejects a UTELOGY config with an invalid baseUrl", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "UTELOGY",
        apiKey: "ute-key",
        config: { baseUrl: "not-a-url" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("accepts a UTELOGY config with a valid baseUrl and preserves other config keys", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce({
      config: { baseUrl: "https://old.utelogy.com", lastPolledAt: "2026-06-01T00:00:00Z" },
    } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "UTELOGY",
        config: { baseUrl: "https://acme.utelogy.com" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockUpsert.mock.calls[0][0] as { update: { config?: Record<string, unknown> } };
    expect(upsertCall.update.config).toMatchObject({
      baseUrl: "https://acme.utelogy.com",
      lastPolledAt: "2026-06-01T00:00:00Z",
    });
  });

  it("preserves the stored key when the form omits or blanks write-only fields", async () => {
    mockSession.mockResolvedValueOnce({ user: { isSuperAdmin: true } } as never);
    mockFindUnique.mockResolvedValueOnce({
      config: { orgId: "org-1", certPem: "OLD-CERT", keyPem: "OLD-KEY" },
    } as never);
    mockUpsert.mockResolvedValueOnce({} as never);

    const req = new NextRequest("http://localhost/api/integrations", {
      method: "PUT",
      body: JSON.stringify({
        platform: "LOGITECH_SYNC",
        config: { orgId: "org-2", certPem: "", keyPem: "" },
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const upsertCall = mockUpsert.mock.calls[0][0] as { update: { config?: Record<string, unknown> } };
    expect(upsertCall.update.config).toMatchObject({
      orgId: "org-2",
      certPem: "OLD-CERT",
      keyPem: "OLD-KEY",
    });
  });
});
