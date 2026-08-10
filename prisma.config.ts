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
const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
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
