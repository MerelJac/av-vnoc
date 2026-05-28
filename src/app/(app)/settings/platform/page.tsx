import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Platform } from "@prisma/client";

const PLATFORM_LABELS: Record<Platform, string> = {
  POLY_LENS: "Poly Lens",
  YEALINK_YMCS: "Yealink YMCS",
  NEAT_PULSE: "Neat Pulse",
  LOGITECH_SYNC: "Logitech Sync",
  CISCO_CONTROL_HUB: "Cisco Control Hub",
  UTELOGY: "Utelogy",
};

export default async function PlatformSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");

  const credentials = await prisma.platformCredential.findMany({
    orderBy: { platform: "asc" },
  });

  const configuredPlatforms = new Set(credentials.map((c) => c.platform));

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-2">Platform Settings</h1>
      <p className="text-muted mb-6">
        Manage API credentials for integrated vendor platforms. Changes take effect on the next sync cycle.
      </p>
      <div className="space-y-4">
        {(["POLY_LENS", "YEALINK_YMCS"] as Platform[]).map((platform) => {
          const cred = credentials.find((c) => c.platform === platform);
          return (
            <div key={platform} className="bg-white rounded-2xl border border-surface2 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground">{PLATFORM_LABELS[platform]}</h2>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    configuredPlatforms.has(platform)
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-muted"
                  }`}
                >
                  {configuredPlatforms.has(platform) ? "Configured" : "Not configured"}
                </span>
              </div>
              <p className="text-sm text-muted">
                Credential management UI coming in Plan 05.
                {cred?.config &&
                  ` Last polled: ${(cred.config as Record<string, unknown>).lastPolledAt ?? "never"}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
