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

  console.log('✅ VNOC seed data created')
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
