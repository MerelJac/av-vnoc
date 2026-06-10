import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportsClient } from "@/app/(app)/reports/ReportsClient";
import type { ReportSummary } from "@/lib/reports";

const baseSummary: ReportSummary = {
  tickets: {
    total: 42,
    open: 12,
    resolved: 20,
    closed: 10,
    byPriority: { P1: 2, P2: 10, P3: 18, P4: 12 },
  },
  sla: { resolvedWithinSla: 27, resolvedBreached: 3, complianceRate: 0.9, openBreached: 3 },
  mttrMinutes: 38,
  byCustomer: [{ customerId: "c1", name: "Acme Corp", ticketCount: 17 }],
  alerts: {
    total: 120,
    bySeverity: { CRITICAL: 5, HIGH: 15, MEDIUM: 40, LOW: 40, INFO: 20 },
    byPlatform: { POLY_LENS: 80, YEALINK_YMCS: 40 },
    autoResolvedRate: 0.25,
  },
};

const sevenDaySummary: ReportSummary = {
  ...baseSummary,
  tickets: { ...baseSummary.tickets, total: 77 },
  mttrMinutes: 12,
  sla: { ...baseSummary.sla, openBreached: 0 },
};

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, data: sevenDaySummary, meta: { days: 7 } }),
  });
  vi.stubGlobal("fetch", mockFetch);
});

describe("ReportsClient", () => {
  it("renders the initial KPI values and tables", () => {
    render(<ReportsClient initialSummary={baseSummary} initialDays={30} />);

    // KPI cards
    expect(screen.getByText(/total tickets/i)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("90.0%")).toBeInTheDocument(); // SLA compliance
    expect(screen.getByText("38m")).toBeInTheDocument(); // MTTR

    // Open breaches highlighted red when > 0
    const breachValue = screen.getByText("3");
    expect(breachValue.className).toContain("text-red-600");

    // Tables
    expect(screen.getByText("P1")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument(); // P3 count
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("POLY LENS")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();

    // No fetch on first paint — server provided the initial summary.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("does not highlight open breaches when there are none", () => {
    render(
      <ReportsClient
        initialSummary={{ ...baseSummary, sla: { ...baseSummary.sla, openBreached: 0 } }}
        initialDays={30}
      />
    );

    const breachValue = screen.getByText("0");
    expect(breachValue.className).not.toContain("text-red-600");
  });

  it("refetches with the days param when the window changes", async () => {
    const user = userEvent.setup();
    render(<ReportsClient initialSummary={baseSummary} initialDays={30} />);

    await user.click(screen.getByRole("button", { name: "7d" }));

    expect(mockFetch).toHaveBeenCalledWith("/api/reports/summary?days=7");
    expect(await screen.findByText("77")).toBeInTheDocument();
    expect(screen.getByText("12m")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7d" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an error message when the refetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    const user = userEvent.setup();
    render(<ReportsClient initialSummary={baseSummary} initialDays={30} />);

    await user.click(screen.getByRole("button", { name: "90d" }));

    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
    // Keeps showing the last good data.
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
