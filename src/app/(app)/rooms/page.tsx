import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { RoomsClient } from "./RoomsClient";

export default async function RoomsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        include: {
          rooms: {
            orderBy: { name: "asc" },
            include: {
              devices: { select: { id: true, status: true } },
              _count: { select: { alerts: { where: { status: "ACTIVE" } } } },
            },
          },
        },
      },
    },
  });

  const initialCustomers = customers.map((c) => ({
    id: c.id,
    name: c.name,
    sites: c.sites.map((s) => ({
      id: s.id,
      name: s.name,
      city: s.city,
      state: s.state,
      rooms: s.rooms.map((r) => ({
        id: r.id,
        name: r.name,
        totalDevices: r.devices.length,
        onlineDevices: r.devices.filter((d) => d.status === "online").length,
        activeAlerts: r._count.alerts,
      })),
    })),
  }));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-foreground">Rooms</h1>
      </div>
      <RoomsClient initialCustomers={initialCustomers} />
    </div>
  );
}
