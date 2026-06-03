import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSettings } from "@/lib/vnoc-access";
import { getOrgConfig, getSlaConfig, getRoutingConfig, setAppConfig } from "@/lib/app-config";
import {
  orgConfigSchema,
  slaConfigSchema,
  routingConfigSchema,
} from "@/lib/settings-schemas";
import type { ZodTypeAny } from "zod";

const DOMAIN_SCHEMAS: Record<string, ZodTypeAny> = {
  org: orgConfigSchema,
  sla: slaConfigSchema,
  routing: routingConfigSchema,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [org, sla, routing] = await Promise.all([getOrgConfig(), getSlaConfig(), getRoutingConfig()]);
  return NextResponse.json({ success: true, data: { org, sla, routing } });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageSettings(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { domain, value } = (raw ?? {}) as { domain?: string; value?: unknown };
  if (!domain || !(domain in DOMAIN_SCHEMAS)) {
    return NextResponse.json({ error: "Unknown settings domain" }, { status: 400 });
  }

  const parsed = DOMAIN_SCHEMAS[domain].safeParse(value);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await setAppConfig(domain, parsed.data);
    await prisma.activityLog.create({
      data: {
        type: "settings_updated",
        userId: session.user.id,
        message: `Updated ${domain} settings`,
        meta: { domain },
      },
    });
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (err) {
    console.error("Failed to update settings:", err);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
