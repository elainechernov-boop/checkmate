import type { PrismaClient } from "@/generated/prisma/client";
import { SchoolDayType } from "@/generated/prisma/enums";
import { toISODate } from "./dates";

export type SchoolDayMap = Map<string, SchoolDayType>;

// Only days explicitly marked in the school calendar block generation; any
// date with no SchoolDay row (or one explicitly typed `schoolDay`) is a
// normal school day (§3, §8 — the calendar records exceptions, not every
// valid day up front).
export function isBlockedDay(map: SchoolDayMap, date: Date): boolean {
  const type = map.get(toISODate(date));
  return type !== undefined && type !== SchoolDayType.schoolDay;
}

export async function loadSchoolDayMap(
  prisma: Pick<PrismaClient, "schoolDay">,
  studentId: string,
  start: Date,
  end: Date
): Promise<SchoolDayMap> {
  const rows = await prisma.schoolDay.findMany({
    where: { studentId, date: { gte: start, lte: end } },
  });
  return new Map(rows.map((row) => [toISODate(row.date), row.type]));
}

/** Parent Mode's day-type change (§5 "field trips and off days") — for one
 * student. The family-wide academic calendar (§8) is just this, called
 * once per student instead of once overall (see calendar/actions.ts). */
export async function setSchoolDayType(
  prisma: Pick<PrismaClient, "schoolDay">,
  studentId: string,
  date: Date,
  type: SchoolDayType
): Promise<void> {
  await prisma.schoolDay.upsert({
    where: { date_studentId: { date, studentId } },
    update: { type },
    create: { date, studentId, type },
  });
}
