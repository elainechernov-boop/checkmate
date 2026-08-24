import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus, WorkSampleCategory } from "@/generated/prisma/enums";
import { attendanceDateFor } from "./reviewActions";

type ReportPrisma = Pick<PrismaClient, "student" | "learningPeriod" | "assignmentInstance">;

export async function getCurrentLearningPeriod(prisma: Pick<PrismaClient, "learningPeriod">, today: Date) {
  return prisma.learningPeriod.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } } });
}

const HOURS_CATEGORIES: WorkSampleCategory[] = [
  WorkSampleCategory.math,
  WorkSampleCategory.languageArts,
  WorkSampleCategory.science,
  WorkSampleCategory.socialStudies,
];

export interface HSTReportData {
  student: { id: string; name: string };
  learningPeriod: { id: string; name: string; startDate: Date; endDate: Date; hstMeetingDate: Date | null };
  // Only the four categories the HST actually asks about — a subject's own
  // workSampleCategory (Subjects page) is what buckets it here; anything
  // tagged "none" (Latin, Art, Scouts, …) doesn't count toward any of these
  // four and isn't shown elsewhere in this report either.
  hoursByCategory: { category: WorkSampleCategory; minutes: number }[];
  completedBySubject: { subjectName: string; items: { title: string; completionDate: Date }[] }[];
}

/**
 * The HST Meeting Prep report: per student, per learning period — total
 * time completed in each of the four categories the HST cares about (Math,
 * ELA, History, Science), and a full completed-work log grouped by subject.
 * Attendance is claimed in Blue Ridge's own Parent Portal and work samples
 * live in the family's Google Drive — neither is tracked here. A project
 * task's "subject" for this purpose is its tagged project's subject (§7) —
 * its own subjectId is always nil.
 */
export async function buildHSTReport(prisma: ReportPrisma, studentId: string, learningPeriodId: string): Promise<HSTReportData> {
  const [student, lp] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId } }),
    prisma.learningPeriod.findUniqueOrThrow({ where: { id: learningPeriodId } }),
  ]);

  const resolvedInstances = await prisma.assignmentInstance.findMany({
    where: { studentId, status: { in: [InstanceStatus.done, InstanceStatus.excused] } },
    include: { subject: true, project: { include: { subject: true } } },
  });

  const inLP = resolvedInstances
    .map((instance) => ({ instance, date: attendanceDateFor(instance) }))
    .filter(
      (row): row is { instance: (typeof resolvedInstances)[number]; date: Date } =>
        !!row.date && row.date >= lp.startDate && row.date <= lp.endDate
    );

  const minutesByCategory = new Map<WorkSampleCategory, number>();
  for (const row of inLP) {
    const subject = row.instance.subject ?? row.instance.project?.subject ?? null;
    if (!subject || subject.workSampleCategory === WorkSampleCategory.none) continue;
    const minutes = row.instance.estimatedMinutes ?? 0;
    minutesByCategory.set(subject.workSampleCategory, (minutesByCategory.get(subject.workSampleCategory) ?? 0) + minutes);
  }
  const hoursByCategory = HOURS_CATEGORIES.map((category) => ({
    category,
    minutes: minutesByCategory.get(category) ?? 0,
  }));

  const bySubject = new Map<string, { title: string; completionDate: Date }[]>();
  for (const row of inLP) {
    const subjectName = row.instance.subject?.name ?? row.instance.project?.subject?.name ?? null;
    if (!subjectName) continue; // untagged project work stays out of compliance reporting (§7)
    if (!bySubject.has(subjectName)) bySubject.set(subjectName, []);
    bySubject.get(subjectName)!.push({ title: row.instance.title, completionDate: row.date });
  }
  const completedBySubject = Array.from(bySubject.entries())
    .map(([subjectName, items]) => ({
      subjectName,
      items: items.sort((a, b) => a.completionDate.getTime() - b.completionDate.getTime()),
    }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

  return { student, learningPeriod: lp, hoursByCategory, completedBySubject };
}
