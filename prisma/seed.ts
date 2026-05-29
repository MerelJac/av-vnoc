import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
// npx prisma db seed
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = await bcrypt.hash("Testingtest", 12);

  const org = await prisma.organization.upsert({
    where: { id: "seed-org-callone-dev" },
    update: {},
    create: {
      id: "seed-org-callone-dev",
      name: "Call One - Dev",
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "merelbjacobs@gmail.com" },
    update: {},
    create: {
      email: "merelbjacobs@gmail.com",
      password,
      isSuperAdmin: true,
      profile: {
        create: {
          firstName: "Merel",
          lastName: "Jacobs",
        },
      },
    },
  });

  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: org.id } },
    update: {},
    create: { userId: user.id, organizationId: org.id, role: "ADMIN" },
  });

  console.log(`Seeded org: ${org.name}`);
  console.log(`Seeded user: ${user.email} (ADMIN of ${org.name})`);

  // --- VNOC seed data ---

  // PlatformCredentials (empty shells — real credentials set via admin UI)
  await prisma.platformCredential.upsert({
    where: { platform: 'POLY_LENS' },
    create: {
      platform: 'POLY_LENS',
      config: { lastPolledAt: null },
    },
    update: {},
  })

  await prisma.platformCredential.upsert({
    where: { platform: 'YEALINK_YMCS' },
    create: {
      platform: 'YEALINK_YMCS',
      config: { lastPolledAt: null },
    },
    update: {},
  })

  // Test customer hierarchy
  const vnocCustomer = await prisma.customer.upsert({
    where: { id: 'seed-customer-1' },
    create: {
      id: 'seed-customer-1',
      name: 'Acme Corp',
    },
    update: { name: 'Acme Corp' },
  })

  const vnocSite = await prisma.site.upsert({
    where: { id: 'seed-site-1' },
    create: {
      id: 'seed-site-1',
      customerId: vnocCustomer.id,
      name: 'HQ - Chicago',
      address: '123 Main St',
      city: 'Chicago',
      state: 'IL',
      lat: 41.8781,
      lng: -87.6298,
    },
    update: { name: 'HQ - Chicago' },
  })

  const vnocRoom = await prisma.room.upsert({
    where: { id: 'seed-room-1' },
    create: {
      id: 'seed-room-1',
      siteId: vnocSite.id,
      name: 'Conference Room A',
    },
    update: { name: 'Conference Room A' },
  })

  await prisma.device.upsert({
    where: { platform_platformId: { platform: 'POLY_LENS', platformId: 'poly-seed-device-1' } },
    create: {
      roomId: vnocRoom.id,
      platform: 'POLY_LENS',
      platformId: 'poly-seed-device-1',
      name: 'Poly Studio X50',
      model: 'Studio X50',
      firmware: '3.14.1',
      status: 'online',
      lastSeenAt: new Date(),
      rawPayload: { seeded: true },
    },
    update: { status: 'online', lastSeenAt: new Date() },
  })

  const boardRoom = await prisma.room.upsert({
    where: { id: 'seed-room-board' },
    update: {},
    create: {
      id: 'seed-room-board',
      siteId: vnocSite.id,
      name: 'Board Room',
    },
  })

  await prisma.device.upsert({
    where: { platform_platformId: { platform: 'POLY_LENS', platformId: 'seed-poly-001' } },
    update: {},
    create: {
      platformId: 'seed-poly-001',
      platform: 'POLY_LENS',
      name: 'Studio X30 (Conf A)',
      model: 'Poly Studio X30',
      status: 'online',
      macAddress: 'aa:bb:cc:11:22:33',
      lastSeenAt: new Date(),
      roomId: vnocRoom.id,
      rawPayload: { id: 'seed-poly-001', name: 'Studio X30', connected: true, hardwareModel: 'Poly Studio X30', room: { id: 'ext-room-1', name: 'Conference Room A' } },
    },
  })

  await prisma.device.upsert({
    where: { platform_platformId: { platform: 'YEALINK_YMCS', platformId: 'seed-ymcs-001' } },
    update: {},
    create: {
      platformId: 'seed-ymcs-001',
      platform: 'YEALINK_YMCS',
      name: 'T57W-ConfA',
      model: 'Yealink T57W',
      status: 'online',
      macAddress: 'dd:ee:ff:44:55:66',
      lastSeenAt: new Date(),
      roomId: vnocRoom.id,
      rawPayload: { deviceSN: 'seed-ymcs-001', deviceName: 'T57W-ConfA', onlineStatus: 'online' },
    },
  })

  // Unassigned device — vendor says it belongs in "Board Room" (triggers suggestion)
  await prisma.device.upsert({
    where: { platform_platformId: { platform: 'POLY_LENS', platformId: 'seed-poly-002' } },
    update: {},
    create: {
      platformId: 'seed-poly-002',
      platform: 'POLY_LENS',
      name: 'EaglEye IV',
      model: 'Poly EaglEye IV',
      status: 'offline',
      macAddress: '77:88:99:aa:bb:cc',
      lastSeenAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      roomId: null,
      rawPayload: { id: 'seed-poly-002', name: 'EaglEye IV', connected: false, hardwareModel: 'Poly EaglEye IV', room: { id: 'ext-room-2', name: 'Board Room' } },
    },
  })

  console.log(`Seeded rooms: ${vnocRoom.name}, ${boardRoom.name}`)
  console.log('✅ VNOC seed data created')
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
