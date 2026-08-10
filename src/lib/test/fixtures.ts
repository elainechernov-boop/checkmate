import type { PrismaClient } from "@/generated/prisma/client";
import { SchoolDayType } from "@/generated/prisma/enums";

export async function makeStudent(prisma: PrismaClient, overrides: Partial<{ name: string }> = {}) {
  return prisma.student.create({
    data: {
      name: overrides.name ?? "Miles",
      gradeLevel: "7th Grade",
      accentColor: "#C97B4A",
    },
  });
}

export async function makeSubject(prisma: PrismaClient, overrides: Partial<{ name: string }> = {}) {
  return prisma.subject.create({
    data: {
      name: overrides.name ?? "Math",
      workSampleCategory: "math",
      isFaithIntegrated: false,
    },
  });
}

export async function markSchoolDay(prisma: PrismaClient, studentId: string, date: Date, type: SchoolDayType) {
  return prisma.schoolDay.create({ data: { date, studentId, type } });
}
