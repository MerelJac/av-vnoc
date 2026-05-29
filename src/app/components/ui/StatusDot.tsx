interface StatusDotProps {
  status: "online" | "offline" | "warn" | "unknown";
  size?: "sm" | "md";
}

const COLOR: Record<StatusDotProps["status"], string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  warn: "bg-orange-400",
  unknown: "bg-gray-400",
};

export function StatusDot({ status, size = "sm" }: StatusDotProps) {
  const dim = size === "sm" ? "w-2 h-2" : "w-3 h-3";
  return <span className={`inline-block rounded-full flex-shrink-0 ${dim} ${COLOR[status]}`} />;
}
