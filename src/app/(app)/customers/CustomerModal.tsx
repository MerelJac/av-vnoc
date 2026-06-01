// src/app/(app)/customers/CustomerModal.tsx
"use client";
import { useState } from "react";
import type { CustomerNode } from "./types";

interface Props {
  customer?: CustomerNode; // present = edit mode
  onClose: () => void;
  onSaved: () => void;
}

export function CustomerModal({ customer, onClose, onSaved }: Props) {
  const isEdit = Boolean(customer);
  const [name, setName] = useState(customer?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Customer name is required."); return; }
    setLoading(true);
    setError(null);
    const url = isEdit ? `/api/customers/${customer!.id}` : "/api/customers";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const json = await res.json() as { success?: boolean; error?: string };
    setLoading(false);
    if (json.success) onSaved();
    else setError(json.error ?? "Failed to save customer.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form className="bg-card border border-border rounded-xl p-5 w-[380px] shadow-xl" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="text-base font-semibold mb-4">{isEdit ? "Rename customer" : "Add customer"}</h2>
        <div className="mb-4">
          <label className="block text-xs text-muted-foreground mb-1">Customer name</label>
          <input
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Acme Corp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" disabled={loading}>
            {loading ? "Saving…" : isEdit ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
