import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DevicesTable } from "./DevicesTable";

export default async function DevicesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [devices, total] = await Promise.all([
    prisma.device.findMany({
      orderBy: { name: "asc" },
      take: 50,
      select: {
        id: true, name: true, platform: true, platformId: true,
        model: true, status: true, lastSeenAt: true, macAddress: true, rawPayload: true,
        room: {
          select: {
            id: true, name: true,
            site: { select: { name: true, customer: { select: { id: true, name: true } } } },
          },
        },
      },
    }),
    prisma.device.count(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Device Inventory</h1>
      </div>
      <DevicesTable initialDevices={devices as never} initialTotal={total} />
    </div>
  );
}
