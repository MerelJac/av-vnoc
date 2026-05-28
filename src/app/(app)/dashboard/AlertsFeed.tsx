"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import { AlertTriangle, CheckCircle } from "lucide-react";

interface Alert {
  id: string;
  title: string;
  severity: string;
  status: string;
  platform: string;
  receivedAt: string;
  device?: { name: string; room?: { name: string } | null } | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "text-red-600 bg-red-100",
  HIGH: "text-orange-600 bg-orange-100",
  MEDIUM: "text-yellow-600 bg-yellow-100",
  LOW: "text-blue-600 bg-blue-100",
  INFO: "text-gray-600 bg-gray-100",
};

export function AlertsFeed({ initial }: { initial: Alert[] }) {
  const [alerts, setAlerts] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts?status=ACTIVE&limit=10");
      const json = await res.json();
      if (json.success) setAlerts(json.data);
    } catch { /* Silently ignore */ }
  }, []);

  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  return (
    <div className="bg-white rounded-2xl border border-surface2 p-5">
      <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        Live Alerts
      </h2>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-green-600 text-sm">
          <CheckCircle className="w-4 h-4" />
          No active alerts
        </div>
      ) : (
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start gap-3 text-sm">
              <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${SEVERITY_COLORS[alert.severity] ?? "text-gray-600 bg-gray-100"}`}>
                {alert.severity}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{alert.title}</p>
                <p className="text-muted text-xs">
                  {alert.device?.room?.name ?? alert.device?.name ?? alert.platform} · {new Date(alert.receivedAt).toLocaleTimeString()}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
