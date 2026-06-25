"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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
  {
    id: "UTELOGY",
    label: "Utelogy",
    credFields: [{ key: "apiKey", label: "API Key", type: "password" as const }],
    configFields: [
      {
        key: "baseUrl",
        label: "Instance Base URL (https://<tenant>.utelogy.com)",
        type: "text" as const,
      },
    ],
  },
  {
    id: "LOGITECH_SYNC",
    label: "Logitech Sync",
    note: "Generate the certificate in Sync Portal → Settings → Sync Cloud API. A Sync account supports at most two certificates at a time — revoke an old one there if generation fails.",
    credFields: [],
    configFields: [
      { key: "orgId", label: "Org ID (from the Sync Portal)", type: "text" as const },
      {
        key: "apiServer",
        label: "API Server (optional — defaults to https://api.sync.logitech.com/v1)",
        type: "text" as const,
      },
      {
        key: "certPem",
        label: "Client Certificate (PEM — leave blank to keep the saved one)",
        type: "textarea" as const,
      },
      {
        key: "keyPem",
        label: "Private Key (PEM — write-only, leave blank to keep the saved one)",
        type: "textarea" as const,
      },
    ],
  },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

// Config keys the server never returns (write-only mTLS material). When set,
// the GET response signals their presence via `config.hasCert` instead.
const SECRET_CONFIG_KEYS = new Set(["certPem", "keyPem"]);

interface FieldValues {
  creds: Record<string, string>;
  config: Record<string, string>;
}

interface IntegrationRecord {
  platform: string;
  clientId: string | null;
  clientSecret: string | null;
  apiKey: string | null;
  webhookSecret: string | null;
  config: Record<string, unknown> | null;
}

interface SyncResult {
  synced: number;
  errors: string[];
}

/** Build prefilled form values + saved/connected state from one GET record. */
function deriveFromRecord(rec: IntegrationRecord) {
  const def = PLATFORMS.find((p) => p.id === rec.platform);
  if (!def) return null;

  const config = (rec.config as Record<string, unknown>) ?? {};
  const creds: Record<string, string> = {};
  const configValues: Record<string, string> = {};
  const savedSecrets = new Set<string>();

  for (const field of def.credFields) {
    const value = rec[field.key as "clientId" | "clientSecret" | "apiKey" | "webhookSecret"];
    if (field.type === "password") {
      if (value) savedSecrets.add(field.key); // masked value means it's stored
    } else if (typeof value === "string") {
      creds[field.key] = value; // non-secret (clientId) returned in the clear
    }
  }

  for (const field of def.configFields) {
    if (SECRET_CONFIG_KEYS.has(field.key)) {
      if (config.hasCert) savedSecrets.add(field.key);
    } else if (typeof config[field.key] === "string") {
      configValues[field.key] = config[field.key] as string;
    }
  }

  const connected = Boolean(
    rec.clientId || rec.clientSecret || rec.apiKey || rec.webhookSecret || config.hasCert
  );

  return {
    platform: rec.platform,
    values: { creds, config: configValues } satisfies FieldValues,
    savedSecrets: Array.from(savedSecrets),
    connected,
  };
}

