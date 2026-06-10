"use client";

import { useState } from "react";
import type { ReportSummary } from "@/lib/reports";

const WINDOW_OPTIONS = [7, 30, 90] as const;
const PRIORITY_ORDER = ["P1", "P2", "P3", "P4"] as const;

const PRIORITY_BADGE: Record<(typeof PRIORITY_ORDER)[number], string> = {
  P1: "bg-red-100 text-red-700",
  P2: "bg-orange-100 text-orange-700",
  P3: "bg-yellow-100 text-yellow-700",
  P4: "bg-gray-100 text-gray-600",
};

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function StatCard({
  label,
  value,
  sub,
  valueClass = "text-gray-800",
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-2">
        {label}
      </p>
      <p className={`text-[26px] font-extrabold leading-none mb-2 ${valueClass}`}>{value}</p>
      {sub}
    </div>
  );
}

function TableCard({
  label,
  sub,
  children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function CountTable({
  rows,
  emptyLabel,
}: {
  rows: { key: string; label: React.ReactNode; count: number }[];
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-[12px] text-gray-400">{emptyLabel}</p>;
  }
  return (
    <table className="w-full text-[12.5px]">
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-gray-50 first:border-t-0">
            <td className="py-1.5 text-gray-700">{row.label}</td>
            <td className="py-1.5 text-right font-semibold text-gray-800 tabular-nums">
              {row.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ReportsClientProps {
  initialSummary: ReportSummary;
  initialDays: number;
}

export function ReportsClient({ initialSummary, initialDays }: ReportsClientProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [days, setDays] = useState(initialDays);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeWindow(nextDays: number) {
    if (nextDays === days && !error) return;
    setDays(nextDays);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/summary?days=${nextDays}`);
      const json = (await res.json()) as { success: boolean; data?: ReportSummary };
      if (!res.ok || !json.success || !json.data) {
        throw new Error("Request failed");
      }
      setSummary(json.data);
    } catch {
      setError("Failed to load the report for this window. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const { tickets, sla, mttrMinutes, byCustomer, alerts } = summary;
  const breached = sla.openBreached > 0;

  const platformRows = Object.entries(alerts.byPlatform)
    .sort(([, a], [, b]) => b - a)
    .map(([platform, count]) => ({
      key: platform,
      label: platform.replace(/_/g, " "),
      count,
    }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-bold text-[#1a202c]">Reports</h1>
          <p className="text-[#718096] text-[12px] mt-0.5">
            KPI overview and SLA compliance · last {days} days
          </p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5 shadow-sm">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              disabled={loading}
              onClick={() => changeWindow(option)}
              className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors disabled:opacity-60 ${
                days === option
                  ? "bg-[#0f1347] text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[12px] font-medium text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Tickets"
          value={String(tickets.total)}
          sub={
            <p className="text-[11px] text-gray-400">
              {tickets.open} open · {tickets.resolved} resolved · {tickets.closed} closed
            </p>
          }
        />
        <StatCard
          label="SLA Compliance"
          value={formatPercent(sla.complianceRate)}
          valueClass={
            sla.complianceRate >= 0.95
              ? "text-green-600"
              : sla.complianceRate >= 0.8
              ? "text-orange-500"
              : "text-red-600"
          }
          sub={
            <p className="text-[11px] text-gray-400">
              {sla.resolvedWithinSla} within · {sla.resolvedBreached} breached
            </p>
          }
        />
        <StatCard
          label="MTTR"
          value={mttrMinutes != null ? `${mttrMinutes}m` : "—"}
          sub={<p className="text-[11px] text-gray-400">avg time to resolve</p>}
        />
        <StatCard
          label="Open SLA Breaches"
          value={String(sla.openBreached)}
          valueClass={breached ? "text-red-600" : "text-gray-800"}
          sub={
            breached ? (
              <p className="text-[11px] font-semibold text-red-600">needs attention now</p>
            ) : (
              <p className="text-[11px] font-semibold text-green-600">all on track</p>
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TableCard label="Tickets by Priority">
          <CountTable
            emptyLabel="No tickets in this window."
            rows={PRIORITY_ORDER.map((priority) => ({
              key: priority,
              label: (
                <span
                  className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[priority]}`}
                >
                  {priority}
                </span>
              ),
              count: tickets.byPriority[priority],
            }))}
          />
        </TableCard>

        <TableCard label="Top Customers" sub="by ticket volume">
          <CountTable
            emptyLabel="No tickets in this window."
            rows={byCustomer.map((customer) => ({
              key: customer.customerId,
              label: customer.name,
              count: customer.ticketCount,
            }))}
          />
        </TableCard>

        <TableCard
          label="Alerts by Platform"
          sub={`${alerts.total} alerts · ${formatPercent(alerts.autoResolvedRate)} auto-resolved`}
        >
          <CountTable emptyLabel="No alerts in this window." rows={platformRows} />
        </TableCard>
      </div>
    </div>
  );
}
