import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addDays, defaultWeekStart, getToday, parseISODate } from "@/lib/dates";
import { rollOverdueInstancesForAllStudents } from "@/lib/rollForward";
import { loadSchoolDayMap } from "@/lib/schoolCalendar";
import { ParentWeekBoard } from "./ParentWeekBoard";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const today = getToday();
  // Keeps Parent Mode's board correct even if the parent looks before either
  // kid has opened their own page today (§5's roll is a shared-DB effect,
  // not something scoped to whoever happens to trigger it first).
  await rollOverdueInstancesForAllStudents(prisma, today);

  const monday = week ? parseISODate(week) : defaultWeekStart(today);
  const weekEnd = addDays(monday, 6);

  const [students, subjects, instances, schoolDayMap] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.assignmentInstance.findMany({
      where: { dueDate: { gte: monday, lt: weekEnd } },
      include: {
        subject: { select: { id: true, name: true } },
        series: {
          select: {
            id: true,
            endCondition: true,
            endDate: true,
            endCount: true,
            estimatedMinutes: true,
            recurrence: { select: { frequency: true, daysOfWeek: true, interval: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    loadSchoolDayMap(prisma, monday, weekEnd),
  ]);
  // A Map doesn't survive the server→client serialization boundary — hand
  // ParentWeekBoard a plain object instead.
  const schoolDayTypes = Object.fromEntries(schoolDayMap);

  return (
    <main className="min-h-screen bg-[#FAF7F2] px-10 py-12 text-[#1A1A1A]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Parent Mode</h1>
        <nav className="flex items-center gap-8 text-sm">
          <Link href="/parent/students" className="px-1 text-[#6B6B6B] hover:underline">
            Students
          </Link>
          <Link href="/parent/subjects" className="px-1 text-[#6B6B6B] hover:underline">
            Subjects
          </Link>
          <Link
            href="/parent/assignments/new"
            className="rounded bg-[#1A1A1A] px-3 py-1.5 text-white hover:bg-[#333]"
          >
            + New assignment
          </Link>
        </nav>
      </div>

      <ParentWeekBoard
        students={students}
        subjects={subjects}
        monday={monday}
        instances={instances}
        schoolDayTypes={schoolDayTypes}
      />
    </main>
  );
}
