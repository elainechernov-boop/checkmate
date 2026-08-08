import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const isPostgres = /^postgres(ql)?:\/\//.test(databaseUrl);

function createClient() {
  const adapter = isPostgres
    ? new PrismaPg(databaseUrl)
    : new PrismaBetterSqlite3({ url: databaseUrl.replace(/^file:/, "") });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
