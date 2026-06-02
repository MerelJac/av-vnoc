import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    appConfig: { findUnique: vi.fn(), upsert: vi.fn() },
    activityLog: { create: vi.fn() },
  },
}));

import { GET, PUT } from "@/app/api/settings/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SLA, DEFAULT_ROUTING } from "@/lib/settings-schemas";

const mockSession = vi.mocked(getServerSession);
const mockFind = vi.mocked(prisma.appConfig.findUnique);
const mockUpsert = vi.mocked(prisma.appConfig.upsert);
const mockLog = vi.mocked(prisma.activityLog.create);

const manager = { user: { id: "u1", isSuperAdmin: false, vnocRole: "MANAGER" } };
const tier1 = { user: { id: "u2", isSuperAdmin: false, vnocRole: "TIER1" } };

function putReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/settings", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => vi.resetAllMocks());

describe("GET /api/settings", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns defaults when nothing is stored", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    mockFind.mockResolvedValue(null as never);
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.sla).toEqual(DEFAULT_SLA);
    expect(body.data.routing).toEqual(DEFAULT_ROUTING);
    expect(body.data.org).toBeNull();
  });
});

describe("PUT /api/settings", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await PUT(putReq({ domain: "sla", value: DEFAULT_SLA }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-manager", async () => {
    mockSession.mockResolvedValueOnce(tier1 as never);
    const res = await PUT(putReq({ domain: "sla", value: DEFAULT_SLA }));
    expect(res.status).toBe(403);
  });

  it("persists and audits a valid sla update", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    const value = { ...DEFAULT_SLA, P1: 30 };
    const res = await PUT(putReq({ domain: "sla", value }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.P1).toBe(30);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalled();
  });

  it("returns 400 for an invalid value", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    const res = await PUT(putReq({ domain: "sla", value: { P1: -1, P2: 1, P3: 1, P4: 1, autoResolveHours: 1 } }));
    expect(res.status).toBe(400);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown domain", async () => {
    mockSession.mockResolvedValueOnce(manager as never);
    const res = await PUT(putReq({ domain: "bogus", value: {} }));
    expect(res.status).toBe(400);
  });
});
