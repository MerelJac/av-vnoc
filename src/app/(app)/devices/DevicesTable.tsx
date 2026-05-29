"use client";
import { useState, useCallback } from "react";
import { Platform } from "@prisma/client";
import { StatusDot } from "@/app/components/ui/StatusDot";
import { PlatformPill } from "@/app/components/ui/PlatformPill";

interface RoomRef {
  id: string;
  name: string;
  site: { name: string; customer: { id: string; name: string } };
}

interface Device {
  id: string;
  name: string;
  platform: Platform;
  platformId: string;
  model?: string | null;
  status: string;
  lastSeenAt?: string | null;
  macAddress?: string | null;
  rawPayload: unknown;
  room: RoomRef | null;
}

interface Props {
  initialDevices: Device[];
  initialTotal: number;
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const room = (rawPayload as Record<string, unknown>)["room"] as { name?: string } | null;
  return room?.name ?? null;
}

export function DevicesTable({ initialDevices, initialTotal }: Props) {
  const [devices, setDevices] = useState(initialDevices);
  const [total, setTotal] = useState(initialTotal);
  const [platformFilter, setPlatformFilter] = useState<Platform | "">("");
  const [statusFilter, setStatusFilter] = useState<"" | "online" | "offline">("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const unassignedCount = devices.filter((d) => !d.room).length;

  const refresh = useCallback(async (overrides?: {
    platform?: Platform | "";
    status?: "" | "online" | "offline";
    unassigned?: boolean;
  }) => {
    const p = overrides?.platform ?? platformFilter;
    const s = overrides?.status ?? statusFilter;
    const u = overrides?.unassigned ?? unassignedOnly;
    const params = new URLSearchParams({ limit: "100" });
    if (p) params.set("platform", p);
    if (s) params.set("status", s);
    if (u) params.set("unassigned", "true");
    try {
      const res = await fetch(`/api/devices?${params}`);
      const json = await res.json() as { success: boolean; data: Device[]; meta: { total: number } };
      if (json.success) { setDevices(json.data); setTotal(json.meta.total); }
    } catch {
      // Keep existing data on fetch failure
    }
  }, [platformFilter, statusFilter, unassignedOnly]);

  const setAndRefreshPlatform = (v: Platform | "") => {
    setPlatformFilter(v);
    refresh({ platform: v });
  };
  const setAndRefreshStatus = (v: "" | "online" | "offline") => {
    setStatusFilter(v);
    refresh({ status: v });
  };
  const setAndRefreshUnassigned = (v: boolean) => {
    setUnassignedOnly(v);
    refresh({ unassigned: v });
  };

  return (
    <div>
      {/* Unassigned banner */}
      {unassignedCount > 0 && !unassignedOnly && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 mb-4 flex items-center justify-between">
          <p className="text-sm text-orange-800">
            <strong>{unassignedCount}</strong> device{unassignedCount > 1 ? "s" : ""} not assigned to a room
          </p>
          <button
            className="text-xs text-orange-600 font-medium hover:text-orange-800"
            onClick={() => setAndRefreshUnassigned(true)}
          >
            Show only these →
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={platformFilter}
          onChange={(e) => setAndRefreshPlatform(e.target.value as Platform | "")}
          aria-label="Filter by platform"
        >
          <option value="">All Platforms</option>
          <option value="POLY_LENS">POLY_LENS</option>
          <option value="YEALINK_YMCS">YEALINK_YMCS</option>
          <option value="NEAT_PULSE">NEAT_PULSE</option>
          <option value="LOGITECH_SYNC">LOGITECH_SYNC</option>
          <option value="CISCO_CONTROL_HUB">CISCO_CONTROL_HUB</option>
        </select>
        <select
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          value={statusFilter}
          onChange={(e) => setAndRefreshStatus(e.target.value as "" | "online" | "offline")}
        >
          <option value="">All Statuses</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
        </select>
        <button
          className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
            unassignedOnly
              ? "bg-orange-100 border-orange-300 text-orange-700 font-medium"
              : "bg-card border-border text-muted-foreground hover:border-foreground/40"
          }`}
          onClick={() => setAndRefreshUnassigned(!unassignedOnly)}
          aria-label="Toggle no-room filter"
        >
          No room only {unassignedOnly && `(${total})`}
        </button>
        <span className="ml-auto text-sm text-muted-foreground self-center">
          {total} device{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-card">
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left py-3 px-4">Device</th>
              <th className="text-left py-3 px-4">Platform</th>
              <th className="text-left py-3 px-4">Model</th>
              <th className="text-left py-3 px-4">Room</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => {
              const vendorRoom = !device.room ? extractVendorRoomName(device.rawPayload) : null;
              return (
                <tr key={device.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium">{device.name}</div>
                    {device.macAddress && (
                      <div className="text-xs text-muted-foreground font-mono">{device.macAddress}</div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <PlatformPill platform={device.platform} />
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{device.model ?? "—"}</td>
                  <td className="py-3 px-4">
                    {device.room ? (
                      <div>
                        <div className="font-medium">{device.room.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {device.room.site.customer.name} · {device.room.site.name}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <span className="text-orange-500 text-xs font-medium">⚠ unassigned</span>
                        {vendorRoom && (
                          <div className="text-xs text-muted-foreground">vendor: &quot;{vendorRoom}&quot;</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        status={
                          device.status === "online" ? "online"
                          : device.status === "offline" ? "offline"
                          : "unknown"
                        }
                      />
                      <span className="capitalize">{device.status}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{relativeTime(device.lastSeenAt)}</td>
                </tr>
              );
            })}
            {devices.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                  No devices found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
