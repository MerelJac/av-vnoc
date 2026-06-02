// src/app/(app)/customers/SiteModal.tsx
"use client";
import { useState } from "react";
import type { SiteNode } from "./types";

interface Props {
  customerId: string;
  customerName: string;
  site?: SiteNode; // present = edit mode
  onClose: () => void;
  onSaved: () => void;
}

export function SiteModal({ customerId, customerName, site, onClose, onSaved }: Props) {
  const isEdit = Boolean(site);
  const [form, setForm] = useState({
    name: site?.name ?? "",
    address: site?.address ?? "",
    city: site?.city ?? "",
    state: site?.state ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Site name is required."); return; }
    setLoading(true);
    setError(null);

    const trimmed = {
      name: form.name.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
    };
    const url = isEdit ? `/api/sites/${site!.id}` : "/api/sites";
    const body = isEdit ? trimmed : { customerId, ...trimmed };
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    setLoading(false);
    if (json.success) onSaved();
    else setError(json.error ?? "Failed to save site.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form className="bg-card border border-border rounded-xl p-5 w-[420px] shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-base font-semibold mb-1">{isEdit ? "Edit site" : `Add site to ${customerName}`}</h2>
        <div className="grid grid-cols-1 gap-3 mt-4">
          <Field label="Site name" value={form.name} onChange={set("name")} placeholder="e.g. HQ" autoFocus />
          <Field label="Address" value={form.address} onChange={set("address")} placeholder="123 Main St" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={form.city} onChange={set("city")} placeholder="New York" />
            <Field label="State" value={form.state} onChange={set("state")} placeholder="NY" />
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" disabled={loading}>
            {loading ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" {...props} />
    </div>
  );
}
