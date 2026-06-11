import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/components/team/Sidebar", () => ({ default: () => null }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn(), count: vi.fn() },
    ticket: { count: vi.fn() },
    profile: { findUnique: vi.fn() },
    platformCredential: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/tenancy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tenancy")>()),
  getAccessibleCustomerIds: vi.fn(),
}));

import TeamLayout from "@/app/(app)/layout";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds } from "@/lib/tenancy";

const mockSession = vi.mocked(getServerSession);
const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);
const mockCustomerCount = vi.mocked(prisma.customer.count);
const mockTicketCount = vi.mocked(prisma.ticket.count);
const mockProfileFind = vi.mocked(prisma.profile.findUnique);
const mockCredsFindMany = vi.mocked(prisma.platformCredential.findMany);
const mockAccessibleIds = vi.mocked(getAccessibleCustomerIds);

beforeEach(() => {
  vi.resetAllMocks();
  mockCustomerFindMany.mockResolvedValue([] as never);
  mockCustomerCount.mockResolvedValue(0 as never);
  mockTicketCount.mockResolvedValue(0 as never);
  mockProfileFind.mockResolvedValue(null as never);
  mockCredsFindMany.mockResolvedValue([] as never);
});

describe("(app) layout sidebar customer scoping", () => {
  it("scopes the sidebar customer list and count for an assigned technician", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "tech-1", isSuperAdmin: false, vnocRole: "TIER1", email: "t@x.com" },
    } as never);
    mockAccessibleIds.mockResolvedValue(["c1", "c2"]);

    await TeamLayout({ children: null });

    expect(mockAccessibleIds).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tech-1", vnocRole: "TIER1" })
    );
    expect(mockCustomerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["c1", "c2"] } } })
    );
    expect(mockCustomerCount).toHaveBeenCalledWith({ where: { id: { in: ["c1", "c2"] } } });
  });

  it("leaves the sidebar unscoped when tenancy returns null", async () => {
    mockSession.mockResolvedValueOnce({
      user: { id: "admin-1", isSuperAdmin: true, vnocRole: null, email: "a@x.com" },
    } as never);
    mockAccessibleIds.mockResolvedValue(null);

    await TeamLayout({ children: null });

    expect(mockCustomerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
    expect(mockCustomerCount).toHaveBeenCalledWith({ where: {} });
  });
});
