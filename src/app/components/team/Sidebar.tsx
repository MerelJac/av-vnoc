"use client";
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
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopNav userInitials={userInitials} userName={userName} />
      <div className="flex flex-1 min-h-0">
        <AppSidebar
          customers={customers}
          totalCustomers={totalCustomers}
          myQueueCount={myQueueCount}
          isSuperAdmin={isSuperAdmin}
          configuredPlatforms={configuredPlatforms}
        />
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-x-hidden overflow-y-auto bg-[#f0f2f8] p-6 pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
