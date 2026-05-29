import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevicesTable } from "@/app/(app)/devices/DevicesTable";

const DEVICES = [
  {
    id: "d1", name: "Studio X30", platform: "POLY_LENS" as const,
    platformId: "ext-001",
    model: "Poly Studio X30", status: "online", lastSeenAt: new Date().toISOString(),
    macAddress: "aa:bb:cc:11:22:33", rawPayload: null,
    room: { id: "r1", name: "Conference A", site: { name: "HQ", customer: { id: "c1", name: "Acme" } } },
  },
  {
    id: "d2", name: "T57W-001", platform: "YEALINK_YMCS" as const,
    platformId: "ext-002",
    model: "Yealink T57W", status: "offline", lastSeenAt: null,
    macAddress: null, rawPayload: { room: { id: "r-ext", name: "Board Room" } },
    room: null,
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("DevicesTable", () => {
  it("renders device names and platforms", () => {
    render(<DevicesTable initialDevices={DEVICES as never} initialTotal={2} />);
    expect(screen.getByText("Studio X30")).toBeInTheDocument();
    expect(screen.getByText("T57W-001")).toBeInTheDocument();
    expect(screen.getByText("Poly Lens")).toBeInTheDocument();
    expect(screen.getByText("YMCS")).toBeInTheDocument();
  });

  it("shows unassigned badge for devices with no room", () => {
    render(<DevicesTable initialDevices={DEVICES as never} initialTotal={2} />);
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument();
  });

  it("shows room name for assigned devices", () => {
    render(<DevicesTable initialDevices={DEVICES as never} initialTotal={2} />);
    expect(screen.getByText("Conference A")).toBeInTheDocument();
  });
});
