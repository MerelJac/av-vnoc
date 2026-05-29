"use client";
import { useState, useCallback } from "react";
import { RoomsTree } from "./RoomsTree";
import { RoomDetail } from "./RoomDetail";
import { AddRoomModal } from "./AddRoomModal";
import type { CustomerSummary, RoomSummary } from "./types";

type SelectedRoom = RoomSummary & {
  siteId: string;
  siteName: string;
  customerId: string;
  customerName: string;
};

interface Props {
  initialCustomers: CustomerSummary[];
}

export function RoomsClient({ initialCustomers }: Props) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [selectedRoom, setSelectedRoom] = useState<SelectedRoom | null>(null);
  const [addRoomContext, setAddRoomContext] = useState<{ siteId: string; siteName: string } | null>(null);

  const refreshTree = useCallback(() => {
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((j) => { if (j.success) setCustomers(j.data); });
  }, []);

  const handleSelectRoom = (room: SelectedRoom) => {
    if (room.id === "__new__") {
      setAddRoomContext({ siteId: room.siteId, siteName: room.siteName });
    } else {
      setSelectedRoom(room);
    }
  };

  return (
    <div className="flex flex-1 min-h-0 border border-border rounded-lg overflow-hidden">
      {/* Tree panel */}
      <div className="w-64 border-r border-border bg-card flex-shrink-0">
        <RoomsTree
          customers={customers}
          selectedRoomId={selectedRoom?.id ?? null}
          onSelectRoom={handleSelectRoom}
        />
      </div>

      {/* Detail panel */}
      <div className="flex-1 bg-background overflow-hidden">
        {selectedRoom ? (
          <RoomDetail
            key={selectedRoom.id}
            roomId={selectedRoom.id}
            roomName={selectedRoom.name}
            onRoomUpdated={refreshTree}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-4xl mb-3">🏢</p>
            <p className="text-sm">Select a room from the tree to view details</p>
          </div>
        )}
      </div>

      {/* Add room modal */}
      {addRoomContext && (
        <AddRoomModal
          siteId={addRoomContext.siteId}
          siteName={addRoomContext.siteName}
          onClose={() => setAddRoomContext(null)}
          onCreated={(newRoom) => {
            setAddRoomContext(null);
            refreshTree();
            setSelectedRoom({
              id: newRoom.id,
              name: newRoom.name,
              totalDevices: 0,
              onlineDevices: 0,
              activeAlerts: 0,
              siteId: addRoomContext.siteId,
              siteName: addRoomContext.siteName,
              customerId: "",
              customerName: "",
            });
          }}
        />
      )}
    </div>
  );
}
