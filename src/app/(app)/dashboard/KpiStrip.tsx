"use client";
import { useState, useCallback } from "react";
import { useSSE } from "@/hooks/useSSE";
import { AlertTriangle, Cpu, Timer } from "lucide-react";
import { TicketIcon } from "lucide-react";

interface KpiData {
  activeAlerts: number;
  openTickets: number;
  devicesOnline: number;
  devicesTotal: number;
  slaAtRisk: number;
}

export function KpiStrip({ initial }: { initial: KpiData }) {
  const [kpis, setKpis] = useState(initial);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/kpis");
      const json = await res.json();
      if (json.success) setKpis(json.data);
    } catch { /* Silently ignore */ }
  }, []);

  useSSE("kpi_updated", refresh);
  useSSE("alert_created", refresh);
  useSSE("alert_resolved", refresh);
  useSSE("ticket_opened", refresh);
  useSSE("ticket_updated", refresh);

  const cards = [
    { label: "Active Alerts", value: kpis.activeAlerts, icon: AlertTriangle, urgent: kpis.activeAlerts > 0 },
    { label: "Open Tickets", value: kpis.openTickets, icon: TicketIcon, urgent: false },
    { label: "Devices Online", value: `${kpis.devicesOnline} / ${kpis.devicesTotal}`, icon: Cpu, urgent: kpis.devicesOnline < kpis.devicesTotal },
    { label: "SLA at Risk", value: kpis.slaAtRisk, icon: Timer, urgent: kpis.slaAtRisk > 0 },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`bg-white rounded-2xl border p-5 flex flex-col gap-1 ${
            card.urgent ? "border-red-200 bg-red-50" : "border-surface2"
          }`}
        >
          <div className="flex items-center gap-2 text-muted text-sm">
            <card.icon className="w-4 h-4" />
            {card.label}
          </div>
          <p className={`text-3xl font-bold tabular-nums ${card.urgent ? "text-red-600" : "text-foreground"}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
