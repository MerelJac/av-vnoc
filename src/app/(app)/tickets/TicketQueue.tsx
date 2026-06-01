"use client";

import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";
import { Clock } from "lucide-react";

interface Ticket {
  id: string;
  title: string;
  priority: string;
  status: string;
  slaDeadline: string;
  customer?: { name: string } | null;
  alert?: { platform: string; severity: string } | null;
  assignee?: { profile?: { firstName: string; lastName: string } | null } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-red-500 text-white",
  P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-white",
  P4: "bg-gray-400 text-white",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-50 text-red-600",
  IN_PROGRESS: "bg-blue-50 text-blue-600",
  RESOLVED: "bg-green-50 text-green-600",
  CLOSED: "bg-gray-50 text-gray-500",
};

export function TicketQueue({
  initial,
}: {
  initial: Ticket[];
}) {
  const [tickets, setTickets] = useState(initial);
  const [tab, setTab] = useState<"mine" | "all">("mine");

  const refresh = useCallback(async () => {
    const q = tab === "mine" ? "?queue=mine" : "";
    try {
      const res = await fetch(`/api/tickets${q}&limit=50`);
      const json = await res.json();
      if (json.success) setTickets(json.data);
    } catch { /* Silently ignore */ }
  }, [tab]);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["mine", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              tab === t
                ? "bg-secondary-color/10 text-secondary-color border-secondary-color/20"
                : "text-muted border-surface2 hover:bg-surface2"
            }`}
          >
            {t === "mine" ? "My Queue" : "All Tickets"}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      <div className="space-y-3">
        {tickets.length === 0 && (
          <p className="text-center text-muted py-8 text-sm">No tickets.</p>
        )}
        {tickets.map((ticket) => {
          const deadline = new Date(ticket.slaDeadline);
          const isAtRisk = deadline <= new Date(Date.now() + 2 * 3_600_000);
          return (
            <Link
              key={ticket.id}
              href={`/tickets/${ticket.id}`}
              className="flex items-start gap-4 bg-white rounded-2xl border border-surface2 p-4 hover:border-secondary-color/30 transition-colors"
            >
              <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg ${PRIORITY_COLORS[ticket.priority] ?? "bg-gray-400 text-white"}`}>
                {ticket.priority}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{ticket.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted flex-wrap">
                  <span>{ticket.customer?.name ?? "No customer"}</span>
                  <span>·</span>
                  <span>{ticket.alert?.platform?.replace("_", " ") ?? "—"}</span>
                  <span>·</span>
                  <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[ticket.status] ?? "bg-gray-50 text-gray-500"}`}>
                    {ticket.status.replace("_", " ")}
                  </span>
                </div>
              </div>
              <div className={`shrink-0 text-xs flex items-center gap-1 ${isAtRisk ? "text-red-500 font-medium" : "text-muted"}`}>
                <Clock className="w-3 h-3" />
                {deadline.toLocaleDateString()}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
