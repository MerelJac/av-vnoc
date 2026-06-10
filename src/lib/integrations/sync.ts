import { prisma } from "@/lib/prisma";
import { NormalizedDevice } from "./types";
import { createPolyLensAdapter } from "./poly-lens";
import { createYealinkAdapter } from "./yealink";
import { createLogiSyncAdapter } from "./logitech-sync";

async function upsertDevice(device: NormalizedDevice): Promise<void> {
  const { platform, platformId, name, model, firmware, ipAddress, macAddress, status, lastSeenAt, rawPayload } = device;

  await prisma.device.upsert({
    where: {
      platform_platformId: { platform, platformId },
    },
    create: {
      platform,
      platformId,
      name,
      model: model ?? null,
      firmware: firmware ?? null,
      ipAddress: ipAddress ?? null,
      macAddress: macAddress ?? null,
      status,
      lastSeenAt: lastSeenAt ?? null,
      rawPayload: rawPayload as object,
    },
    update: {
      name,
      model: model ?? null,
      firmware: firmware ?? null,
      ipAddress: ipAddress ?? null,
      macAddress: macAddress ?? null,
      status,
      lastSeenAt: lastSeenAt ?? null,
      rawPayload: rawPayload as object,
    },
  });
}

export async function syncAllDevices(): Promise<{ synced: number; errors: string[] }> {
  const [polyResult, yealinkResult, logiResult] = await Promise.allSettled([
    createPolyLensAdapter(),
    createYealinkAdapter(),
    createLogiSyncAdapter(),
  ]);

  const adapters: Array<Awaited<ReturnType<typeof createPolyLensAdapter>>> = [];
  const errors: string[] = [];

  if (polyResult.status === "fulfilled") {
    adapters.push(polyResult.value);
  } else {
    errors.push(`PolyLens adapter init failed: ${String(polyResult.reason)}`);
  }

  if (yealinkResult.status === "fulfilled") {
    adapters.push(yealinkResult.value);
  } else {
    errors.push(`Yealink adapter init failed: ${String(yealinkResult.reason)}`);
  }

  if (logiResult.status === "fulfilled") {
    adapters.push(logiResult.value);
  } else {
    errors.push(`LogitechSync adapter init failed: ${String(logiResult.reason)}`);
  }

  let synced = 0;

  for (const adapter of adapters) {
    try {
      const devices = await adapter.syncDevices();
      await Promise.all(devices.map(upsertDevice));
      synced += devices.length;
    } catch (err) {
      errors.push(`Adapter sync failed: ${String(err)}`);
    }
  }

  return { synced, errors };
}
