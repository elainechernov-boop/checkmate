import Image from "next/image";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addDays, defaultWeekStart, getToday, parseISODate } from "@/lib/dates";
import { extendAllMaterializationHorizons } from "@/lib/materialize";
import { rollOverdueInstancesForAllStudents } from "@/lib/rollForward";
import { loadSchoolDayMap } from "@/lib/schoolCalendar";
import {
  fetchFamilyCalendarEvents,
  getCalendarEventAssignments,
  getDismissedEventKeys,
  getFamilyCalendarSettings,
} from "@/lib/familyCalendar";
import { getCurrentLearningPeriod } from "@/lib/hstReport";
import { listRecentUndoLog } from "@/lib/undoLog";
import { COLORS } from "@/lib/theme";
import { ParentNavMenu } from "./ParentNavMenu";
import { ParentWeekBoard } from "./ParentWeekBoard";
import { UndoMenu } from "./UndoMenu";

export default async function ParentPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; day?: string }>;
}) {
  const { week, day } = await searchParams;
  // The mobile day pager's own boundary crossing (see ParentWeekBoard):
  // ?day=0..5 says which column to land on when a swipe/arrow carried the
  // parent across a week edge — everything else omits it and gets the
  // smart "today, else Monday" default.
  const parsedDay = day !== undefined ? Number(day) : NaN;
  const requestedDayIndex = Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay <= 5 ? parsedDay : null;
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

  const [students, subjects, instances, daySeparators] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.assignmentInstance.findMany({
      where: { dueDate: { gte: monday, lt: weekEnd } },
      include: {
        subject: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
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
    // §6 "Morning/Afternoon/Evening" — parent-managed dividers within a day.
    prisma.daySeparator.findMany({ where: { date: { gte: monday, lt: weekEnd } } }),
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

  // The current learning period, if any covers today — just enough to point
  // a parent at the HST report when it's coming up; attendance and work
  // samples are tracked in Blue Ridge's own portal and Google Drive, not
  // here, so there's nothing else to surface on this card.
  const currentLP = await getCurrentLearningPeriod(prisma, today);
  const daysUntilEnd = currentLP
    ? Math.round((currentLP.endDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  const recentUndoLog = await listRecentUndoLog(prisma);

  // The family's imported Google Calendar (§ Parent Mode "on top of the
  // view") — overlaid the same for every student, so fetched once here
  // rather than per student board. A flaky or unconfigured feed just means
  // an empty overlay, never a broken page.
  const familyCalendarSettings = await getFamilyCalendarSettings(prisma);
  const [rawFamilyCalendarEvents, dismissedEventKeys, calendarEventAssignments] = await Promise.all([
    familyCalendarSettings ? fetchFamilyCalendarEvents(familyCalendarSettings, monday, weekEnd) : Promise.resolve([]),
    getDismissedEventKeys(prisma),
    getCalendarEventAssignments(prisma),
  ]);
  // Parent Mode's own hover-X dismiss (CalendarEventRow) — the feed itself
  // is read-only, so a "deleted" event just never makes it into the props
  // the board renders, on every subsequent load, not just this one.
  const familyCalendarEvents = rawFamilyCalendarEvents.filter((event) => !dismissedEventKeys.has(event.id));

  return (
    <main className="min-h-screen px-4 py-6 lg:px-10 lg:py-12" style={{ background: COLORS.background, color: COLORS.text }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2.5" style={{ borderColor: COLORS.hairline }}>
        <Image src="/homeroom-wordmark.svg" alt="homeroom" width={140} height={22} className="h-[22px] w-auto" priority />
        <nav className="flex flex-wrap items-center gap-5" style={{ fontSize: "0.78125rem" }}>
          <span style={{ color: COLORS.text, fontWeight: 600 }}>This Week</span>
          <Link href="/parent/students" style={{ color: COLORS.muted }} className="hover:underline">
            Students
          </Link>
          <Link href="/parent/subjects" style={{ color: COLORS.muted }} className="hover:underline">
            Subjects
          </Link>
          <Link href="/parent/reports" style={{ color: COLORS.muted }} className="hover:underline">
            Reports
          </Link>
          <UndoMenu entries={recentUndoLog} />
          <ParentNavMenu />
        </nav>
      </div>

      <ParentWeekBoard
        students={students}
        subjects={subjects}
        monday={monday}
        today={today}
        instances={instances}
        daySeparators={daySeparators}
        calendarEvents={familyCalendarEvents}
        calendarEventAssignments={calendarEventAssignments}
        schoolDayTypesByStudent={schoolDayTypesByStudent}
        requestedDayIndex={requestedDayIndex}
      />

      {currentLP ? (
        <p className="mt-10 text-sm" style={{ color: COLORS.muted }}>
          {currentLP.name} · {daysUntilEnd !== null && daysUntilEnd >= 0 ? `${daysUntilEnd} day(s) left` : "ended"} ·{" "}
          <Link href="/parent/reports" className="underline">
            build the HST report
          </Link>
        </p>
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
