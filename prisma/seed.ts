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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
