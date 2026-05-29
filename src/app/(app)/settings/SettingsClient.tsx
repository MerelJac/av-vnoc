"use client";

import { useState, useRef } from "react";

const PLATFORMS = [
  {
    id: "POLY_LENS",
    label: "Poly Lens",
    credFields: [
      { key: "clientId", label: "Client ID", type: "text" as const },
      { key: "clientSecret", label: "Client Secret", type: "password" as const },
    ],
    configFields: [
      { key: "tenantId", label: "Tenant ID (from Admin Portal → Account Settings)", type: "text" as const },
    ],
  },
  {
    id: "YEALINK_YMCS",
    label: "Yealink YMCS",
    credFields: [
      { key: "clientId", label: "Client ID", type: "text" as const },
      { key: "clientSecret", label: "Client Secret", type: "password" as const },
      { key: "webhookSecret", label: "Webhook Verification Token (from YMCS event subscription)", type: "password" as const },
    ],
    configFields: [
      { key: "region", label: "Region (us / eu / au)", type: "text" as const },
    ],
  },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

interface FieldValues {
  creds: Record<string, string>;
  config: Record<string, string>;
}

export function SettingsClient() {
  const [saving, setSaving] = useState<PlatformId | null>(null);
  const [saved, setSaved] = useState<PlatformId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FieldValues>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onCredChange(platform: string, field: string, value: string) {
    setValues((prev) => ({
      ...prev,
      [platform]: {
        creds: { ...(prev[platform]?.creds ?? {}), [field]: value },
        config: prev[platform]?.config ?? {},
      },
    }));
  }

  function onConfigChange(platform: string, field: string, value: string) {
    setValues((prev) => ({
      ...prev,
      [platform]: {
        creds: prev[platform]?.creds ?? {},
        config: { ...(prev[platform]?.config ?? {}), [field]: value },
      },
    }));
  }

  async function onSave(platformId: PlatformId) {
    setSaving(platformId);
    setError(null);
    setSaved(null);

    const platformValues = values[platformId];
    const creds = platformValues?.creds ?? {};
    const nonEmptyCreds = Object.fromEntries(
      Object.entries(creds).filter(([, v]) => v !== "")
    );

    const config = platformValues?.config ?? {};
    const nonEmptyConfig = Object.fromEntries(
      Object.entries(config).filter(([, v]) => v !== "")
    );

    const body: Record<string, unknown> = {
      platform: platformId,
      ...nonEmptyCreds,
      ...(Object.keys(nonEmptyConfig).length > 0 ? { config: nonEmptyConfig } : {}),
    };

    try {
      const res = await fetch("/api/integrations", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }

      setSaved(platformId);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-semibold text-white">Platform Credentials</h1>
      <p className="text-sm text-gray-400">
        Credentials are stored in the database. Secret fields are masked after saving.
      </p>

      {error && (
        <div className="rounded bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {PLATFORMS.map((platform) => (
        <div
          key={platform.id}
          className="rounded-lg border border-white/10 bg-white/5 p-6 space-y-4"
        >
          <h2 className="text-lg font-medium text-white">{platform.label}</h2>

          {platform.credFields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
              <input
                type={field.type}
                placeholder={field.type === "password" ? "••••••••" : ""}
                value={values[platform.id]?.creds[field.key] ?? ""}
                onChange={(e) => onCredChange(platform.id, field.key, e.target.value)}
                className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          ))}

          {platform.configFields.length > 0 && (
            <>
              <div className="border-t border-white/10 pt-3">
                <p className="text-xs text-gray-500 mb-3">Configuration</p>
                {platform.configFields.map((field) => (
                  <div key={field.key} className="mb-3">
                    <label className="block text-sm text-gray-400 mb-1">{field.label}</label>
                    <input
                      type={field.type}
                      placeholder=""
                      value={values[platform.id]?.config[field.key] ?? ""}
                      onChange={(e) => onConfigChange(platform.id, field.key, e.target.value)}
                      className="w-full rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => onSave(platform.id)}
            disabled={saving === platform.id}
            className="rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {saving === platform.id ? "Saving…" : saved === platform.id ? "Saved ✓" : "Save"}
          </button>
        </div>
      ))}
    </div>
  );
}