export function SettingsClient() {
  const [saving, setSaving] = useState<PlatformId | null>(null);
  const [saved, setSaved] = useState<PlatformId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FieldValues>>({});
  const [savedSecrets, setSavedSecrets] = useState<Record<string, string[]>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing credentials so configured platforms show their non-secret
  // values and a "connected" indicator instead of an empty form.
  const loadIntegrations = useCallback(async (onlyPlatform?: PlatformId) => {
    try {
      const res = await fetch("/api/integrations");
      if (!res.ok) throw new Error("Failed to load saved credentials");
      const json = (await res.json()) as { data?: IntegrationRecord[] };
      const records = Array.isArray(json.data) ? json.data : [];

      const derived = records
        .map(deriveFromRecord)
        .filter((d): d is NonNullable<ReturnType<typeof deriveFromRecord>> => d !== null);

      setSavedSecrets((prev) => {
        const next = { ...prev };
        for (const d of derived) next[d.platform] = d.savedSecrets;
        return next;
      });
      setConnected((prev) => {
        const next = { ...prev };
        for (const d of derived) next[d.platform] = d.connected;
        return next;
      });
      setValues((prev) => {
        // On a targeted refresh (after save) only replace that platform's
        // values so unsaved edits in other cards survive.
        if (onlyPlatform) {
          const d = derived.find((x) => x.platform === onlyPlatform);
          return d ? { ...prev, [onlyPlatform]: d.values } : prev;
        }
        const next = { ...prev };
        for (const d of derived) next[d.platform] = d.values;
        return next;
      });
    } catch (err) {
      // Non-fatal: the form is still usable for fresh entry.
      setError(err instanceof Error ? err.message : "Failed to load saved credentials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

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
      // Refresh just this platform to reflect newly-saved secrets/connection.
      await loadIntegrations(platformId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(null);
    }
  }

  async function onSync() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await fetch("/api/integrations/sync", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; synced?: number; errors?: string[]; error?: string };
      if (!res.ok || data.ok === false) {
        throw new Error(data.error ?? "Sync failed");
      }
      setSyncResult({ synced: data.synced ?? 0, errors: data.errors ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function secretPlaceholder(platformId: string, fieldKey: string, type: string): string {
    const isSaved = (savedSecrets[platformId] ?? []).includes(fieldKey);
    if (isSaved) return "•••••••• saved — leave blank to keep";
    return type === "password" ? "••••••••" : "";
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Platform Credentials</h1>
        <p className="text-sm text-gray-500 mt-1">
          Credentials are stored in the database. Secret fields are masked after saving —
          leave a saved secret blank to keep its current value.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sync devices — verifies the saved credentials actually reach each vendor. */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Test connection</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Run a device sync across all configured platforms to confirm credentials work.
            </p>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className="shrink-0 rounded-md bg-gray-900 hover:bg-black disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {syncing ? "Syncing…" : "Sync devices now"}
          </button>
        </div>
        {syncResult && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              syncResult.errors.length > 0
                ? "bg-amber-50 border border-amber-200 text-amber-800"
                : "bg-green-50 border border-green-200 text-green-800"
            }`}
          >
            <p className="font-medium">Synced {syncResult.synced} device{syncResult.synced === 1 ? "" : "s"}.</p>
            {syncResult.errors.length > 0 && (
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {syncResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {PLATFORMS.map((platform) => {
        const isConnected = connected[platform.id] ?? false;
        return (
        <div
          key={platform.id}
          className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">{platform.label}</h2>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                isConnected ? "text-green-700" : "text-gray-400"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-300"}`}
              />
              {loading ? "Loading…" : isConnected ? "Connected" : "Not configured"}
            </span>
          </div>
          {"note" in platform && (
            <p className="text-xs text-gray-500 -mt-2">{platform.note}</p>
          )}

          {platform.credFields.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`${platform.id}-${field.key}`}
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {field.label}
              </label>
              <input
                id={`${platform.id}-${field.key}`}
                type={field.type}
                placeholder={
                  field.type === "password"
                    ? secretPlaceholder(platform.id, field.key, field.type)
                    : ""
                }
                value={values[platform.id]?.creds[field.key] ?? ""}
                onChange={(e) => onCredChange(platform.id, field.key, e.target.value)}
                className="w-full rounded-md bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          ))}

          {platform.configFields.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Configuration
              </p>
              {platform.configFields.map((field) => (
                <div key={field.key} className="mb-3">
                  <label
                    htmlFor={`${platform.id}-${field.key}`}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    {field.label}
                  </label>
                  {field.type === "textarea" ? (
                    <textarea
                      id={`${platform.id}-${field.key}`}
                      rows={4}
                      placeholder={secretPlaceholder(platform.id, field.key, "textarea")}
                      value={values[platform.id]?.config[field.key] ?? ""}
                      onChange={(e) => onConfigChange(platform.id, field.key, e.target.value)}
                      className="w-full rounded-md bg-white border border-gray-300 px-3 py-2 text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  ) : (
                    <input
                      id={`${platform.id}-${field.key}`}
                      type={field.type}
                      placeholder=""
                      value={values[platform.id]?.config[field.key] ?? ""}
                      onChange={(e) => onConfigChange(platform.id, field.key, e.target.value)}
                      className="w-full rounded-md bg-white border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => onSave(platform.id)}
            disabled={saving === platform.id}
            className="rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white transition-colors"
          >
            {saving === platform.id ? "Saving…" : saved === platform.id ? "Saved ✓" : "Save"}
          </button>
        </div>
        );
      })}
    </div>
  );
}
