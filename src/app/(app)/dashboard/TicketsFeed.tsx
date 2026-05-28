"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import Link from "next/link";

interface Ticket {
  id: string;
  title: string;
  priority: string;
  status: string;
  slaDeadline: string;
  customer?: { name: string } | null;
}

const PRIORITY_CLS: Record<string, string> = {
  P1: "bg-red-100 text-red-700",
  P2: "bg-orange-100 text-orange-700",
  P3: "bg-yellow-100 text-yellow-700",
  P4: "bg-gray-100 text-gray-600",
};

function slaCountdown(deadline: string): { label: string; cls: string } {
  const ms = new Date(deadline).getTime() - Date.now();
  if (ms <= 0) return { label: "OVERDUE", cls: "text-red-600" };
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  const label = hours > 0 ? `SLA: ${hours}h ${mins}m` : `SLA: ${mins}m`;
  const cls = ms < 2 * 3_600_000 ? "text-red-500" : ms < 4 * 3_600_000 ? "text-orange-500" : "text-green-600";
  return { label, cls };
}

export function TicketsFeed({ initial }: { initial: Ticket[] }) {
  const [tickets, setTickets] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets?queue=mine&limit=10");
      const json = await res.json();
      if (json.success) setTickets(json.data);
    } catch { /* silent */ }
  }, []);

  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-[13px] font-bold text-gray-700">My Open Tickets — ServiceNow</h2>
        <Link href="/tickets?queue=mine" className="text-[11px] text-[#90d5ff] hover:text-blue-500 transition-colors">
          View all →
        </Link>
      </div>

      {tickets.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-gray-400">No tickets assigned to you.</p>
      ) : (
        <ul>
          {tickets.map((ticket) => {
            const inc = `INC${ticket.id.slice(-7).toUpperCase()}`;
            const { label: slaLabel, cls: slaCls } = slaCountdown(ticket.slaDeadline);
            return (
              <li key={ticket.id}>
                <Link
                  href={`/tickets/${ticket.id}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-mono text-[10.5px] text-gray-400 w-[88px] flex-shrink-0">{inc}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-semibold text-gray-700 truncate">{ticket.title}</p>
                    {ticket.customer && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{ticket.customer.name}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${PRIORITY_CLS[ticket.priority] ?? "bg-gray-100 text-gray-600"}`}>
                    {ticket.priority}
                  </span>
                  <span className={`text-[11px] font-semibold flex-shrink-0 ${slaCls}`}>
                    {slaLabel}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
