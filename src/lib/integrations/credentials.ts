import { Platform, PlatformCredential, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getCredential(platform: Platform): Promise<PlatformCredential | null> {
  return prisma.platformCredential.findUnique({ where: { platform } });
}

export async function getWebhookSecret(platform: Platform): Promise<string> {
  const cred = await getCredential(platform);
  if (!cred) {
    throw new Error(`${platform} credentials not configured`);
  }
  if (!cred.webhookSecret) {
    throw new Error(`${platform} webhook secret not configured`);
  }
  return cred.webhookSecret;
}

export async function getConfig(platform: Platform): Promise<Record<string, unknown>> {
  const cred = await getCredential(platform);
  return (cred?.config as Record<string, unknown>) ?? {};
}

export async function updateConfig(platform: Platform, patch: Record<string, unknown>): Promise<void> {
  const existing = await getConfig(platform);
  const merged = { ...existing, ...patch };
  await prisma.platformCredential.upsert({
    where: { platform },
    update: { config: merged as Prisma.InputJsonValue },
    create: { platform, config: patch as Prisma.InputJsonValue },
  });
}
