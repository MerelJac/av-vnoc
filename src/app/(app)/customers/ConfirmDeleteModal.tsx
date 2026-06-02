// src/app/(app)/customers/ConfirmDeleteModal.tsx
"use client";
import { useEffect, useState } from "react";

interface Props {
  title: string;
  /** URL to fetch impact counts (GET) and to delete (DELETE). */
  resourceUrl: string;
  /** Renders the impact summary from the GET payload's `data`. */
  describeImpact: (data: { impact?: Record<string, number> }) => string;
  onClose: () => void;
  onDeleted: () => void;
}

export function ConfirmDeleteModal({ title, resourceUrl, describeImpact, onClose, onDeleted }: Props) {
  const [summary, setSummary] = useState<string>("Loading impact…");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(resourceUrl)
      .then((r) => r.json())
      .then((j) => { if (active && j.success) setSummary(describeImpact(j.data)); })
      .catch(() => { if (active) setSummary("Could not load impact details."); });
    return () => { active = false; };
  }, [resourceUrl, describeImpact]);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    const res = await fetch(resourceUrl, { method: "DELETE" });
    const json = await res.json() as { success?: boolean; error?: string };
    setDeleting(false);
    if (json.success) onDeleted();
    else setError(json.error ?? "Failed to delete.");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 w-[400px] shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-2">{title}</h2>
        <p className="text-sm text-muted-foreground mb-1">This cannot be undone.</p>
        <p className="text-sm text-red-500 mb-4">{summary}</p>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50" disabled={deleting} onClick={confirmDelete}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
