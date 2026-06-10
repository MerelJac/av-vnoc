/**
 * Minimal structured logger: one JSON line per event so Amplify/CloudWatch
 * can filter on level/context. Swap the sink for a real drain (Sentry,
 * Datadog) without touching call sites.
 */

type LogLevel = "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

function serializeMeta(meta: LogMeta): LogMeta {
  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      value instanceof Error ? value.message : value,
    ])
  );
}

function emit(level: LogLevel, context: string, message: string, meta: LogMeta = {}): void {
  const line = JSON.stringify({
    level,
    context,
    message,
    timestamp: new Date().toISOString(),
    ...serializeMeta(meta),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export function logInfo(context: string, message: string, meta?: LogMeta): void {
  emit("info", context, message, meta);
}

export function logWarn(context: string, message: string, meta?: LogMeta): void {
  emit("warn", context, message, meta);
}

export function logError(context: string, message: string, meta?: LogMeta): void {
  emit("error", context, message, meta);
}
