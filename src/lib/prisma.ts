import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

function createClient(): PrismaClient {
  // Trimmed for the same reason as prisma.config.ts — a stray space/tab in
  // a host-dashboard-pasted value would otherwise silently defeat this.
  const databaseUrl = (process.env.DATABASE_URL ?? "file:./prisma/dev.db").trim();
  const isPostgres = /^postgres(ql)?:\/\//.test(databaseUrl);
  const adapter = isPostgres
    ? new PrismaPg(databaseUrl)
    : new PrismaBetterSqlite3({ url: databaseUrl.replace(/^file:/, "") });

  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  // Cached on globalThis (not a plain module-scoped variable) so it also
  // survives Next dev's Fast Refresh re-evaluating this module on every
  // edit — otherwise each hot reload would leak a fresh client/connection.
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

/**
 * A lazy proxy, not `createClient()` called eagerly here at module-import
 * time. `next build`'s page-data-collection pass imports every route
 * module — even ones that render fully dynamically at runtime (§1's
 * force-dynamic) — just to inspect their exports, which transitively
 * imports this file. Constructing the real client at that point runs
 * before a host's DATABASE_URL may be its true production value (observed
 * on Railway: unset during build, correct at request time), and even when
 * it is set, `next build` needs to run before the release migration/seed
 * step, so the production database may not exist yet either. Deferring
 * construction to first real use — an actual query at request time —
 * sidesteps both.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client as object, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
