import { notFound } from "next/navigation";
import { addDays, defaultWeekStart, getToday, isDebugToday, parseISODate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { extendAllMaterializationHorizons } from "@/lib/materialize";
import { rollOverdueInstances } from "@/lib/rollForward";
import { computeStreak } from "@/lib/streak";
import {
  fetchFamilyCalendarEvents,
  getCalendarEventAssignments,
  getDismissedEventKeys,
  getFamilyCalendarSettings,
} from "@/lib/familyCalendar";
import { StudentWeekView } from "./StudentWeekView";

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ week?: string; day?: string }>;
}) {
  const { id } = await params;
  const { week, day } = await searchParams;
  // The mobile day pager's own boundary crossing (see StudentWeekView):
  // ?day=0..5 says which column to land on when a swipe/arrow carried the
  // student across a week edge — everything else (a plain week-nav click,
  // a fresh visit) omits it and gets the smart "today, else Monday" default.
  const parsedDay = day !== undefined ? Number(day) : NaN;
  const requestedDayIndex = Number.isInteger(parsedDay) && parsedDay >= 0 && parsedDay <= 5 ? parsedDay : null;

  const student = await prisma.student.findUnique({ where: { id } });
  if (!student) notFound();

  const today = getToday();
  // Keeps every series' rolling 60-day materialization window actually
  // rolling as real days pass, not just when a series is edited (see
  // materialize.ts) — runs before the roll below so a freshly-materialized
  // today's instance is never missed by it.
  await extendAllMaterializationHorizons(prisma, today);
  // §5's daily auto-roll — runs on every load (not just "the first" one) so
  // it stays correct regardless of who opens the app first each day; it's a
  // no-op once nothing is overdue, so re-running it is harmless.
  await rollOverdueInstances(prisma, id, today);

  const monday = week ? parseISODate(week) : defaultWeekStart(today);
  const weekEnd = addDays(monday, 6); // Mon..Sat, six columns per §6

  const comingUpStart = addDays(today, 1);
  const comingUpEnd = addDays(today, 14);

  const instanceInclude = {
    subject: { select: { id: true, name: true } },
    series: { select: { estimatedMinutes: true } },
    project: { select: { id: true, name: true } },
  } as const;

  const [weekInstances, comingUp, projects, daySeparators, streak] = await Promise.all([
    prisma.assignmentInstance.findMany({
      where: { studentId: id, dueDate: { gte: monday, lt: weekEnd } },
      include: instanceInclude,
      orderBy: { createdAt: "asc" },
    }),
    prisma.assignmentInstance.findMany({
      where: {
        studentId: id,
        dueDate: { gte: comingUpStart, lte: comingUpEnd },
        status: { not: "done" },
      },
      include: instanceInclude,
      orderBy: { dueDate: "asc" },
    }),
    prisma.project.findMany({
      where: { studentId: id, status: { not: "archived" } },
      include: {
        instances: {
          where: { dueDate: null },
          include: instanceInclude,
          orderBy: { createdAt: "asc" },
        },
      },
      // §7 "prioritized" — the student's own drag-order first, falling back
      // to creation order for anything never manually reordered (every
      // untouched project shares sortOrder 0).
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    // §6 "Morning/Afternoon/Evening" — parent-placed, read-only here; the
    // student can reorder within one but never add, edit, or cross one.
    prisma.daySeparator.findMany({ where: { studentId: id, date: { gte: monday, lt: weekEnd } } }),
    computeStreak(prisma, id, today),
  ]);

  // The Projects band's own progress bar (Canvas.dc.html) — every task the
  // project has ever had, scheduled or not, not just its backlog (the
  // `instances` include above only ever fetches the unscheduled ones). A
  // second, lightweight query rather than a second named relation include,
  // since a project's instances relation can only be included once.
  const projectTaskStatuses = await prisma.assignmentInstance.findMany({
    where: { projectId: { in: projects.map((p) => p.id) } },
    select: { projectId: true, status: true },
  });
  const progressByProject = new Map<string, { done: number; total: number }>();
  for (const { projectId, status } of projectTaskStatuses) {
    if (!projectId) continue;
    const current = progressByProject.get(projectId) ?? { done: 0, total: 0 };
    current.total += 1;
    if (status === "done" || status === "excused") current.done += 1;
    progressByProject.set(projectId, current);
  }

  // A calendar event dragged onto this student's day in Parent Mode (§
  // "the purpose is just to show the kid they have this other thing going
  // on") — same fetch shape as ParentWeekBoard's own page.tsx, filtered down
  // to just this student's assignments since that's all this board needs.
  const familyCalendarSettings = await getFamilyCalendarSettings(prisma);
  const [rawFamilyCalendarEvents, dismissedEventKeys, calendarEventAssignments] = await Promise.all([
    familyCalendarSettings ? fetchFamilyCalendarEvents(familyCalendarSettings, monday, weekEnd) : Promise.resolve([]),
    getDismissedEventKeys(prisma),
    getCalendarEventAssignments(prisma),
  ]);
  const eventById = new Map(rawFamilyCalendarEvents.filter((event) => !dismissedEventKeys.has(event.id)).map((event) => [event.id, event]));
  const assignedCalendarEvents = calendarEventAssignments
    .filter((a) => a.studentId === id)
    .map((a) => eventById.get(a.eventKey))
    .filter((event) => event !== undefined);

  return (
    <StudentWeekView
      student={student}
      monday={monday}
      today={today}
      instances={weekInstances}
      comingUp={comingUp}
      projects={projects.map(({ instances, ...project }) => ({
        ...project,
        backlogTasks: instances,
        progress: progressByProject.get(project.id) ?? { done: 0, total: 0 },
      }))}
      daySeparators={daySeparators}
      calendarEvents={assignedCalendarEvents}
      streak={streak}
      skipCelebratedGuard={isDebugToday()}
      requestedDayIndex={requestedDayIndex}
    />
  );
}
