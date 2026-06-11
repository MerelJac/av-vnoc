import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customerAssignment: { findMany: vi.fn() },
  },
}));

import {
  getAccessibleCustomerIds,
  customerTenancyWhere,
  ticketTenancyWhere,
  alertTenancyWhere,
  deviceTenancyWhere,
  roomTenancyWhere,
} from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

const mockFindMany = vi.mocked(prisma.customerAssignment.findMany);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getAccessibleCustomerIds", () => {
  it("returns null (unrestricted) for super-admins without touching the DB", async () => {
    const result = await getAccessibleCustomerIds({ id: "u1", isSuperAdmin: true, vnocRole: null });
    expect(result).toBeNull();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns null (unrestricted) for MANAGER without touching the DB", async () => {
    const result = await getAccessibleCustomerIds({ id: "u1", isSuperAdmin: false, vnocRole: "MANAGER" });
    expect(result).toBeNull();
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("returns the assigned customer ids for a TIER1 user with assignments", async () => {
    mockFindMany.mockResolvedValueOnce([
      { customerId: "c1" },
      { customerId: "c2" },
    ] as never);

    const result = await getAccessibleCustomerIds({ id: "u1", isSuperAdmin: false, vnocRole: "TIER1" });

    expect(result).toEqual(["c1", "c2"]);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { customerId: true },
    });
  });

  it("returns null (unrestricted) for a TIER2 user with zero assignments", async () => {
    mockFindMany.mockResolvedValueOnce([] as never);
    const result = await getAccessibleCustomerIds({ id: "u1", isSuperAdmin: false, vnocRole: "TIER2" });
    expect(result).toBeNull();
  });

  it("returns assigned ids for a user with no vnocRole", async () => {
    mockFindMany.mockResolvedValueOnce([{ customerId: "c3" }] as never);
    const result = await getAccessibleCustomerIds({ id: "u1" });
    expect(result).toEqual(["c3"]);
  });
});

describe("tenancy where-builders", () => {
  const ids = ["c1", "c2"];

  it("return empty objects when unrestricted (null)", () => {
    expect(customerTenancyWhere(null)).toEqual({});
    expect(ticketTenancyWhere(null)).toEqual({});
    expect(alertTenancyWhere(null)).toEqual({});
    expect(deviceTenancyWhere(null)).toEqual({});
    expect(roomTenancyWhere(null)).toEqual({});
  });

  it("customerTenancyWhere filters by customer id", () => {
    expect(customerTenancyWhere(ids)).toEqual({ id: { in: ids } });
  });

  it("ticketTenancyWhere filters by customerId", () => {
    expect(ticketTenancyWhere(ids)).toEqual({ customerId: { in: ids } });
  });

  it("alertTenancyWhere filters through device→room→site", () => {
    expect(alertTenancyWhere(ids)).toEqual({
      device: { room: { site: { customerId: { in: ids } } } },
    });
  });

  it("deviceTenancyWhere filters through room→site", () => {
    expect(deviceTenancyWhere(ids)).toEqual({
      room: { site: { customerId: { in: ids } } },
    });
  });

  it("roomTenancyWhere filters through site", () => {
    expect(roomTenancyWhere(ids)).toEqual({ site: { customerId: { in: ids } } });
  });

  it("builders do not mutate the input id list", () => {
    const input = ["c1"];
    customerTenancyWhere(input);
    alertTenancyWhere(input);
    expect(input).toEqual(["c1"]);
  });
});
