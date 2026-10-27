import "dotenv/config";
import { defineConfig } from "prisma/config";

// This ambient DATABASE_URL sniffing drives `prisma migrate deploy`/`db seed`/
// `studio` correctly in both environments, and drives `prisma generate` for
// local dev (via postinstall). Production's `npm run build` script doesn't
// rely on it, though — it explicitly regenerates the Postgres client first
// (`prisma generate --schema prisma/postgresql`), since a host's build step
// (e.g. `npm install`) may run before DATABASE_URL is actually resolved to
// the real Postgres URL, or its result may be cached across builds; either
// way, a silently sqlite-flavored client would crash the deployed app the
// moment it tries a real query.
// Trimmed defensively — a stray leading/trailing space or tab (an easy
// mistake when pasting a value into a host's dashboard) would otherwise
// silently defeat the provider sniff below and fall through to sqlite.
// DIRECT_URL, when set, is what the CLI connects to instead of DATABASE_URL:
// Neon's pooled connection (the one DATABASE_URL points at there) goes
// through a pooler that doesn't reliably support the advisory lock
// `migrate deploy` takes, so migrations need the direct one. The running app
// never reads this file — it queries through DATABASE_URL (lib/prisma.ts) —
// so this only ever affects the CLI. Unset on Railway, where DATABASE_URL is
// already a direct connection. `||`, not `??`, so an empty value pasted into
// a host dashboard falls through rather than winning.
const databaseUrl = (process.env.DIRECT_URL || process.env.DATABASE_URL || "file:./prisma/dev.db").trim();
const isPostgres = /^postgres(ql)?:\/\//.test(databaseUrl);
const provider = isPostgres ? "postgresql" : "sqlite";

export default defineConfig({
  schema: `prisma/${provider}`,
  migrations: {
    path: `prisma/migrations/${provider}`,
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: databaseUrl,
  },
});
