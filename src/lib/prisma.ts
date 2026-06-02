import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Create connection pool (outside of instantiation)
const connectionString = process.env.DATABASE_URL!;

const pool = new Pool({ connectionString });

const adapter = new PrismaPg(pool);

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: ["error", "warn"],
    adapter, 
  });
};

// The usual global caching pattern
declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export { prisma };
