"use client";
import { useState } from "react";
import { StatusDot } from "@/app/components/ui/StatusDot";
import type { CustomerSummary, RoomSummary } from "./types";

interface Props {
  customers: CustomerSummary[];
  selectedRoomId: string | null;
  onSelectRoom: (
    room: RoomSummary & {
      siteId: string;
      siteName: string;
      customerId: string;
      customerName: string;
    }
  ) => void;
}

function roomStatus(room: RoomSummary): "online" | "warn" | "offline" | "unknown" {
  if (room.totalDevices === 0) return "unknown";
  if (room.activeAlerts > 0) return "warn";
  if (room.onlineDevices === room.totalDevices) return "online";
  if (room.onlineDevices === 0) return "offline";
  return "warn";
}

export function RoomsTree({ customers, selectedRoomId, onSelectRoom }: Props) {
  const [search, setSearch] = useState("");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set(customers.map((c) => c.id))
  );
  const [expandedSites, setExpandedSites] = useState<Set<string>>(
    new Set(customers.flatMap((c) => c.sites.map((s) => s.id)))
  );

  const filtered = search.trim()
    ? customers
        .map((c) => ({
          ...c,
          sites: c.sites
            .map((s) => ({
              ...s,
              rooms: s.rooms.filter((r) =>
                r.name.toLowerCase().includes(search.toLowerCase())
              ),
            }))
            .filter((s) => s.rooms.length > 0),
        }))
        .filter((c) => c.sites.length > 0)
    : customers;

  const toggleCustomer = (id: string) =>
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const toggleSite = (id: string) =>
    setExpandedSites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <input
          className="w-full bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Search rooms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.map((customer) => (
          <div key={customer.id} className="mb-1">
            <button
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted rounded-md text-left"
              onClick={() => toggleCustomer(customer.id)}
            >
              <span className="text-muted-foreground text-xs">
                {expandedCustomers.has(customer.id) ? "▾" : "▸"}
              </span>
              🏢 <span>{customer.name}</span>
            </button>
            {expandedCustomers.has(customer.id) &&
              customer.sites.map((site) => (
                <div key={site.id} className="ml-3">
                  <button
                    className="w-full flex items-center gap-1.5 px-3 py-1 text-xs text-muted-foreground hover:bg-muted rounded-md text-left"
                    onClick={() => toggleSite(site.id)}
                  >
                    <span className="text-xs">
                      {expandedSites.has(site.id) ? "▾" : "▸"}
                    </span>
                    📍 <span>{site.name}</span>
                    {site.city && (
                      <span className="text-muted-foreground/60 ml-1">— {site.city}</span>
                    )}
                  </button>
                  {expandedSites.has(site.id) && (
                    <div className="ml-3 mt-0.5">
                      {site.rooms.map((room) => (
                        <button
                          key={room.id}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-md text-left transition-colors ${
                            selectedRoomId === room.id
                              ? "bg-primary/10 text-primary border-l-2 border-primary"
                              : "text-foreground hover:bg-muted"
                          }`}
                          onClick={() =>
                            onSelectRoom({
                              ...room,
                              siteId: site.id,
                              siteName: site.name,
                              customerId: customer.id,
                              customerName: customer.name,
                            })
                          }
                        >
                          <span className="flex items-center gap-2">
                            <StatusDot status={roomStatus(room)} />
                            {room.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {room.totalDevices}
                          </span>
                        </button>
                      ))}
                      <button
                        className="w-full text-left px-3 py-1 text-xs text-primary/70 hover:text-primary border border-dashed border-primary/20 hover:border-primary/40 rounded-md mt-1 transition-colors"
                        onClick={() =>
                          onSelectRoom({
                            id: "__new__",
                            name: "",
                            totalDevices: 0,
                            onlineDevices: 0,
                            activeAlerts: 0,
                            siteId: site.id,
                            siteName: site.name,
                            customerId: customer.id,
                            customerName: customer.name,
                          })
                        }
                      >
                        + Add room to {site.name}
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">
            No rooms match your search.
          </p>
        )}
      </div>
    </div>
  );
}
