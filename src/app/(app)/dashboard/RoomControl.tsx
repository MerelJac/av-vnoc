"use client";
import { useState } from "react";

interface Device {
  id: string;
  name: string;
  model: string | null;
  status: string;
}

interface Room {
  id: string;
  name: string;
  devices: Device[];
}

export function RoomControl({ rooms }: { rooms: Room[] }) {
  const [selectedId, setSelectedId] = useState<string>(rooms[0]?.id ?? "");
  const selected = rooms.find((r) => r.id === selectedId);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h2 className="text-[13px] font-bold text-gray-700">Room Control — Utelogy</h2>
        {selected && (
          <span className="text-[11px] text-gray-400 truncate max-w-[120px]">{selected.name}</span>
        )}
      </div>

      <div className="px-4 py-2.5 border-b border-gray-50">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full text-[12px] text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-[#90d5ff] transition-colors"
        >
          {rooms.length === 0 && <option value="">No rooms</option>}
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      {selected && selected.devices.length > 0 ? (
        <ul>
          {selected.devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-50 last:border-0">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${d.status === "online" ? "bg-green-400" : "bg-red-400"}`}
              />
              <span className="flex-1 text-[12.5px] text-gray-700 truncate">{d.name}</span>
              <span className="text-[10.5px] text-gray-400">{d.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-[12px] text-gray-400">
          {selected ? "No devices in this room." : "Select a room to see devices."}
        </p>
      )}

      <div className="flex gap-2 px-4 py-2.5 border-t border-gray-50">
        <button className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors">
          Refresh Devices
        </button>
        <button className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">
          Open Ticket
        </button>
      </div>
    </div>
  );
}
