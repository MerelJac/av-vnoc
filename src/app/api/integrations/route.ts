import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Platform, Prisma } from "@prisma/client";
import { logiConfigSchema } from "@/lib/integrations/logi-config-schema";

// Config keys that must never leave the server: cached OAuth tokens and
// Logitech mTLS cert material (write-only from the settings form).
const CONFIG_SECRET_KEYS = new Set(["accessToken", "tokenExpiresAt", "certPem", "keyPem"]);

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  return "••••••••";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const credentials = await prisma.platformCredential.findMany({
    orderBy: { platform: "asc" },
  });

  const masked = credentials.map((c) => {
    const rawConfig = (c.config as Record<string, unknown>) ?? {};
    const safeConfig = Object.fromEntries(
      Object.entries(rawConfig).filter(([k]) => !CONFIG_SECRET_KEYS.has(k)),
    );
    if (rawConfig.certPem || rawConfig.keyPem) {
      safeConfig.hasCert = true;
    }

    return {
      ...c,
      clientSecret: maskSecret(c.clientSecret),
      apiKey: maskSecret(c.apiKey),
      webhookSecret: maskSecret(c.webhookSecret),
      config: safeConfig,
    };
  });

  return NextResponse.json({ success: true, data: masked });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.user.isSuperAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    platform: string;
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
    webhookSecret?: string;
    config?: Record<string, unknown>;
  };

  if (!body.platform || !Object.values(Platform).includes(body.platform as Platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const platform = body.platform as Platform;

  const updateData: {
    clientId?: string | null;
    clientSecret?: string | null;
    apiKey?: string | null;
    webhookSecret?: string | null;
    config?: Record<string, unknown>;
  } = {};

  if ("clientId" in body) updateData.clientId = body.clientId ?? null;
  if ("clientSecret" in body) updateData.clientSecret = body.clientSecret ?? null;
  if ("apiKey" in body) updateData.apiKey = body.apiKey ?? null;
  if ("webhookSecret" in body) updateData.webhookSecret = body.webhookSecret ?? null;
  if (body.config !== undefined) updateData.config = body.config;

  const rotatingCreds = "clientId" in updateData || "clientSecret" in updateData;
  const isLogiConfigUpdate =
    platform === Platform.LOGITECH_SYNC && body.config !== undefined;
  const isUtelogyConfigUpdate =
    platform === Platform.UTELOGY && body.config !== undefined;

  if (isUtelogyConfigUpdate) {
    const baseUrl = body.config?.baseUrl;
    if (typeof baseUrl !== "string" || !isHttpUrl(baseUrl)) {
      return NextResponse.json(
        { error: "Utelogy requires a valid instance baseUrl (https://<tenant>.utelogy.com)" },
        { status: 400 },
      );
    }
  }

  if (rotatingCreds || isLogiConfigUpdate || isUtelogyConfigUpdate) {
    // Read existing config to preserve other fields (like tenantId / stored certs)
    const existing = await prisma.platformCredential.findUnique({
      where: { platform },
      select: { config: true },
    });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};
    // Rotated credentials invalidate any cached access token
    const { accessToken: _a, tokenExpiresAt: _t, ...remainingConfig } = existingConfig;

    if (isLogiConfigUpdate) {
      // Blank/omitted write-only fields (certPem/keyPem) keep their stored values
      const incoming = Object.fromEntries(
        Object.entries(body.config ?? {}).filter(
          ([, v]) => v !== "" && v !== null && v !== undefined,
        ),
      );
      const parsed = logiConfigSchema.safeParse({ ...remainingConfig, ...incoming });
      if (!parsed.success) {
        const message = parsed.error.issues[0]?.message ?? "Invalid Logitech Sync config";
        return NextResponse.json({ error: message }, { status: 400 });
      }
      updateData.config = parsed.data;
    } else {
      // Preserve any config fields sent alongside the rotation
      updateData.config = { ...remainingConfig, ...(body.config ?? {}) };
    }
  }

  const { config: configValue, ...scalarFields } = updateData;
  const configEntry = configValue !== undefined
    ? { config: configValue as Prisma.InputJsonValue }
    : {};

  await prisma.platformCredential.upsert({
    where: { platform },
    update: { ...scalarFields, ...configEntry },
    create: { platform, ...scalarFields, ...configEntry },
  });

  return NextResponse.json({ success: true });
}
