"use client";
import { useState, useEffect, useCallback } from "react";
import { Platform } from "@prisma/client";
import { StatusDot } from "@/app/components/ui/StatusDot";
import { PlatformPill } from "@/app/components/ui/PlatformPill";
import { StatCard } from "@/app/components/ui/StatCard";
import { AssignDeviceModal } from "./AssignDeviceModal";
import { extractVendorRoomName, relativeTime } from "@/lib/device-utils";

interface Device {
  id: string;
  name: string;
  platform: Platform;
  model?: string | null;
  status: string;
  lastSeenAt?: string | null;
  macAddress?: string | null;
  rawPayload: unknown;
}

interface Suggestion {
  id: string;
  name: string;
  platform: Platform;
  rawPayload: unknown;
}

interface RoomData {
  id: string;
  name: string;
  site: { name: string; customer: { name: string } };
  devices: Device[];
  totalDevices: number;
  onlineDevices: number;
  activeAlerts: number;
  suggestions: Suggestion[];
}

interface Props {
  roomId: string;
  roomName: string;
  onRoomUpdated: () => void;
}

export function RoomDetail({ roomId, roomName, onRoomUpdated }: Props) {
  const [data, setData] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/rooms/${roomId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setData(j.data);
        else setError("Failed to load room.");
      })
      .catch(() => setError("Failed to load room."))
      .finally(() => setLoading(false));
  }, [roomId]);

  useEffect(() => { load(); }, [load]);

  const unassign = async (deviceId: string) => {
    const res = await fetch(`/api/devices/${deviceId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: null }),
    });
    const json = await res.json() as { success?: boolean };
    if (json.success) {
      load();
      onRoomUpdated();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading…</div>;
  }

  if (error || !data) {
    return <div className="flex items-center justify-center h-full text-red-500 text-sm">{error ?? "Room not found."}</div>;
  }

  return (
    <div className="p-6 overflow-y-auto h-full">

      {/* Suggestion banner */}
      {data.suggestions.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-800">
              ⚠ {data.suggestions.length} unassigned device{data.suggestions.length > 1 ? "s" : ""} may belong here
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              {data.suggestions.map((s) => {
                const v = extractVendorRoomName(s.rawPayload);
                return `${s.name}${v ? ` (vendor: "${v}")` : ""}`;
              }).join(", ")}
            </p>
          </div>
          <button
            className="bg-orange-500 text-white px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ml-4"
            onClick={() => setShowAssign(true)}
          >
            Review &amp; Assign →
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{data.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data.site.customer.name} · {data.site.name}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm font-medium"
            onClick={() => setShowAssign(true)}
          >
            + Assign Device
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6">
        <StatCard value={data.onlineDevices} label="Online" valueColor="text-green-600" />
        <StatCard value={data.totalDevices - data.onlineDevices} label="Offline" valueColor={data.totalDevices - data.onlineDevices > 0 ? "text-red-500" : undefined} />
        <StatCard value={data.activeAlerts} label="Active Alerts" valueColor={data.activeAlerts > 0 ? "text-orange-500" : undefined} />
        <StatCard value={data.totalDevices} label="Total Devices" />
      </div>

      {/* Device table */}
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Devices in this room
      </div>
      {data.devices.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
          No devices assigned. Click &quot;+ Assign Device&quot; to add one.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left py-2 px-3">Device</th>
              <th className="text-left py-2 px-3">Platform</th>
              <th className="text-left py-2 px-3">Model</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Last Seen</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {data.devices.map((device) => (
              <tr key={device.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
                <td className="py-2.5 px-3">
                  <div className="font-medium">{device.name}</div>
                  {device.macAddress && (
                    <div className="text-xs text-muted-foreground font-mono">{device.macAddress}</div>
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <PlatformPill platform={device.platform} />
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">{device.model ?? "—"}</td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <StatusDot status={device.status === "online" ? "online" : device.status === "offline" ? "offline" : "unknown"} />
                    <span className="capitalize">{device.status}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-muted-foreground">{relativeTime(device.lastSeenAt)}</td>
                <td className="py-2.5 px-3 text-right">
                  <button
                    className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                    onClick={() => unassign(device.id)}
                  >
                    Unassign
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAssign && (
        <AssignDeviceModal
          roomId={roomId}
          roomName={roomName}
          onClose={() => setShowAssign(false)}
          onAssigned={() => { setShowAssign(false); load(); onRoomUpdated(); }}
        />
      )}
    </div>
  );
}
