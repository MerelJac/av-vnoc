"use client";

import { useEffect, useRef } from "react";
import { SseEventType } from "@/lib/sse-bus";

const SSE_URL = "/api/sse/alerts";

// Singleton EventSource shared across all hook instances on the same page
let sharedES: EventSource | null = null;
let refCount = 0;

const ES_CLOSED = 2; // EventSource.CLOSED

function getSharedEventSource(): EventSource {
  if (!sharedES || sharedES.readyState === ES_CLOSED) {
    sharedES = new EventSource(SSE_URL);
  }
  return sharedES;
}

export function useSSE(
  eventType: SseEventType,
  handler: (data: unknown) => void
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const es = getSharedEventSource();
    refCount++;

    const listener = (e: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(e.data));
      } catch {
        // Ignore parse errors
      }
    };

    es.addEventListener(eventType, listener);

    return () => {
      es.removeEventListener(eventType, listener);
      refCount--;
      if (refCount === 0 && sharedES) {
        sharedES.close();
        sharedES = null;
      }
    };
  }, [eventType]);
}
