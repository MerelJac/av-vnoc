"use client";

import { useEffect, useState } from "react";
import { X, Building2 } from "lucide-react";

type CustomerOption = { id: string; name: string };

type Props = {
  userId: string;
  userLabel: string;
  initialCustomerIds: string[];
  onClose: () => void;
  onSaved: (customerIds: string[]) => void;
};

/**
 * Super-admin panel for assigning a technician to customers.
 * Zero selections means the user is unrestricted ("All customers").
 */
export default function CustomerAssignmentsModal({
  userId,
  userLabel,
  initialCustomerIds,
  onClose,
  onSaved,
}: Props) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialCustomerIds);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCustomers() {
      try {
        const res = await fetch("/api/customers");
        const body = (await res.json()) as { success?: boolean; data?: CustomerOption[]; error?: string };
        if (!res.ok || !body.data) throw new Error(body.error ?? "Failed to load customers");
        if (!cancelled) {
          setCustomers(body.data.map((c) => ({ id: c.id, name: c.name })));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load customers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(customerId: string) {
    setSelectedIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId],
    );
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/customers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerIds: selectedIds }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update customer assignments");
      }
      onSaved(selectedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update customer assignments");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl border border-[#E5E3DE] p-6 w-full max-w-md shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-[#999]" />
            <p className="text-sm font-bold text-[#111]">Customer Access</p>
          </div>
          <button onClick={onClose} className="text-[#999] hover:text-[#111] transition-colors" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-[#999]">
          Choose which customers <span className="font-semibold text-[#666]">{userLabel}</span> supports.
        </p>

        {error && (
          <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <div className="max-h-64 overflow-y-auto border border-[#E5E3DE] rounded-xl divide-y divide-[#F0EEE9]">
          {loading && <p className="px-4 py-6 text-sm text-[#999] text-center">Loading customers…</p>}
          {!loading && customers.length === 0 && (
            <p className="px-4 py-6 text-sm text-[#999] text-center">No customers yet.</p>
          )}
          {!loading &&
            customers.map((customer) => (
              <label
                key={customer.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#111] cursor-pointer hover:bg-[#F7F6F3] transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(customer.id)}
                  onChange={() => toggle(customer.id)}
                  className="accent-[#111]"
                />
                {customer.name}
              </label>
            ))}
        </div>

        <p className="text-xs text-[#999]">
          {selectedIds.length === 0
            ? "No customers selected — this user sees all customers."
            : `${selectedIds.length} customer${selectedIds.length === 1 ? "" : "s"} selected.`}
        </p>

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-[#111] text-white hover:bg-[#333] disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border border-[#E5E3DE] bg-white hover:bg-[#F7F6F3] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
