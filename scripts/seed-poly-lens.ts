// Run with: npx tsx scripts/seed-poly-lens.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  await prisma.platformCredential.upsert({
    where: { platform: "POLY_LENS" },
    update: {
      clientId: process.env.POLY_LENS_CLIENT_ID!,
      clientSecret: process.env.POLY_LENS_CLIENT_SECRET!,
      config: { tenantId: process.env.POLY_LENS_TENANT_ID! },
    },
    create: {
      platform: "POLY_LENS",
      clientId: process.env.POLY_LENS_CLIENT_ID!,
      clientSecret: process.env.POLY_LENS_CLIENT_SECRET!,
      config: { tenantId: process.env.POLY_LENS_TENANT_ID! },
    },
  });
  console.log("✓ POLY_LENS credentials saved to DB");
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
