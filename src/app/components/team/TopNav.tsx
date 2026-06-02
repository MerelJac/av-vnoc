"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const NAV_LINKS = [
  { label: "Overview", href: "/dashboard" },
  { label: "Alerts", href: "/alerts" },
  { label: "Tickets", href: "/tickets" },
  { label: "Rooms", href: "/rooms" },
  { label: "Devices", href: "/devices" },
  { label: "Customers", href: "/customers" },
  { label: "Reports", href: null },
] as const;

interface TopNavProps {
  userInitials: string;
  userName: string;
  onMenuClick: () => void;
}

export function TopNav({ userInitials, userName, onMenuClick }: TopNavProps) {
  const pathname = usePathname();

  return (
    <header className="shrink-0 z-40 flex items-center h-[52px] bg-[#0f1347] border-b border-[#1e2a6e]/60 px-5">
      {/* Brand */}
      <div className="flex flex-col min-w-[210px]">
        <span className="text-[15px] font-extrabold tracking-wide text-white font-orbitron leading-none">
          Call One <span className="text-[#90d5ff]">VNOC</span>
        </span>
        <span className="text-[9px] font-semibold tracking-[1.4px] uppercase text-[#4a5568] mt-0.5">
          Operations Dashboard
        </span>
      </div>

      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="sm:hidden ml-2 w-8 h-8 flex items-center justify-center text-[#8892b0] hover:text-white transition-colors"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Center nav */}
      <nav className="hidden sm:flex flex-1 items-center justify-center gap-1">
        {NAV_LINKS.map(({ label, href }) => {
          if (!href) {
            return (
              <span
                key={label}
                className="px-3.5 py-1.5 text-[12.5px] font-medium text-[#4a5568] cursor-default select-none rounded-md"
              >
                {label}
              </span>
            );
          }
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={label}
              href={href}
              className={`px-3.5 py-1.5 text-[12.5px] font-medium rounded-md transition-colors border-b-2 ${
                active
                  ? "text-white border-[#90d5ff]"
                  : "text-[#8892b0] border-transparent hover:text-white hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right — user */}
      <div className="flex items-center gap-2.5 min-w-[210px] justify-end">
        <span className="hidden sm:block text-[12px] text-[#8892b0]">{userName}</span>
        <div className="w-8 h-8 rounded-full bg-[#1e2a6e] border border-[#90d5ff]/40 flex items-center justify-center text-[11px] font-bold text-[#90d5ff] font-orbitron select-none">
          {userInitials}
        </div>
      </div>
    </header>
  );
}
