"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";

interface KpiData {
  activeAlerts: number;
  openTickets: number;
  slaAtRisk: number;
  severityMap: Record<string, number>;
  roomsOnline: number;
  roomsTotal: number;
  mttrMinutes: number | null;
  slaCompliance: number | null;
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</p>
      {children}
    </div>
  );
}

export function KpiStrip({ initial }: { initial: KpiData }) {
  const [kpis, setKpis] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/kpis");
      const json = await res.json();
      if (json.success) setKpis(json.data);
    } catch { /* silent */ }
  }, []);

  useSSE("kpi_updated", refresh);
  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);
  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  const roomPct =
    kpis.roomsTotal > 0
      ? ((kpis.roomsOnline / kpis.roomsTotal) * 100).toFixed(1)
      : "—";

  const slaBar = kpis.slaCompliance ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Critical Alerts */}
      <Card label="Critical Alerts">
        <p className={`text-[26px] font-extrabold leading-none mb-2 ${kpis.activeAlerts > 0 ? "text-red-600" : "text-gray-800"}`}>
          {kpis.activeAlerts}
        </p>
        <div className="flex flex-wrap gap-1">
          {(["CRITICAL", "HIGH", "MEDIUM"] as const).map((sev) => {
            const count = kpis.severityMap[sev] ?? 0;
            if (count === 0) return null;
            const cls =
              sev === "CRITICAL"
                ? "bg-red-100 text-red-700"
                : sev === "HIGH"
                ? "bg-orange-100 text-orange-700"
                : "bg-yellow-100 text-yellow-700";
            return (
              <span key={sev} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>
                {count} {sev === "CRITICAL" ? "CRIT" : sev === "HIGH" ? "HIGH" : "MED"}
              </span>
            );
          })}
          {kpis.activeAlerts === 0 && (
            <span className="text-[11px] text-green-600 font-medium">All clear</span>
          )}
        </div>
      </Card>

      {/* Open Tickets */}
      <Card label="Open Tickets">
        <p className="text-[26px] font-extrabold leading-none text-gray-800 mb-2">{kpis.openTickets}</p>
        {kpis.slaAtRisk > 0 ? (
          <p className="text-[11px] font-semibold text-orange-500">{kpis.slaAtRisk} breaching SLA</p>
        ) : (
          <p className="text-[11px] font-semibold text-green-600">All on track</p>
        )}
      </Card>

      {/* Rooms Online */}
      <Card label="Rooms Online">
        <p className="text-[26px] font-extrabold leading-none text-blue-600 mb-2">{roomPct}%</p>
        <p className="text-[11px] text-gray-400">{kpis.roomsOnline} / {kpis.roomsTotal} rooms</p>
      </Card>

      {/* MTTR */}
      <Card label="MTTR (24h)">
        <p className="text-[26px] font-extrabold leading-none text-gray-800 mb-2">
          {kpis.mttrMinutes != null ? `${kpis.mttrMinutes}m` : "—"}
        </p>
        <div className="flex items-end gap-[3px] h-5">
          {[8, 14, 10, 18, 12, 20, 9].map((h, i) => (
            <div
              key={i}
              className={`w-[5px] rounded-sm ${i === 5 ? "bg-[#90d5ff]" : "bg-blue-100"}`}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
      </Card>

      {/* SLA Compliance */}
      <Card label="SLA Compliance (30d)">
        <p className={`text-[26px] font-extrabold leading-none mb-2 ${slaBar >= 95 ? "text-green-600" : slaBar >= 80 ? "text-orange-500" : "text-red-600"}`}>
          {kpis.slaCompliance != null ? `${kpis.slaCompliance}%` : "—"}
        </p>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${slaBar >= 95 ? "bg-green-500" : slaBar >= 80 ? "bg-orange-400" : "bg-red-500"}`}
            style={{ width: `${Math.min(slaBar, 100)}%` }}
          />
        </div>
      </Card>
    </div>
  );
}
