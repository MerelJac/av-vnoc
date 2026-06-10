/**
 * In-memory fixed-window rate limiter.
 *
 * State is stored on `globalThis` so it survives Next.js hot-module reloads in
 * development (same pattern used by src/lib/prisma.ts).
 *
 * Per-instance only — suitable for single-region AWS Amplify deployments.
 * If you horizontally scale, replace the globalThis store with a shared Redis
 * counter (e.g. `INCR` + `EXPIRE`).
 */

interface WindowEntry {
  count: number;
  windowStart: number;
}

declare const globalThis: {
  rateLimitStore: Map<string, WindowEntry>;
} & typeof global;

function getStore(): Map<string, WindowEntry> {
  if (!globalThis.rateLimitStore) {
    globalThis.rateLimitStore = new Map();
  }
  return globalThis.rateLimitStore;
}

/** Remove entries whose window has already expired (runs inline, no timers). */
function purgeStale(store: Map<string, WindowEntry>, now: number): void {
  for (const [key, entry] of store) {
    // We don't know the windowMs per entry, but any entry older than the max
    // realistic window (1 hour) can safely be removed. Callers that want
    // guaranteed cleanup reset via their own window comparison in checkRateLimit.
    // A simpler heuristic: delete entries last touched more than 1 hour ago.
    const ONE_HOUR_MS = 60 * 60 * 1000;
    if (now - entry.windowStart > ONE_HOUR_MS) {
      store.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/**
 * Check whether `key` is within its rate-limit window.
 * Returns `{ allowed: true, retryAfterSeconds: 0 }` when the request is
 * permitted, or `{ allowed: false, retryAfterSeconds: N }` when it must wait.
 */
export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const store = getStore();

  purgeStale(store, now);

  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= opts.windowMs) {
    // Start a fresh window with count = 1
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count < opts.limit) {
    store.set(key, { count: existing.count + 1, windowStart: existing.windowStart });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const windowEndsAt = existing.windowStart + opts.windowMs;
  const retryAfterSeconds = Math.ceil((windowEndsAt - now) / 1000);
  return { allowed: false, retryAfterSeconds };
}

/**
 * Extract the client IP from a request-like object.
 * Reads `x-forwarded-for` (takes the first address in case of proxies) and
 * falls back to `"unknown"` if the header is absent.
 * Works with both the standard `Request` and Next.js `NextRequest` since both
 * expose `headers.get(name)`.
 */
export function clientIpFrom(req: { headers: { get(name: string): string | null } }): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";
  return forwarded.split(",")[0].trim();
}

/**
 * Reset all rate-limit state.
 * Exported for use in test `beforeEach` hooks only — not for production use.
 */
export function resetRateLimits(): void {
  globalThis.rateLimitStore = new Map();
}
