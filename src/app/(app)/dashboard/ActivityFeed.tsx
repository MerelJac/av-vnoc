"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";

interface LogEntry {
  id: string;
  type: string;
  platform?: string | null;
  message: string;
  createdAt: string;
}

function getSourcePill(type: string, platform?: string | null): { label: string; cls: string } {
  const p = platform ?? type;
  if (p === "POLY_LENS" || type === "alert_created") return { label: "Poly Lens", cls: "bg-blue-100 text-blue-700" };
  if (p === "YEALINK_YMCS") return { label: "Yealink", cls: "bg-purple-100 text-purple-700" };
  if (p === "NEAT_PULSE") return { label: "Neat Pulse", cls: "bg-teal-100 text-teal-700" };
  if (p === "LOGITECH_SYNC") return { label: "Logi Sync", cls: "bg-indigo-100 text-indigo-700" };
  if (p === "CISCO_CONTROL_HUB") return { label: "Cisco", cls: "bg-sky-100 text-sky-700" };
  if (p === "UTELOGY") return { label: "Utelogy", cls: "bg-violet-100 text-violet-700" };
  if (type.startsWith("ticket") || type === "TICKET") return { label: "ServiceNow", cls: "bg-green-100 text-green-700" };
  return { label: "System", cls: "bg-gray-100 text-gray-600" };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ActivityFeed({ initial }: { initial: LogEntry[] }) {
  const [logs, setLogs] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      const json = await res.json();
      if (json.success) setLogs(json.data.slice(0, 20));
    } catch { /* silent */ }
  }, []);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);
  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-[13px] font-bold text-gray-700">VNOC Activity Feed</h2>
        <span className="text-[10.5px] text-gray-300">Auto refresh</span>
      </div>
      {logs.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-gray-400">No recent activity.</p>
      ) : (
        <ul className="max-h-[360px] overflow-y-auto">
          {logs.map((log) => {
            const { label, cls } = getSourcePill(log.type, log.platform);
            return (
              <li key={log.id} className="flex items-start gap-2.5 px-4 py-2 border-b border-gray-50 last:border-0">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 mt-0.5 w-[82px] text-center ${cls}`}>
                  {label}
                </span>
                <span className="flex-1 text-[12px] text-gray-600 leading-snug">{log.message}</span>
                <span className="text-[10.5px] text-gray-300 flex-shrink-0 mt-0.5 tabular-nums">
                  {formatTime(log.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
