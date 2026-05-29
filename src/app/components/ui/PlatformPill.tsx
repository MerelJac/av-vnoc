import { Platform } from "@prisma/client";

const LABEL: Partial<Record<Platform, string>> = {
  POLY_LENS: "Poly Lens",
  YEALINK_YMCS: "YMCS",
  NEAT_PULSE: "Neat",
  LOGITECH_SYNC: "Logitech",
  CISCO_CONTROL_HUB: "Cisco",
  UTELOGY: "Utelogy",
};

const STYLE: Partial<Record<Platform, string>> = {
  POLY_LENS: "bg-orange-100 text-orange-700",
  YEALINK_YMCS: "bg-blue-100 text-blue-700",
  NEAT_PULSE: "bg-purple-100 text-purple-700",
  LOGITECH_SYNC: "bg-teal-100 text-teal-700",
  CISCO_CONTROL_HUB: "bg-cyan-100 text-cyan-700",
  UTELOGY: "bg-gray-100 text-gray-600",
};

export function PlatformPill({ platform }: { platform: Platform }) {
  const label = LABEL[platform] ?? platform;
  const style = STYLE[platform] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}
