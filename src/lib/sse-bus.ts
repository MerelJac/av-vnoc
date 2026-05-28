import { EventEmitter } from "events";

export type SseEventType =
  | "alert_created"
  | "alert_resolved"
  | "ticket_opened"
  | "ticket_updated"
  | "kpi_updated";

export interface SseEvent {
  type: SseEventType;
  data: unknown;
}

const globalWithBus = globalThis as typeof globalThis & {
  vnocBus?: EventEmitter;
};

if (!globalWithBus.vnocBus) {
  globalWithBus.vnocBus = new EventEmitter();
  globalWithBus.vnocBus.setMaxListeners(200);
}

export const vnocBus = globalWithBus.vnocBus;

export function emitSseEvent(type: SseEventType, data: unknown): void {
  vnocBus.emit("event", { type, data } satisfies SseEvent);
}
