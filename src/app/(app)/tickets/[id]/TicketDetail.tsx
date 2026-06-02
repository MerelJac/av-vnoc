"use client";

import { useState } from "react";
import { VnocRole } from "@prisma/client";
import { Clock, MessageSquare, RotateCw, ArrowUp, CheckCircle } from "lucide-react";

interface Action {
  id: string;
  type: string;
  body?: string | null;
  createdAt: string;
  user?: { profile?: { firstName: string; lastName: string } | null } | null;
}

interface TicketDetailProps {
  ticket: {
    id: string;
    title: string;
    priority: string;
    status: string;
    slaDeadline: string;
    description?: string | null;
    actions: Action[];
    alert?: {
      severity: string;
      title: string;
      platform: string;
      device?: {
        name: string;
        model?: string | null;
        status: string;
        room?: { name: string; site?: { name: string } | null } | null;
      } | null;
    } | null;
    customer?: { name: string } | null;
    assignee?: { profile?: { firstName: string; lastName: string } | null } | null;
  };
  vnocRole: VnocRole | null;
  isSuperAdmin: boolean;
}

export function TicketDetail({ ticket, vnocRole, isSuperAdmin }: TicketDetailProps) {
  const [actions, setActions] = useState(ticket.actions);
  const [status, setStatus] = useState(ticket.status);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEscalate = isSuperAdmin || vnocRole === "TIER2" || vnocRole === "MANAGER";
  const isResolved = status === "RESOLVED" || status === "CLOSED";

  async function submitAction(type: string, body?: string, newStatus?: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, body, newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setActions((prev) => [...prev, json.data]);
      if (newStatus) setStatus(newStatus);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-surface2 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">{ticket.title}</h1>
            <p className="text-muted text-sm mt-1">
              {ticket.customer?.name ?? "No customer"} · {ticket.alert?.platform?.replace("_", " ") ?? "—"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-bold px-2 py-1 rounded-lg bg-gray-900 text-white">{ticket.priority}</span>
            <span className="text-xs font-medium px-2 py-1 rounded-lg bg-surface2 text-foreground">{status.replace("_", " ")}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-4 text-sm text-muted">
          <Clock className="w-4 h-4" />
          SLA: {new Date(ticket.slaDeadline).toLocaleString()}
        </div>

        {ticket.alert?.device && (
          <div className="mt-4 p-3 bg-surface2/60 rounded-xl text-sm">
            <p className="font-medium text-foreground">{ticket.alert.device.name}</p>
            <p className="text-muted">
              {ticket.alert.device.room?.site?.name ?? ""} {ticket.alert.device.room?.name ?? ""} · Status: {ticket.alert.device.status}
            </p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {!isResolved && (
        <div className="bg-white rounded-2xl border border-surface2 p-6">
          <h2 className="font-semibold text-foreground mb-4">Actions</h2>
          <div className="flex gap-2 flex-wrap mb-4">
            <button
              onClick={() => submitAction("REBOOT")}
              disabled={submitting}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-surface2 hover:bg-surface2/80 disabled:opacity-50 transition-colors"
            >
              <RotateCw className="w-4 h-4" />
              Reboot Device
            </button>
            {canEscalate && (
              <button
                onClick={() => submitAction("ESCALATE", "Escalated to TIER2")}
                disabled={submitting}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 transition-colors"
              >
                <ArrowUp className="w-4 h-4" />
                Escalate
              </button>
            )}
            <button
              onClick={() => submitAction("STATUS_CHANGE", undefined, "IN_PROGRESS")}
              disabled={submitting || status === "IN_PROGRESS"}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              Claim / In Progress
            </button>
            <button
              onClick={() => submitAction("STATUS_CHANGE", undefined, "RESOLVED")}
              disabled={submitting}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Resolve
            </button>
          </div>

          <div className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              rows={3}
              className="w-full border border-surface2 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-secondary-color/30 resize-none"
            />
            <button
              onClick={() => submitAction("NOTE", note)}
              disabled={submitting || !note.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-secondary-color/10 text-secondary-color hover:bg-secondary-color/20 disabled:opacity-50 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              Add Note
            </button>
          </div>

          {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </div>
      )}

      {/* Action timeline */}
      <div className="bg-white rounded-2xl border border-surface2 p-6">
        <h2 className="font-semibold text-foreground mb-4">Timeline</h2>
        {actions.length === 0 && <p className="text-muted text-sm">No actions recorded yet.</p>}
        <ul className="space-y-4">
          {actions.map((action) => (
            <li key={action.id} className="flex gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-secondary-color mt-1.5 shrink-0" />
              <div>
                <p className="font-medium text-foreground">
                  {action.user?.profile
                    ? `${action.user.profile.firstName} ${action.user.profile.lastName}`
                    : "System"}{" "}
                  <span className="font-normal text-muted">{action.type.toLowerCase().replace("_", " ")}</span>
                </p>
                {action.body && <p className="text-foreground mt-0.5">{action.body}</p>}
                <p className="text-muted text-xs mt-0.5">{new Date(action.createdAt).toLocaleString()}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
