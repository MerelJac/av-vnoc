"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TopNav } from "./TopNav";
import { AppSidebar } from "./AppSidebar";
import { VnocRole } from "@prisma/client";

interface Customer {
  id: string;
  name: string;
}

export default function SidebarLayout({
  children,
  isSuperAdmin,
  customers,
  totalCustomers,
  myQueueCount,
  userInitials,
  userName,
  configuredPlatforms,
}: {
  children: React.ReactNode;
  isSuperAdmin?: boolean;
  vnocRole?: VnocRole | null;
  customers: Customer[];
  totalCustomers: number;
  myQueueCount: number;
  userInitials: string;
  userName: string;
  configuredPlatforms?: string[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Navigating closes the mobile drawer
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav
        userInitials={userInitials}
        userName={userName}
        onMenuClick={() => setDrawerOpen((open) => !open)}
      />
      <div className="flex flex-1 min-h-0">
        <AppSidebar
          customers={customers}
          totalCustomers={totalCustomers}
          myQueueCount={myQueueCount}
          isSuperAdmin={isSuperAdmin}
          configuredPlatforms={configuredPlatforms}
          open={drawerOpen}
        />
        {drawerOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 sm:hidden"
            aria-hidden="true"
            onClick={() => setDrawerOpen(false)}
          />
        )}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-x-hidden overflow-y-auto bg-[#f0f2f8] p-6 pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
