import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, clientIpFrom, resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const result = checkRateLimit("key-a", { limit: 3, windowMs: 60_000 });
    expect(result.allowed).toBe(true);
    expect(result.retryAfterSeconds).toBe(0);
  });

  it("allows up to the limit and blocks the next one", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    checkRateLimit("key-b", opts);
    checkRateLimit("key-b", opts);
    checkRateLimit("key-b", opts);
    const blocked = checkRateLimit("key-b", opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("returns retryAfterSeconds close to windowMs / 1000 when freshly blocked", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit("key-c", opts);
    checkRateLimit("key-c", opts);
    const blocked = checkRateLimit("key-c", opts);
    expect(blocked.allowed).toBe(false);
    // Window is 60 s, we're at t=0 so retry should be ~60 s
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(59);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("separate keys are independent", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit("key-x", opts);
    checkRateLimit("key-x", opts);
    // key-x is exhausted, but key-y is not
    const result = checkRateLimit("key-y", opts);
    expect(result.allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    const opts = { limit: 2, windowMs: 60_000 };
    checkRateLimit("key-d", opts);
    checkRateLimit("key-d", opts);
    const blocked = checkRateLimit("key-d", opts);
    expect(blocked.allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(61_000);

    const reset = checkRateLimit("key-d", opts);
    expect(reset.allowed).toBe(true);
  });

  it("cleans up stale entries on each call", () => {
    const opts = { limit: 5, windowMs: 10_000 };
    checkRateLimit("stale-key", opts);

    // Advance past the window
    vi.advanceTimersByTime(15_000);

    // A new key call triggers cleanup; stale-key entry is gone
    checkRateLimit("trigger-cleanup", opts);

    // stale-key window reset — should allow again
    const r = checkRateLimit("stale-key", opts);
    expect(r.allowed).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("returns the first IP from x-forwarded-for", () => {
    const req = { headers: { get: (name: string) => name === "x-forwarded-for" ? "1.2.3.4, 5.6.7.8" : null } };
    expect(clientIpFrom(req)).toBe("1.2.3.4");
  });

  it("returns a single x-forwarded-for value directly", () => {
    const req = { headers: { get: (name: string) => name === "x-forwarded-for" ? "9.9.9.9" : null } };
    expect(clientIpFrom(req)).toBe("9.9.9.9");
  });

  it("returns 'unknown' when x-forwarded-for is absent", () => {
    const req = { headers: { get: () => null } };
    expect(clientIpFrom(req)).toBe("unknown");
  });
});
