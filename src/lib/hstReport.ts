import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus, WorkSampleCategory } from "@/generated/prisma/enums";
import { loadAttendanceRange, summarizeAttendance } from "./attendance";
import { attendanceDateFor } from "./reviewActions";

type ReportPrisma = Pick<PrismaClient, "student" | "learningPeriod" | "assignmentInstance" | "schoolDay">;

export async function getCurrentLearningPeriod(prisma: Pick<PrismaClient, "learningPeriod">, today: Date) {
  return prisma.learningPeriod.findFirst({ where: { startDate: { lte: today }, endDate: { gte: today } } });
}

/** §8 dashboard card: "work samples flagged per category." */
export async function getWorkSampleCoverage(
  prisma: Pick<PrismaClient, "assignmentInstance">,
  studentId: string,
  lp: { startDate: Date; endDate: Date }
): Promise<{ category: WorkSampleCategory; flagged: boolean }[]> {
  const samples = await prisma.assignmentInstance.findMany({
    where: { studentId, isWorkSample: true },
    include: { subject: true },
  });
  const inRange = samples.filter((i) => {
    const date = attendanceDateFor(i);
    return date && date >= lp.startDate && date <= lp.endDate;
  });

  const categories: WorkSampleCategory[] = [
    WorkSampleCategory.math,
    WorkSampleCategory.languageArts,
    WorkSampleCategory.science,
    WorkSampleCategory.socialStudies,
  ];
  return categories.map((category) => ({
    category,
    flagged: inRange.some((i) => i.subject?.workSampleCategory === category),
  }));
}

export interface HSTReportData {
  student: { id: string; name: string };
  learningPeriod: { id: string; name: string; startDate: Date; endDate: Date; hstMeetingDate: Date | null };
  attendance: { schoolDayCount: number; presentCount: number; allClaimed: boolean };
  workSamples: { id: string; title: string; subjectName: string; completionDate: Date; note: string | null }[];
  completedBySubject: { subjectName: string; items: { title: string; completionDate: Date }[] }[];
}

/**
 * §8's HST Meeting Prep report: per student, per learning period —
 * attendance summary, the work-sample list, and a full completed-work log
 * grouped by subject. A project task's "subject" for this purpose is its
 * tagged project's subject (§7) — its own subjectId is always nil.
 */
export async function buildHSTReport(prisma: ReportPrisma, studentId: string, learningPeriodId: string): Promise<HSTReportData> {
  const [student, lp] = await Promise.all([
    prisma.student.findUniqueOrThrow({ where: { id: studentId } }),
    prisma.learningPeriod.findUniqueOrThrow({ where: { id: learningPeriodId } }),
  ]);

  const attendanceDays = await loadAttendanceRange(prisma, studentId, lp.startDate, lp.endDate);
  const attendance = summarizeAttendance(attendanceDays);

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

  const workSamples = inLP
    .filter((row) => row.instance.isWorkSample)
    .map((row) => ({
      id: row.instance.id,
      title: row.instance.title,
      subjectName: row.instance.subject?.name ?? "—",
      completionDate: row.date,
      note: row.instance.workSampleNote,
    }))
    .sort((a, b) => a.completionDate.getTime() - b.completionDate.getTime());

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

  return { student, learningPeriod: lp, attendance, workSamples, completedBySubject };
}
