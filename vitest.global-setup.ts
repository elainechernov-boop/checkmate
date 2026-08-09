import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A single sqlite file, migrated once for the whole test run. Individual
// test files truncate tables between runs (see src/lib/test/testDb.ts)
// instead of paying for `prisma migrate deploy` per file.
export const DB_POINTER_FILE = path.join(os.tmpdir(), "checkmate-vitest-dbpath.txt");

export async function setup() {
  const dbPath = path.join(os.tmpdir(), `checkmate-vitest-${Date.now()}-${process.pid}.db`);

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: __dirname,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: "inherit",
  });

  fs.writeFileSync(DB_POINTER_FILE, dbPath, "utf8");
}

export async function teardown() {
  if (!fs.existsSync(DB_POINTER_FILE)) return;

  const dbPath = fs.readFileSync(DB_POINTER_FILE, "utf8").trim();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {
      // already gone
    }
  }
  fs.unlinkSync(DB_POINTER_FILE);
}
