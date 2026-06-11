import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenancy")>()),
  getAccessibleCustomerIds: vi.fn(),
}));

import { GET as listTickets } from "@/app/api/tickets/route";
import { GET as getTicket } from "@/app/api/tickets/[id]/route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds } from "@/lib/tenancy";

const mockSession = vi.mocked(getServerSession);
const mockFindMany = vi.mocked(prisma.ticket.findMany);
const mockCount = vi.mocked(prisma.ticket.count);
const mockFindUnique = vi.mocked(prisma.ticket.findUnique);
const mockAccessibleIds = vi.mocked(getAccessibleCustomerIds);

beforeEach(() => {
  vi.resetAllMocks();
  mockAccessibleIds.mockResolvedValue(null);
});

describe("GET /api/tickets", () => {
  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await listTickets(new NextRequest("http://localhost/api/tickets"));
    expect(res.status).toBe(401);
  });

  it("returns the ticket queue with meta", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([{ id: "t1" }] as never);
    mockCount.mockResolvedValueOnce(1);

    const res = await listTickets(new NextRequest("http://localhost/api/tickets"));
    const body = (await res.json()) as { data: unknown[]; meta: { total: number } };

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });

  it("scopes to the session user for queue=mine", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "user-42" } } as never);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await listTickets(new NextRequest("http://localhost/api/tickets?queue=mine"));

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({ assignedTo: "user-42" });
  });

  it("applies status and priority filters", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await listTickets(
      new NextRequest("http://localhost/api/tickets?status=OPEN&priority=P1")
    );

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({ status: "OPEN", priority: "P1" });
  });

  it("scopes the where-clause for a TIER1 user with customer assignments", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-1", isSuperAdmin: false, vnocRole: "TIER1" },
    } as never);
    mockAccessibleIds.mockResolvedValue(["c1", "c2"]);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await listTickets(new NextRequest("http://localhost/api/tickets"));

    expect(mockAccessibleIds).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tech-1", vnocRole: "TIER1" })
    );
    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({ customerId: { in: ["c1", "c2"] } });
    expect(mockCount.mock.calls[0][0]).toEqual({ where: findArgs.where });
  });

  it("merges tenancy scoping with queue=mine and status filters", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-1", isSuperAdmin: false, vnocRole: "TIER2" },
    } as never);
    mockAccessibleIds.mockResolvedValue(["c9"]);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await listTickets(
      new NextRequest("http://localhost/api/tickets?queue=mine&status=OPEN")
    );

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).toMatchObject({
      assignedTo: "tech-1",
      status: "OPEN",
      customerId: { in: ["c9"] },
    });
  });

  it("does not scope super-admin/MANAGER sessions (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "admin-1", isSuperAdmin: true, vnocRole: null },
    } as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await listTickets(new NextRequest("http://localhost/api/tickets"));

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).not.toHaveProperty("customerId");
  });

  it("does not scope a TIER1 user with zero assignments (tenancy returns null)", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-2", isSuperAdmin: false, vnocRole: "TIER1" },
    } as never);
    mockAccessibleIds.mockResolvedValue(null);
    mockFindMany.mockResolvedValueOnce([] as never);
    mockCount.mockResolvedValueOnce(0);

    await listTickets(new NextRequest("http://localhost/api/tickets"));

    const findArgs = mockFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(findArgs.where).not.toHaveProperty("customerId");
  });
});

describe("GET /api/tickets/[id]", () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it("returns 401 when not authenticated", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await getTicket(
      new NextRequest("http://localhost/api/tickets/t1"),
      params("t1")
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindUnique.mockResolvedValueOnce(null);
    const res = await getTicket(
      new NextRequest("http://localhost/api/tickets/missing"),
      params("missing")
    );
    expect(res.status).toBe(404);
  });

  it("returns the ticket with its actions timeline", async () => {
    mockSession.mockResolvedValueOnce({ user: { id: "u1" } } as never);
    mockFindUnique.mockResolvedValueOnce({
      id: "t1",
      actions: [{ id: "act-1" }],
    } as never);

    const res = await getTicket(
      new NextRequest("http://localhost/api/tickets/t1"),
      params("t1")
    );
    const body = (await res.json()) as { data: { id: string; actions: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("t1");
    expect(body.data.actions).toHaveLength(1);

    const findArgs = mockFindUnique.mock.calls[0][0] as { where: { id: string } };
    expect(findArgs.where).toEqual({ id: "t1" });
  });
});
