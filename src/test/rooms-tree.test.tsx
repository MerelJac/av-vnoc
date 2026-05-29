import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoomsTree } from "@/app/(app)/rooms/RoomsTree";
import type { CustomerSummary } from "@/app/(app)/rooms/types";

const CUSTOMERS: CustomerSummary[] = [
  {
    id: "c1", name: "Acme Corp",
    sites: [
      {
        id: "s1", name: "HQ", city: "Chicago", state: "IL",
        rooms: [
          { id: "r1", name: "Conference A", totalDevices: 2, onlineDevices: 1, activeAlerts: 0 },
          { id: "r2", name: "Board Room", totalDevices: 3, onlineDevices: 3, activeAlerts: 0 },
        ],
      },
    ],
  },
];

describe("RoomsTree", () => {
  it("renders customer and site names", () => {
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={vi.fn()} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("HQ")).toBeInTheDocument();
  });

  it("renders room names", () => {
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={vi.fn()} />);
    expect(screen.getByText("Conference A")).toBeInTheDocument();
    expect(screen.getByText("Board Room")).toBeInTheDocument();
  });

  it("calls onSelectRoom when room is clicked", () => {
    const onSelectRoom = vi.fn();
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={onSelectRoom} />);
    fireEvent.click(screen.getByText("Conference A"));
    expect(onSelectRoom).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }));
  });

  it("filters rooms by search input", () => {
    render(<RoomsTree customers={CUSTOMERS} selectedRoomId={null} onSelectRoom={vi.fn()} />);
    const search = screen.getByPlaceholderText(/search rooms/i);
    fireEvent.change(search, { target: { value: "Board" } });
    expect(screen.queryByText("Conference A")).not.toBeInTheDocument();
    expect(screen.getByText("Board Room")).toBeInTheDocument();
  });
});
