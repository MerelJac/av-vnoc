import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/vnoc-access";
import { CustomersClient } from "./CustomersClient";
import type { CustomerNode } from "./types";

export default async function CustomersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!canManageCustomers(session)) redirect("/dashboard");

  const customers = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    include: {
      sites: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, address: true, city: true, state: true,
          lat: true, lng: true, _count: { select: { rooms: true } },
        },
      },
    },
  });

  const initialCustomers: CustomerNode[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    sites: c.sites.map((s) => ({
      id: s.id, name: s.name, address: s.address, city: s.city,
      state: s.state, lat: s.lat, lng: s.lng, roomCount: s._count.rooms,
    })),
  }));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <CustomersClient initialCustomers={initialCustomers} />
    </div>
  );
}
