"use client";

import { useState } from "react";
import type { SlaConfig, RoutingConfig } from "@/lib/settings-schemas";

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
type Priority = (typeof PRIORITIES)[number];
type Severity = (typeof SEVERITIES)[number];

interface SlaRoutingFormProps {
  initialSla: SlaConfig;
  initialRouting: RoutingConfig;
}

export function SlaRoutingForm({ initialSla, initialRouting }: SlaRoutingFormProps) {
  const [sla, setSla] = useState<SlaConfig>(initialSla);
  const [routing, setRouting] = useState<RoutingConfig>(initialRouting);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function setSlaField(key: keyof SlaConfig, value: number) {
    setSla((prev) => ({ ...prev, [key]: value }));
  }

  function setSeverity(sev: Severity, priority: Priority) {
    setRouting((prev) => ({
      ...prev,
      severityToPriority: { ...prev.severityToPriority, [sev]: priority },
    }));
  }

  async function save(domain: "sla" | "routing", value: unknown): Promise<void> {
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, value }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      throw new Error(data.error ?? "Save failed");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      await save("sla", sla);
      await save("routing", routing);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-surface2 p-6 space-y-6 max-w-2xl">
      <h2 className="font-semibold text-foreground">SLA &amp; Alert Routing</h2>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">SLA target (minutes)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PRIORITIES.map((p) => (
            <div key={p}>
              <label className="block text-sm font-medium text-foreground mb-1">{p}</label>
              <input
                type="number"
                min={1}
                value={sla[p]}
                onChange={(e) => setSlaField(p, Number(e.target.value))}
                className="w-full rounded-md bg-white border border-surface2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Auto-resolve window (hours)</label>
          <input
            type="number"
            min={1}
            value={sla.autoResolveHours}
            onChange={(e) => setSlaField("autoResolveHours", Number(e.target.value))}
            className="w-40 rounded-md bg-white border border-surface2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="border-t border-surface2 pt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Alert severity → ticket priority</p>
        <div className="space-y-2">
          {SEVERITIES.map((sev) => (
            <div key={sev} className="flex items-center justify-between">
              <span className="text-sm text-foreground">{sev}</span>
              <select
                value={routing.severityToPriority[sev]}
                onChange={(e) => setSeverity(sev, e.target.value as Priority)}
                className="rounded-md bg-white border border-surface2 px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={status === "saving"}
        className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors"
      >
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save"}
      </button>
    </form>
  );
}
