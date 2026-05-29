import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Platform, Prisma } from "@prisma/client";

function maskSecret(value: string | null): string | null {
  if (!value) return null;
  return "••••••••";
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
      Object.entries(rawConfig).filter(
        ([k]) => k !== "accessToken" && k !== "tokenExpiresAt",
      ),
    );

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

  // If credentials are being rotated, invalidate any cached access token
  if ("clientId" in updateData || "clientSecret" in updateData) {
    // Read existing config to preserve other fields (like tenantId)
    const existing = await prisma.platformCredential.findUnique({
      where: { platform },
      select: { config: true },
    });
    const existingConfig = (existing?.config as Record<string, unknown>) ?? {};
    const { accessToken: _a, tokenExpiresAt: _t, ...remainingConfig } = existingConfig;
    updateData.config = remainingConfig as Record<string, unknown>;
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
