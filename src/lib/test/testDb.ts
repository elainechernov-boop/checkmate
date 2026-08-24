import fs from "node:fs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { DB_POINTER_FILE } from "../../../vitest.global-setup";

function resolveDbPath(): string {
  return fs.readFileSync(DB_POINTER_FILE, "utf8").trim();
}

export function createTestClient(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: resolveDbPath() });
  return new PrismaClient({ adapter });
}

// Wipe every app table so each test starts from a clean slate. Order matters
// for the FK-constrained tables (children before parents).
export async function resetDb(prisma: PrismaClient) {
  await prisma.undoLogEntry.deleteMany();
  await prisma.assignmentInstance.deleteMany();
  await prisma.recurrenceRule.deleteMany();
  await prisma.removedOccurrence.deleteMany();
  await prisma.assignmentSeries.deleteMany();
  await prisma.project.deleteMany();
  await prisma.projectIdea.deleteMany();
  await prisma.schoolDay.deleteMany();
  await prisma.learningPeriod.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.student.deleteMany();
}
