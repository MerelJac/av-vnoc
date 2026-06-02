"use client";

import { useState } from "react";
import type { OrgConfig } from "@/lib/settings-schemas";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

interface OrgSettingsFormProps {
  initial: OrgConfig | null;
}

export function OrgSettingsForm({ initial }: OrgSettingsFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone ?? "America/New_York");
  const [supportEmail, setSupportEmail] = useState(initial?.supportEmail ?? "");
  const [start, setStart] = useState(initial?.businessHours?.start ?? "08:00");
  const [end, setEnd] = useState(initial?.businessHours?.end ?? "18:00");
  const [days, setDays] = useState<number[]>(initial?.businessHours?.days ?? [1, 2, 3, 4, 5]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function toggleDay(value: number) {
    setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: "org",
          value: { name, timezone, supportEmail, businessHours: { start, end, days } },
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-surface2 p-6 space-y-5 max-w-2xl">
      <h2 className="font-semibold text-foreground">Organization</h2>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Organization name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md bg-white border border-surface2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-md bg-white border border-surface2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Support email</label>
        <input
          type="email"
          value={supportEmail}
          onChange={(e) => setSupportEmail(e.target.value)}
          placeholder="noc@example.com"
          className="w-full rounded-md bg-white border border-surface2 px-3 py-2 text-sm text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="border-t border-surface2 pt-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Business hours</p>
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Start</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-md bg-white border border-surface2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">End</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-md bg-white border border-surface2 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                days.includes(d.value)
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-foreground border-surface2 hover:bg-surface2/40"
              }`}
            >
              {d.label}
            </button>
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
