"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "../Logout";

const DATA_SOURCES: { label: string; platform: string | null }[] = [
  { label: "Poly Lens", platform: "POLY_LENS" },
  { label: "Yealink YMCS", platform: "YEALINK_YMCS" },
  { label: "Neat Pulse", platform: "NEAT_PULSE" },
  { label: "Logitech Sync", platform: "LOGITECH_SYNC" },
  { label: "Cisco Control Hub", platform: "CISCO_CONTROL_HUB" },
  { label: "ServiceNow", platform: null },
  { label: "Utelogy", platform: "UTELOGY" },
];

interface Customer {
  id: string;
  name: string;
}

interface AppSidebarProps {
  customers: Customer[];
  totalCustomers: number;
  myQueueCount: number;
  isSuperAdmin?: boolean;
  configuredPlatforms?: string[];
  /** Mobile drawer state — ignored at sm+ where the sidebar is always in-flow. */
  open?: boolean;
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold tracking-[1.4px] uppercase text-[#4a5568] px-2 mb-1.5 mt-4 first:mt-0">
      {label}
    </p>
  );
}

function SidebarLink({
  href,
  label,
  badge,
  disabled,
  onClick,
}: {
  href: string;
  label: string;
  badge?: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = !disabled && (pathname === href || (href !== "/dashboard" && pathname.startsWith(href)));

  if (disabled) {
    return (
      <span className="flex items-center gap-2 px-2.5 py-[6px] rounded-md text-[12.5px] font-medium text-[#4a5568] cursor-default select-none">
        {label}
      </span>
    );
  }

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2 px-2.5 py-[6px] rounded-md text-[12.5px] font-medium transition-colors border-l-2 ${
        active
          ? "bg-[#90d5ff]/10 border-[#90d5ff] text-white"
          : "border-transparent text-[#c8d0e0] hover:bg-white/5 hover:text-white"
      }`}
    >
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function AppSidebar({
  customers,
  totalCustomers,
  myQueueCount,
  isSuperAdmin,
  configuredPlatforms,
  open = false,
}: AppSidebarProps) {
  const extraCustomers = totalCustomers - customers.length;

  return (
    <aside
      className={`w-[220px] shrink-0 bg-[#0a0e2e] border-r border-[#1e2a6e] flex flex-col
        fixed inset-y-0 left-0 z-40 transition-transform duration-200
        ${open ? "translate-x-0" : "-translate-x-full"}
        sm:static sm:h-full sm:translate-x-0 sm:transition-none`}
    >
        {/* Nav */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-0.5">
          <SectionLabel label="Live Operations" />
          <SidebarLink href="/tickets?queue=mine" label="My Queue" badge={myQueueCount} />
          <SidebarLink href="/alerts" label="All Alerts" />
          <SidebarLink href="/tickets" label="All Tickets" />
          <SidebarLink href="/sites" label="Sites" disabled />
          <SidebarLink href="/rooms" label="Rooms" />
          <SidebarLink href="/devices" label="Devices" />

          <SectionLabel label="Customers" />
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/customers`}
              className="flex items-center gap-2 px-2.5 py-[5px] rounded-md text-[12px] text-[#c8d0e0] hover:text-white hover:bg-white/5 transition-colors truncate"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#4a5568] flex-shrink-0" />
              <span className="truncate">{c.name}</span>
            </Link>
          ))}
          {extraCustomers > 0 && (
            <Link
              href="/customers"
              className="px-2.5 py-[5px] text-[11px] text-[#90d5ff] hover:text-white transition-colors block"
            >
              +{extraCustomers} more →
            </Link>
          )}

          <SectionLabel label="Data Sources" />
          {DATA_SOURCES.map(({ label, platform }) => {
            const configured = Array.isArray(configuredPlatforms) ? configuredPlatforms : [];
            const connected = platform !== null && configured.includes(platform);
            return (
              <div key={label} className="flex items-center gap-2 px-2.5 py-[5px] text-[12px]">
                <span className={`flex-1 truncate ${connected ? "text-[#c8d0e0]" : "text-[#4a5568]"}`}>
                  {label}
                </span>
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    connected ? "bg-green-400" : "bg-[#2d3a5e]"
                  }`}
                />
              </div>
            );
          })}

          {isSuperAdmin && (
            <>
              <SectionLabel label="Admin" />
              <SidebarLink href="/users" label="Users" />
              <SidebarLink href="/settings" label="Platform Settings" />
            </>
          )}
        </nav>

        {/* Bottom */}
        <div className="shrink-0 px-3 pb-4 pt-2 border-t border-[#1e2a6e] space-y-0.5">
          <SidebarLink href="/profile" label="Profile" />
          <LogoutButton />
        </div>
    </aside>
  );
}
