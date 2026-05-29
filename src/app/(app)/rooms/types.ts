// src/app/(app)/rooms/types.ts
export interface RoomSummary {
  id: string;
  name: string;
  totalDevices: number;
  onlineDevices: number;
  activeAlerts: number;
}

export interface SiteSummary {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  rooms: RoomSummary[];
}

export interface CustomerSummary {
  id: string;
  name: string;
  sites: SiteSummary[];
}
