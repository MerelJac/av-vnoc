"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";

interface Alert {
  id: string;
  title: string;
  severity: string;
  status: string;
  platform: string;
  assignedTo?: string | null;
  receivedAt: string;
  device?: {
    name: string;
    room?: {
      name: string;
      site?: { customer?: { name: string } | null } | null;
    } | null;
  } | null;
}

const SEVERITY_BAR: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-400",
  MEDIUM: "bg-yellow-400",
  LOW: "bg-blue-400",
  INFO: "bg-gray-300",
};

const PLATFORM_BADGE: Record<string, string> = {
  POLY_LENS: "bg-orange-50 text-orange-700 border-orange-200",
  YEALINK_YMCS: "bg-purple-50 text-purple-700 border-purple-200",
  NEAT_PULSE: "bg-green-50 text-green-700 border-green-200",
  LOGITECH_SYNC: "bg-blue-50 text-blue-700 border-blue-200",
  CISCO_CONTROL_HUB: "bg-sky-50 text-sky-700 border-sky-200",
  UTELOGY: "bg-violet-50 text-violet-700 border-violet-200",
};

const PLATFORM_LABEL: Record<string, string> = {
  POLY_LENS: "POLY LENS",
  YEALINK_YMCS: "YMCS",
  NEAT_PULSE: "NEAT PULSE",
  LOGITECH_SYNC: "LOGI SYNC",
  CISCO_CONTROL_HUB: "CISCO",
  UTELOGY: "UTELOGY",
};

export function AlertsFeed({ initial }: { initial: Alert[] }) {
  const [alerts, setAlerts] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts?status=ACTIVE&limit=10");
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } catch { /* silent */ }
  }, []);

  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-[13px] font-bold text-gray-700 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
          Live Alerts
        </h2>
        <Link href="/alerts" className="text-[11px] text-[#90d5ff] hover:text-blue-500 transition-colors">
          View all →
        </Link>
      </div>

      {alerts.length === 0 ? (
        <div className="px-4 py-6 text-[13px] text-green-600 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          No active alerts
        </div>
      ) : (
        <ul>
          {alerts.map((alert) => {
            const barColor = SEVERITY_BAR[alert.severity] ?? "bg-gray-300";
            const badgeCls = PLATFORM_BADGE[alert.platform] ?? "bg-gray-50 text-gray-600 border-gray-200";
            const platformLabel = PLATFORM_LABEL[alert.platform] ?? alert.platform;
            const customerName = alert.device?.room?.site?.customer?.name;
            const roomName = alert.device?.room?.name ?? alert.device?.name ?? alert.platform;
            const location = customerName ? `${customerName} · ${roomName}` : roomName;
            const isAssigned = Boolean((alert as { assignedTo?: string | null }).assignedTo);

            return (
              <li
                key={alert.id}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className={`w-1 h-9 rounded-full flex-shrink-0 ${barColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-gray-700 truncate">{location}</p>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">{alert.title}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex-shrink-0 ${badgeCls}`}>
                  {platformLabel}
                </span>
                <button
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded border flex-shrink-0 transition-colors ${
                    isAssigned
                      ? "border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100"
                      : "border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100"
                  }`}
                >
                  {isAssigned ? "Review" : "Assign"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
