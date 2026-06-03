import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  slaConfigSchema,
  routingConfigSchema,
  orgConfigSchema,
  DEFAULT_SLA,
  DEFAULT_ROUTING,
  type SlaConfig,
  type RoutingConfig,
  type OrgConfig,
} from "@/lib/settings-schemas";

async function read(key: string): Promise<unknown> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setAppConfig(key: string, value: unknown): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue },
    create: { key, value: value as Prisma.InputJsonValue },
  });
}

export async function getSlaConfig(): Promise<SlaConfig> {
  const parsed = slaConfigSchema.safeParse(await read("sla"));
  return parsed.success ? parsed.data : DEFAULT_SLA;
}

export async function getRoutingConfig(): Promise<RoutingConfig> {
  const parsed = routingConfigSchema.safeParse(await read("routing"));
  return parsed.success ? parsed.data : DEFAULT_ROUTING;
}

export async function getOrgConfig(): Promise<OrgConfig | null> {
  const parsed = orgConfigSchema.safeParse(await read("org"));
  return parsed.success ? parsed.data : null;
}
