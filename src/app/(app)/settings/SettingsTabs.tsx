"use client";

import { useState } from "react";
import Link from "next/link";
import { OrgSettingsForm } from "./OrgSettingsForm";
import { SlaRoutingForm } from "./SlaRoutingForm";
import { SettingsClient } from "./SettingsClient";
import type { OrgConfig, SlaConfig, RoutingConfig } from "@/lib/settings-schemas";

const TABS = [
  { id: "organization", label: "Organization" },
  { id: "sla", label: "SLA & Routing" },
  { id: "integrations", label: "Integrations" },
  { id: "users", label: "Users" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface SettingsTabsProps {
  org: OrgConfig | null;
  sla: SlaConfig;
  routing: RoutingConfig;
  defaultTab?: string;
}

export function SettingsTabs({ org, sla, routing, defaultTab }: SettingsTabsProps) {
  const initial = TABS.some((t) => t.id === defaultTab) ? (defaultTab as TabId) : "organization";
  const [tab, setTab] = useState<TabId>(initial);

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>

      <div className="flex gap-1 border-b border-surface2 mb-6">
        {TABS.map((t) =>
          t.id === "users" ? (
            <Link
              key={t.id}
              href="/users"
              className="px-4 py-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              {t.label} ↗
            </Link>
          ) : (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-blue-600 text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ),
        )}
      </div>

      {tab === "organization" && <OrgSettingsForm initial={org} />}
      {tab === "sla" && <SlaRoutingForm initialSla={sla} initialRouting={routing} />}
      {tab === "integrations" && <SettingsClient />}
    </div>
  );
}
