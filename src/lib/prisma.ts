import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { cookies } from "next/headers";
import { PrismaClient } from "@/generated/prisma/client";
import { FAMILY_COOKIE, getFamilyIdFromSession } from "@/lib/session";
import { tenantScopeExtension } from "@/lib/tenantScope";

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

/**
 * The client every family-scoped page/action should use instead of the
 * bare `prisma` export above (MULTI_FAMILY_SPEC.md Phase 2) — every query
 * it runs against a family-owned model is automatically filtered to the
 * current request's family (tenantScope.ts), so a call site can't
 * accidentally read or write another family's data by forgetting a filter.
 * Only callable where the family gate has already run (every page under
 * proxy.ts's matcher except /gate itself) — reads the same signed cookie
 * the gate sets, so there's nothing new for a caller to plumb through.
 * The bare `prisma` export stays correct for the handful of call sites
 * that must run *before* a family is known (the gate/login actions
 * themselves) or that touch the Family table directly, which has no
 * familyId of its own to scope by.
 */
async function currentFamilyId(): Promise<string> {
  const cookieStore = await cookies();
  const familyId = getFamilyIdFromSession(cookieStore.get(FAMILY_COOKIE)?.value);
  if (!familyId) {
    throw new Error("No family session — the family gate must run first.");
  }
  return familyId;
}

export async function getScopedPrisma(): Promise<PrismaClient> {
  const familyId = await currentFamilyId();
  // Cast back to the plain client type: every lib/*.ts function already
  // types its `prisma` parameter as `PrismaClient` (or a `Pick` of it), and
  // $extends()'s own generic-heavy result type doesn't structurally match
  // those signatures despite behaving identically at runtime for every
  // operation this app uses — the extension only intercepts query
  // execution, it doesn't add, remove, or change any method.
  return prisma.$extends(tenantScopeExtension(familyId)) as unknown as PrismaClient;
}

/**
 * The current session's own Family row — for the handful of settings that
 * live on the tenant itself rather than on a family-owned model (Phase 3's
 * complianceModuleEnabled). Family isn't in tenantScope.ts's scoped-model
 * set (it has no familyId of its own), so this looks it up directly by id
 * rather than going through getScopedPrisma().
 */
export async function getCurrentFamily() {
  const familyId = await currentFamilyId();
  return prisma.family.findUniqueOrThrow({ where: { id: familyId } });
}
