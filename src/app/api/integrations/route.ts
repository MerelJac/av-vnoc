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

  const masked = credentials.map((c) => ({
    ...c,
    clientSecret: maskSecret(c.clientSecret),
    apiKey: maskSecret(c.apiKey),
    webhookSecret: maskSecret(c.webhookSecret),
  }));

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

  const updateData = {
    clientId: body.clientId ?? null,
    clientSecret: body.clientSecret ?? null,
    apiKey: body.apiKey ?? null,
    webhookSecret: body.webhookSecret ?? null,
    ...(body.config !== undefined && { config: body.config as Prisma.InputJsonValue }),
  };

  await prisma.platformCredential.upsert({
    where: { platform },
    update: updateData,
    create: { platform, ...updateData },
  });

  return NextResponse.json({ success: true });
}
