"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";
import { TicketIcon, Clock } from "lucide-react";

interface Ticket {
  id: string;
  title: string;
  priority: string;
  status: string;
  slaDeadline: string;
  customer?: { name: string } | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  P1: "bg-red-500 text-white",
  P2: "bg-orange-500 text-white",
  P3: "bg-yellow-500 text-white",
  P4: "bg-gray-400 text-white",
};

export function TicketsFeed({ initial }: { initial: Ticket[] }) {
  const [tickets, setTickets] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets?queue=mine&limit=10");
      const json = await res.json();
      if (json.success) setTickets(json.data);
    } catch { /* Silently ignore */ }
  }, []);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  return (
    <div className="bg-white rounded-2xl border border-surface2 p-5">
      <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
        <TicketIcon className="w-4 h-4 text-blue-500" />
        My Queue
      </h2>
      {tickets.length === 0 ? (
        <p className="text-muted text-sm">No tickets assigned to you.</p>
      ) : (
        <ul className="space-y-2">
          {tickets.map((ticket) => {
            const deadline = new Date(ticket.slaDeadline);
            const isAtRisk = deadline <= new Date(Date.now() + 2 * 3_600_000);
            return (
              <li key={ticket.id}>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="flex items-start gap-3 text-sm hover:bg-surface2 rounded-xl p-2 transition-colors"
                >
                  <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_COLORS[ticket.priority] ?? "bg-gray-400 text-white"}`}>
                    {ticket.priority}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{ticket.title}</p>
                    <p className={`text-xs flex items-center gap-1 ${isAtRisk ? "text-red-500" : "text-muted"}`}>
                      <Clock className="w-3 h-3" />
                      {deadline.toLocaleString()}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
