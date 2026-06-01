// src/app/(app)/customers/types.ts
export interface SiteNode {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  roomCount: number;
}

export interface CustomerNode {
  id: string;
  name: string;
  sites: SiteNode[];
}

/** Shape returned by GET /api/customers/[id] and /api/sites/[id] before delete. */
export interface CustomerImpact { sites: number; rooms: number; devices: number; }
export interface SiteImpact { rooms: number; devices: number; }
