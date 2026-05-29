"use client";
import { useState, useEffect } from "react";
import { PlatformPill } from "@/app/components/ui/PlatformPill";
import { Platform } from "@prisma/client";

interface UnassignedDevice {
  id: string;
  name: string;
  platform: Platform;
  model?: string | null;
  macAddress?: string | null;
  rawPayload: unknown;
  status: string;
}

interface Props {
  roomId: string;
  roomName: string;
  onClose: () => void;
  onAssigned: () => void;
}

function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const room = (rawPayload as Record<string, unknown>)["room"] as { name?: string } | null;
  return room?.name ?? null;
}

export function AssignDeviceModal({ roomId, roomName, onClose, onAssigned }: Props) {
  const [devices, setDevices] = useState<UnassignedDevice[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/devices?unassigned=true&limit=100")
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setDevices(j.data);
        else setError("Failed to load devices.");
      })
      .catch(() => setError("Failed to load devices."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.macAddress ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.model ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const assign = async (deviceId: string) => {
    setAssigning(deviceId);
    setError(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      const json = await res.json() as { success?: boolean };
      if (json.success) {
        onAssigned();
      } else {
        setError("Failed to assign device. Please try again.");
      }
    } catch {
      setError("Failed to assign device. Please try again.");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-5 w-[460px] max-h-[80vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-base font-semibold">Assign Device to {roomName}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing unassigned devices from all platforms
          </p>
        </div>
        <input
          className="bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring mb-3"
          placeholder="Search by name, MAC, model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        {error && (
          <p className="text-xs text-red-500 mb-2">{error}</p>
        )}
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No unassigned devices found.</p>
          )}
          {filtered.map((device) => {
            const vendorRoom = extractVendorRoomName(device.rawPayload);
            return (
              <div
                key={device.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-muted transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {device.name}
                    <PlatformPill platform={device.platform} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {device.model && <span>{device.model} · </span>}
                    {device.macAddress && <span>{device.macAddress}</span>}
                  </div>
                  {vendorRoom && (
                    <div className="text-xs text-orange-500 mt-0.5">
                      Vendor says: &quot;{vendorRoom}&quot;
                      {vendorRoom.toLowerCase() === roomName.toLowerCase() && (
                        <span className="text-green-600 ml-1">— likely match</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  className="bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-medium disabled:opacity-50"
                  disabled={assigning === device.id}
                  onClick={() => assign(device.id)}
                >
                  {assigning === device.id ? "Adding…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            className="bg-muted text-muted-foreground px-4 py-2 rounded-md text-sm hover:bg-muted/80"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
