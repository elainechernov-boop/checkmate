import "dotenv/config";
import { defineConfig } from "prisma/config";

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
