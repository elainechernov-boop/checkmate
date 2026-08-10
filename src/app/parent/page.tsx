import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { WorkSampleCategory } from "@/generated/prisma/enums";
import { addDays, defaultWeekStart, getToday, parseISODate } from "@/lib/dates";
import { extendAllMaterializationHorizons } from "@/lib/materialize";
import { rollOverdueInstancesForAllStudents } from "@/lib/rollForward";
import { loadSchoolDayMap } from "@/lib/schoolCalendar";
import { loadAttendanceRange, summarizeAttendance } from "@/lib/attendance";
import { getCurrentLearningPeriod, getWorkSampleCoverage } from "@/lib/hstReport";
import { COLORS } from "@/lib/theme";
import { ParentNavMenu } from "./ParentNavMenu";
import { ParentWeekBoard } from "./ParentWeekBoard";

const CATEGORY_LABEL: Record<WorkSampleCategory, string> = {
  math: "Math",
  languageArts: "ELA",
  science: "Science",
  socialStudies: "Soc. Studies",
  none: "—",
};

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const today = getToday();
  // Same self-extending horizon as the student page (see materialize.ts) —
  // covering this entry point too so a long-running series keeps
  // generating even on days only Parent Mode gets opened.
  await extendAllMaterializationHorizons(prisma, today);
  // Keeps Parent Mode's board correct even if the parent looks before either
  // kid has opened their own page today (§5's roll is a shared-DB effect,
  // not something scoped to whoever happens to trigger it first).
  await rollOverdueInstancesForAllStudents(prisma, today);

  const monday = week ? parseISODate(week) : defaultWeekStart(today);
  const weekEnd = addDays(monday, 6);

  const [students, subjects, instances] = await Promise.all([
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
  ]);

  // SchoolDay is per-student (§5) — one map per kid, keyed by their id. A
  // Map doesn't survive the server→client serialization boundary either,
  // so each student's map becomes a plain object.
  const schoolDayTypesByStudent = Object.fromEntries(
    await Promise.all(
      students.map(async (student) => {
        const map = await loadSchoolDayMap(prisma, student.id, monday, weekEnd);
        return [student.id, Object.fromEntries(map)] as const;
      })
    )
  );

  // §8 dashboard card: days until LP end, attendance claimed?, work samples
  // flagged per category — scoped to whichever learning period covers today.
  const currentLP = await getCurrentLearningPeriod(prisma, today);
  const dashboardCards = currentLP
    ? await Promise.all(
        students.map(async (student) => {
          const days = await loadAttendanceRange(prisma, student.id, currentLP.startDate, currentLP.endDate);
          const attendance = summarizeAttendance(days);
          const coverage = await getWorkSampleCoverage(prisma, student.id, currentLP);
          const daysUntilEnd = Math.round((currentLP.endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
          return { student, attendance, coverage, daysUntilEnd };
        })
      )
    : [];

  return (
    <main className="min-h-screen bg-[#FAFAFA] px-10 py-12 text-[#161616]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Parent Mode</h1>
        <nav className="flex items-center gap-4 text-sm">
          <ParentNavMenu />
          <Link
            href="/parent/projects"
            className="rounded border border-[#161616] px-3 py-1.5 text-[#161616] hover:bg-[#161616] hover:text-white"
          >
            + New project
          </Link>
          <Link
            href="/parent/assignments/new"
            className="rounded bg-[#161616] px-3 py-1.5 text-white hover:bg-[#333]"
          >
            + New assignment
          </Link>
        </nav>
      </div>

      <ParentWeekBoard
        students={students}
        subjects={subjects}
        monday={monday}
        today={today}
        instances={instances}
        schoolDayTypesByStudent={schoolDayTypesByStudent}
      />

      {currentLP ? (
        <section className="mt-10 grid grid-cols-2 gap-4">
          {dashboardCards.map(({ student, attendance, coverage, daysUntilEnd }) => (
            <div key={student.id} className="rounded border border-[#E1E3E6] bg-white p-4 text-sm">
              {/* Clicking a student's own name is the way into their week
                  view from Parent Mode, wherever that name appears — no
                  separate "view" link needed. */}
              <Link href={`/student/${student.id}`} className="font-medium hover:underline" style={{ color: student.accentColor }}>
                {student.name}
              </Link>
              <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
                {currentLP.name} · {daysUntilEnd >= 0 ? `${daysUntilEnd} day(s) left` : "ended"}
              </p>
              <p className="mt-2">
                {attendance.presentCount}/{attendance.schoolDayCount} days present ·{" "}
                {attendance.allClaimed ? "claimed ✓" : "not claimed"}
              </p>
              <p className="mt-1 text-xs" style={{ color: COLORS.muted }}>
                {coverage.map((c) => `${CATEGORY_LABEL[c.category]} ${c.flagged ? "✓" : "—"}`).join(" · ")}
              </p>
            </div>
          ))}
        </section>
      ) : (
        <p className="mt-10 text-sm" style={{ color: COLORS.muted }}>
          No learning period covers today —{" "}
          <Link href="/parent/calendar" className="underline">
            set one up
          </Link>
          .
        </p>
      )}
    </main>
  );
}
