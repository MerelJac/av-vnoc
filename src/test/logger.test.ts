import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logInfo, logWarn, logError } from "@/lib/logger";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function parseLine(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const line = (spy as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
  return JSON.parse(line) as Record<string, unknown>;
}

describe("logger", () => {
  it("emits single-line JSON with level, context, message, and timestamp", () => {
    logInfo("sync", "device sync complete", { synced: 12 });

    const entry = parseLine(vi.mocked(console.info) as never);
    expect(entry.level).toBe("info");
    expect(entry.context).toBe("sync");
    expect(entry.message).toBe("device sync complete");
    expect(entry.synced).toBe(12);
    expect(typeof entry.timestamp).toBe("string");
  });

  it("routes warn and error to the matching console method", () => {
    logWarn("correlation", "mac fallback used", { mac: "aa" });
    logError("webhook", "processing failed", { error: "boom" });

    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledOnce();
    expect(parseLine(vi.mocked(console.warn) as never).level).toBe("warn");
    expect(parseLine(vi.mocked(console.error) as never).level).toBe("error");
  });

  it("serializes Error values in meta to their message", () => {
    logError("cron", "poll failed", { error: new Error("db down") });
    const entry = parseLine(vi.mocked(console.error) as never);
    expect(entry.error).toBe("db down");
  });
});
