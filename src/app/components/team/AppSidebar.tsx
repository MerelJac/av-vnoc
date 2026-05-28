"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "../Logout";
import { X } from "lucide-react";

const DATA_SOURCES = [
  "Poly Lens",
  "Yealink YMCS",
  "Neat Pulse",
  "Logitech Sync",
  "Cisco Control Hub",
  "ServiceNow",
  "Utelogy",
];

interface Customer {
  id: string;
  name: string;
}

interface AppSidebarProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  totalCustomers: number;
  myQueueCount: number;
  isSuperAdmin?: boolean;
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
  open,
  onClose,
  customers,
  totalCustomers,
  myQueueCount,
  isSuperAdmin,
}: AppSidebarProps) {
  const extraCustomers = totalCustomers - customers.length;

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 top-[52px]
          w-[220px] bg-[#0a0e2e] border-r border-[#1e2a6e]
          flex flex-col overflow-y-auto
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:sticky md:top-[52px] md:translate-x-0 md:h-[calc(100vh-52px)]
        `}
      >
        {/* Close button (mobile) */}
        <button
          onClick={onClose}
          className="md:hidden absolute top-3 right-3 w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-[#8892b0] hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          <SectionLabel label="Live Operations" />
          <SidebarLink href="/tickets?queue=mine" label="My Queue" badge={myQueueCount} onClick={onClose} />
          <SidebarLink href="/alerts" label="All Alerts" onClick={onClose} />
          <SidebarLink href="/tickets" label="All Tickets" onClick={onClose} />
          <SidebarLink href="/sites" label="Sites" disabled />
          <SidebarLink href="/rooms" label="Rooms" onClick={onClose} />
          <SidebarLink href="/devices" label="Devices" onClick={onClose} />

          <SectionLabel label="Customers" />
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/customers`}
              onClick={onClose}
              className="flex items-center gap-2 px-2.5 py-[5px] rounded-md text-[12px] text-[#c8d0e0] hover:text-white hover:bg-white/5 transition-colors truncate"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#4a5568] flex-shrink-0" />
              <span className="truncate">{c.name}</span>
            </Link>
          ))}
          {extraCustomers > 0 && (
            <Link
              href="/customers"
              onClick={onClose}
              className="px-2.5 py-[5px] text-[11px] text-[#90d5ff] hover:text-white transition-colors block"
            >
              +{extraCustomers} more →
            </Link>
          )}

          <SectionLabel label="Data Sources" />
          {DATA_SOURCES.map((src) => (
            <div key={src} className="flex items-center gap-2 px-2.5 py-[5px] text-[12px] text-[#8892b0]">
              <span className="flex-1 truncate">{src}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            </div>
          ))}

          {isSuperAdmin && (
            <>
              <SectionLabel label="Admin" />
              <SidebarLink href="/users" label="Users" onClick={onClose} />
              <SidebarLink href="/settings/platform" label="Platform Settings" onClick={onClose} />
            </>
          )}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 pt-2 border-t border-[#1e2a6e] space-y-0.5">
          <SidebarLink href="/profile" label="Profile" onClick={onClose} />
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
