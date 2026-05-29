// src/lib/device-utils.ts
export function extractVendorRoomName(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const room = (rawPayload as Record<string, unknown>)["room"] as { name?: string } | null | undefined;
  return room?.name ?? null;
}

export function relativeTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
