"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "../Logout";
import { VnocRole } from "@prisma/client";
import {
  AlertTriangle,
  Building2,
  Cpu,
  DoorOpen,
  LayoutDashboard,
  ListTodo,
  Menu,
  Radio,
  Settings,
  User2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { LucideIcon } from "lucide-react";

function BrandLogo() {
  return (
    <div className="flex flex-col">
      <span className="text-sm font-bold text-foreground leading-tight">VNOC</span>
      <span className="text-[10px] text-muted">Call One, Inc</span>
    </div>
  );
}

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
  onClick,
}: NavItem & { onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? "bg-secondary-color/10 text-secondary-color border border-secondary-color/20"
          : "text-muted hover:text-foreground hover:bg-surface2 border border-transparent"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest uppercase text-muted px-3 mb-1 mt-4 first:mt-0">
      {label}
    </p>
  );
}

function DataSourceIndicator({ label, healthy }: { label: string; healthy: boolean }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 text-sm text-muted">
      <Radio className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      <span
        className={`w-2 h-2 rounded-full ${healthy ? "bg-green-500" : "bg-red-400"}`}
        title={healthy ? "Connected" : "Disconnected"}
      />
    </div>
  );
}

export default function SidebarLayout({
  children,
  isSuperAdmin,
  vnocRole,
}: {
  children: React.ReactNode;
  isSuperAdmin?: boolean;
  vnocRole?: VnocRole | null;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const canSeeCustomers = isSuperAdmin || vnocRole === "MANAGER" || vnocRole === "TIER2";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 h-14 bg-background/95 backdrop-blur-md border-b border-surface2 z-40 flex items-center px-4">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-xl bg-surface2 flex items-center justify-center text-muted hover:text-foreground transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>
        <BrandLogo />
      </header>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50
          w-64 bg-surface border-r border-surface2 flex flex-col
          transform transition-transform duration-200
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:sticky md:top-0 md:translate-x-0 md:h-screen
        `}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-surface2 flex items-center justify-between">
          <BrandLogo />
          <button
            onClick={close}
            className="md:hidden w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center text-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 overflow-y-auto space-y-0.5">
          <NavLink href="/dashboard" label="Dashboard" icon={LayoutDashboard} onClick={close} />

          <SectionLabel label="Live Operations" />
          <NavLink href="/tickets?queue=mine" label="My Queue" icon={ListTodo} onClick={close} />
          <NavLink href="/alerts" label="All Alerts" icon={AlertTriangle} onClick={close} />
          <NavLink href="/tickets" label="All Tickets" icon={Zap} onClick={close} />

          <SectionLabel label="Assets" />
          <NavLink href="/rooms" label="Rooms" icon={DoorOpen} onClick={close} />
          <NavLink href="/devices" label="Devices" icon={Cpu} onClick={close} />

          {canSeeCustomers && (
            <>
              <SectionLabel label="Customers" />
              <NavLink href="/customers" label="Customers" icon={Building2} onClick={close} />
            </>
          )}

          <SectionLabel label="Data Sources" />
          <DataSourceIndicator label="Poly Lens" healthy={true} />
          <DataSourceIndicator label="Yealink YMCS" healthy={true} />
        </nav>

        {isSuperAdmin && (
          <div className="px-4 py-4 space-y-0.5 border-t border-surface2">
            <SectionLabel label="Admin" />
            <NavLink href="/users" label="Users" icon={Users} onClick={close} />
            <NavLink href="/settings/platform" label="Platform Settings" icon={Settings} onClick={close} />
          </div>
        )}

        <div className="px-4 py-4 space-y-0.5 border-t border-surface2">
          <NavLink href="/profile" label="Profile" icon={User2} onClick={close} />
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6 pt-20 md:pt-6 overflow-y-auto bg-[#F7F6F3]">
        {children}
      </main>
    </div>
  );
}
