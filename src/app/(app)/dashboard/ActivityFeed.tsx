"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import { Activity } from "lucide-react";

interface LogEntry {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

export function ActivityFeed({ initial }: { initial: LogEntry[] }) {
  const [logs, setLogs] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      const json = await res.json();
      if (json.success) setLogs(json.data.slice(0, 20));
    } catch { /* Silently ignore */ }
  }, []);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);
  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);

  return (
    <div className="bg-white rounded-2xl border border-surface2 p-5">
      <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-purple-500" />
        VNOC Activity
      </h2>
      <ul className="space-y-2">
        {logs.map((log) => (
          <li key={log.id} className="text-sm">
            <p className="text-foreground">{log.message}</p>
            <p className="text-muted text-xs">{new Date(log.createdAt).toLocaleString()}</p>
          </li>
        ))}
        {logs.length === 0 && <p className="text-muted text-sm">No recent activity.</p>}
      </ul>
    </div>
  );
}
