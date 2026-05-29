interface StatCardProps {
  value: number | string;
  label: string;
  valueColor?: string;
}

export function StatCard({ value, label, valueColor = "text-foreground" }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg px-4 py-3 flex-1 min-w-0">
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{label}</div>
    </div>
  );
}
