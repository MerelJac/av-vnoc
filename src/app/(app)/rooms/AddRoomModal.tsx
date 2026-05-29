"use client";
import { useState } from "react";

interface Props {
  siteId: string;
  siteName: string;
  onClose: () => void;
  onCreated: (room: { id: string; name: string }) => void;
}

export function AddRoomModal({ siteId, siteName, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Room name is required."); return; }
    setLoading(true);
    setError(null);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, name: name.trim() }),
    });
    const json = await res.json() as { success?: boolean; data?: { id: string; name: string }; error?: string };
    setLoading(false);
    if (json.success && json.data) {
      onCreated(json.data);
    } else {
      setError(json.error ?? "Failed to create room.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <form
        className="bg-card border border-border rounded-xl p-5 w-[380px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 className="text-base font-semibold mb-1">Add Room to {siteName}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Creates a new room under this site. Devices can be assigned after creation.
        </p>
        <div className="mb-4">
          <label className="block text-xs text-muted-foreground mb-1">Room name</label>
          <input
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g. Conference Room A"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Creating…" : "Create Room"}
          </button>
        </div>
      </form>
    </div>
  );
}
