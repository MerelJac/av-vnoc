"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";
import { AlertSeverity, AlertStatus, Platform } from "@prisma/client";

interface Alert {
  id: string;
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  platform: Platform;
  receivedAt: string;
  device?: { name: string; model?: string | null; room?: { name: string } | null } | null;
  ticket?: { id: string; status: string; priority: string } | null;
}

const SEVERITY_PILL: Record<AlertSeverity, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  LOW: "bg-blue-100 text-blue-700",
  INFO: "bg-gray-100 text-gray-600",
};

const STATUS_PILL: Record<AlertStatus, string> = {
  ACTIVE: "bg-red-50 text-red-600 border border-red-200",
  ACKNOWLEDGED: "bg-yellow-50 text-yellow-600 border border-yellow-200",
  AUTO_RESOLVED: "bg-green-50 text-green-600 border border-green-200",
  SUPPRESSED: "bg-gray-50 text-gray-500 border border-gray-200",
  RESOLVED: "bg-green-50 text-green-600 border border-green-200",
};

export function AlertsTable({ initial }: { initial: Alert[] }) {
  const [alerts, setAlerts] = useState(initial);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "">("");

  const refresh = useCallback(async () => {
    const params = statusFilter ? `?status=${statusFilter}&limit=100` : "?limit=100";
    try {
      const res = await fetch(`/api/alerts${params}`);
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } catch { /* Silently ignore */ }
  }, [statusFilter]);

  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  const filtered = statusFilter ? alerts.filter((a) => a.status === statusFilter) : alerts;

  return (
    <div>
      {/* Filter buttons */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["", "ACTIVE", "ACKNOWLEDGED", "AUTO_RESOLVED", "RESOLVED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s as AlertStatus | "")}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
              statusFilter === s
                ? "bg-secondary-color/10 text-secondary-color border-secondary-color/20"
                : "text-muted border-surface2 hover:bg-surface2"
            }`}
          >
            {s === "" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-surface2 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface2 text-muted text-xs uppercase tracking-wider">
              <th className="text-left px-4 py-3">Severity</th>
              <th className="text-left px-4 py-3">Alert</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Device</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Platform</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Received</th>
              <th className="text-left px-4 py-3">Ticket</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface2">
            {filtered.map((alert) => (
              <tr key={alert.id} className="hover:bg-surface2/50 transition-colors">
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SEVERITY_PILL[alert.severity]}`}>
                    {alert.severity}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">{alert.title}</td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">
                  {alert.device?.room?.name ?? alert.device?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted hidden lg:table-cell">
                  {alert.platform.replace("_", " ")}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_PILL[alert.status]}`}>
                    {alert.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted text-xs hidden lg:table-cell">
                  {new Date(alert.receivedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  {alert.ticket ? (
                    <Link href={`/tickets/${alert.ticket.id}`} className="text-xs text-secondary-color hover:underline font-medium">
                      {alert.ticket.priority} · {alert.ticket.status}
                    </Link>
                  ) : (
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center text-muted py-8 text-sm">No alerts found.</p>
        )}
      </div>
    </div>
  );
}
