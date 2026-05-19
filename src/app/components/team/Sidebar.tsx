"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoutButton } from "../Logout";
import {
  BarChart,
  Boxes,
  Clock,
  ColumnsSettingsIcon,
  CreditCard,
  FileText,
  FolderKanban,
  LucideIcon,
  Presentation,
  Receipt,
  Server,
  Settings,
  SquareUserRound,
  Truck,
  UsersIcon,
} from "lucide-react";

import { LayoutDashboard, Users, User2, Menu, X } from "lucide-react";
import { Logo } from "../../../../public/AntaresLogo";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

const adminNavLinks = [
  { href: "/users", label: "Users", icon: UsersIcon },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function SidebarLayout({
  children,
  isSuperAdmin,
}: {
  children: React.ReactNode;
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function NavLink({
    href,
    label,
    icon: Icon,
    onClick,
  }: {
    href: string;
    label: string;
    icon: LucideIcon;
    onClick?: () => void;
  }) {
    const active = pathname === href;
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
        {label}
      </Link>
    );
  }

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
        <Logo subtitle="Call One, Inc" />
      </header>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setOpen(false)}
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
          <div>
            <Logo subtitle="Call One, Inc" />
          </div>
          <button
            onClick={() => setOpen(false)}
            className="md:hidden w-8 h-8 rounded-xl bg-surface2 flex items-center justify-center text-muted hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-scroll">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} onClick={() => setOpen(false)} />
          ))}
        </nav>

        {/* Admin section */}
        {isSuperAdmin && (
          <div className="px-4 py-4 space-y-1 border-t border-surface2">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-muted px-3 mb-2">
              Admin
            </p>
            {adminNavLinks.map((item) => (
              <NavLink
                key={item.href}
                {...item}
                onClick={() => setOpen(false)}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-4 space-y-1 border-t border-surface2">
          <NavLink
            href="/profile"
            label="Profile"
            icon={User2}
            onClick={() => setOpen(false)}
          />
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
