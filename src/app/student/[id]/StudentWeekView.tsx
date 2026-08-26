"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { Student } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { addDays, defaultWeekStart, formatWeekRange, toISODate } from "@/lib/dates";
import { COLORS, nextAccentColor } from "@/lib/theme";
import { isSoundMuted, playCompletionTick, playReminderChime, setSoundMuted } from "@/lib/completionSound";
import { hasBeenReminded, isReminderDue, markReminded } from "@/lib/reminders";
import { approveReviewViaPasscode, cycleAccentColorAction, reorderOpenItems, toggleInstance } from "./actions";
import { moveProjectTaskAction, reorderProjectsAction } from "./projectActions";
import { DayColumn } from "./DayColumn";
import { ComingUpPanel } from "./ComingUpPanel";
import { ItemCelebration } from "./ItemCelebration";
import { IdeasList } from "./IdeasList";
import { ProjectsBand } from "./ProjectsBand";
import { ReminderTakeover } from "./ReminderTakeover";
import { SwipeDayPager } from "@/components/SwipeDayPager";
import { DayPagerControls } from "@/components/DayPagerControls";
import type { DaySeparator, ProjectIdea, StudentInstance, StudentProject } from "./types";

const DAY_SHORT_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The mobile pager's default landing day: today's own column when browsing
 * the current week (matching the desktop grid's today-highlight), else
 * Monday — mirrors defaultWeekStart's "no column reads as today" reasoning
 * for a week that isn't this one. */
function defaultDayIndex(days: Date[], todayISO: string, isCurrentWeek: boolean): number {
  if (!isCurrentWeek) return 0;
  const index = days.findIndex((day) => toISODate(day) === todayISO);
  return index === -1 ? 0 : index;
}

const REFRESH_INTERVAL_MS = 60_000;
// §12: independent of the 60s data refresh above — this only ever reads
// already-loaded local state against the wall clock, so it can check far
// more often without hitting the server.
const REMINDER_CHECK_INTERVAL_MS = 20_000;

export function StudentWeekView({
  student,
  monday,
  today,
  instances,
  comingUp,
  projects,
  projectIdeas,
  daySeparators,
  streak,
  skipCelebratedGuard,
  requestedDayIndex,
}: {
  student: Student;
  monday: Date;
  today: Date;
  instances: StudentInstance[];
  comingUp: StudentInstance[];
  projects: StudentProject[];
  projectIdeas: ProjectIdea[];
  daySeparators: DaySeparator[];
  // Consecutive fully-done school days leading up to today (lib/streak.ts) —
  // a pure header stat, computed server-side once per load.
  streak: number;
  skipCelebratedGuard: boolean;
  // Set only when a mobile swipe/arrow carried the student across a week
  // edge (see page.tsx) — otherwise null, and the default below applies.
  requestedDayIndex: number | null;
}) {
  const router = useRouter();
  const prefersReducedMotion = !!useReducedMotion();
  const bandSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [localAccentColor, setLocalAccentColor] = useState(student.accentColor);
  const [syncedAccentColor, setSyncedAccentColor] = useState(student.accentColor);
  const [localInstances, setLocalInstances] = useState(instances);
  const [syncedInstances, setSyncedInstances] = useState(instances);
  const [localProjects, setLocalProjects] = useState(projects);
  const [syncedProjects, setSyncedProjects] = useState(projects);
  const [comingUpOpen, setComingUpOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [celebratedToday, setCelebratedToday] = useState(true); // avoid a flash before the effect below settles
  const [itemCelebration, setItemCelebration] = useState<{ key: number; origin: { x: number; y: number } } | null>(
    null
  );
  const [reminderInstance, setReminderInstance] = useState<StudentInstance | null>(null);
  // Purely to force the live/soon/later/past time badges (lib/reminders.ts's
  // timeBadge) to recompute against the real wall clock — those are derived
  // at render, not stored, so something has to actually re-render every so
  // often for "starts in 45 min" to ever tick down to "starts in 44 min".
  const [now, setNow] = useState(() => new Date());

  const todayISO = toISODate(today);
  const celebratedKey = `checkmate:celebrated:${student.id}:${todayISO}`;
  const isCurrentWeek = toISODate(monday) === toISODate(defaultWeekStart(today));
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(monday, i)), [monday]);

  // The header's own "N/M today" stat — every bucket that's ever due today,
  // not just this week's (a rolled item still counts, matching the day
  // column's own totalRows).
  const todayInstances = localInstances.filter((i) => i.dueDate && toISODate(i.dueDate) === todayISO);
  const todayDoneCount = todayInstances.filter(
    (i) => i.status === InstanceStatus.done || i.status === InstanceStatus.excused
  ).length;

  // The mobile pager's current day, plus the same render-time resync
  // pattern as instances/projects above — a `monday` change (a week-nav
  // click, or the boundary-crossing navigation below) always means a fresh
  // day-index decision, never a carried-over one from the previous week.
  const [mobileDayIndex, setMobileDayIndex] = useState(
    () => requestedDayIndex ?? defaultDayIndex(days, todayISO, isCurrentWeek)
  );
  const [syncedMonday, setSyncedMonday] = useState(monday);
  if (toISODate(monday) !== toISODate(syncedMonday)) {
    setSyncedMonday(monday);
    setMobileDayIndex(requestedDayIndex ?? defaultDayIndex(days, todayISO, isCurrentWeek));
  }

  // Reset local (optimistic) state when the server hands us a fresh
  // `instances` prop (a week change or the 60s refresh) — done during
  // render, per React's guidance, rather than in an effect.
  if (instances !== syncedInstances) {
    setSyncedInstances(instances);
    setLocalInstances(instances);
  }
  if (student.accentColor !== syncedAccentColor) {
    setSyncedAccentColor(student.accentColor);
    setLocalAccentColor(student.accentColor);
  }
  if (projects !== syncedProjects) {
    setSyncedProjects(projects);
    setLocalProjects(projects);
  }

  // §5 step 3: "the full completion sequence... plays on the student's
  // screen at next refresh." A student's own toggle (actions.ts) never
  // produces a pendingReview -> done transition — only an external approval
  // (Parent Mode, or someone else's passcode popover) does — so spotting one
  // here is an unambiguous signal to play the reward now. This needs the
  // real previous props (not the render-time state above, which may have
  // already been overwritten this same render), so it runs as an effect —
  // playing a sound and reading window dimensions are side effects anyway.
  const previousInstancesRef = useRef(instances);
  useEffect(() => {
    const previous = previousInstancesRef.current;
    if (previous !== instances) {
      const previousStatusById = new Map(previous.map((i) => [i.id, i.status]));
      const approvedElsewhere = instances.find(
        (i) => previousStatusById.get(i.id) === InstanceStatus.pendingReview && i.status === InstanceStatus.done
      );
      if (approvedElsewhere) {
        playCompletionTick();
        if (!prefersReducedMotion) {
          // A genuine "external system changed, react to it" case (§5 step
          // 3) — there's no user gesture to hang this off, so the effect
          // itself is the right place, matching the isSoundMuted() read below.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItemCelebration({ key: Date.now(), origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
        }
      }
      previousInstancesRef.current = instances;
    }
  }, [instances, prefersReducedMotion]);

  useEffect(() => {
    // Browser-only reads (localStorage), deferred past hydration so the
    // server-rendered markup and the first client render still match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(isSoundMuted());
    // With DEBUG_TODAY pinned, "today" never actually advances, so this
    // flag would never naturally clear — always start uncelebrated so the
    // day-complete moment can be re-tested as many times as needed.
    setCelebratedToday(skipCelebratedGuard ? false : window.localStorage.getItem(celebratedKey) === "1");
  }, [celebratedKey, skipCelebratedGuard]);

  // §1: a light 60-second background refresh, so a morning edit appears
  // without the student touching anything.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [router]);

  // §12: watches today's still-open time-sensitive items against the wall
  // clock and fires the reminder takeover once one enters its window (see
  // lib/reminders.ts). Checked immediately on mount — a student opening the
  // app mid-window shouldn't have to wait out a full interval tick — then
  // again on its own cadence, independent of the 60s data refresh above.
  useEffect(() => {
    function checkReminders() {
      if (reminderInstance) return; // one at a time; re-checks once this one is dismissed
      const now = new Date();
      const due = localInstances.find(
        (instance) =>
          instance.dueDate &&
          toISODate(instance.dueDate) === todayISO &&
          isReminderDue(instance, now) &&
          !hasBeenReminded(student.id, instance.id, todayISO)
      );
      if (!due) return;
      markReminded(student.id, due.id, todayISO);
      playReminderChime();
      setReminderInstance(due);
    }

    checkReminders();
    const interval = window.setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [localInstances, todayISO, reminderInstance, student.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), REMINDER_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const weekHasAnyItems = localInstances.length > 0;
  // A backlog task needs somewhere to be dropped, even on an otherwise
  // silent week (§9's "an empty week shows nothing at all" is about there
  // being nothing to plan, not about hiding valid drop targets).
  const hasBacklogTasks = localProjects.some((p) => p.backlogTasks.length > 0);
  // The week view is Mon-Sat (§6) — on a Sunday there's no column that
  // equals "today" at all, so nothing is interactive. Say so plainly
  // (this is a fact about the real today, not about whichever week is
  // currently being browsed) instead of leaving a silent grid that reads
  // as broken.
  const todayIsSunday = today.getUTCDay() === 0;

  function handleCelebrate() {
    if (skipCelebratedGuard) return; // stay re-testable while pinned to a fixed debug date
    setCelebratedToday(true);
    window.localStorage.setItem(celebratedKey, "1");
  }

  // Mobile pager navigation. Moving within the loaded week is purely local
  // (every day's instances are already in `localInstances`, so there's
  // nothing to fetch); crossing either edge means a different week's data
  // is needed, so that hands off to a real navigation instead — landing on
  // the far column of the new week (Saturday coming from Monday's "prev,"
  // Monday coming from Saturday's "next") so the sequence of days reads
  // continuously across the boundary.
  function goToDayIndex(index: number) {
    setMobileDayIndex(index);
  }
  function goToPrevDay() {
    if (mobileDayIndex > 0) {
      setMobileDayIndex(mobileDayIndex - 1);
    } else {
      router.push(`/student/${student.id}?week=${toISODate(addDays(monday, -7))}&day=5`);
    }
  }
  function goToNextDay() {
    if (mobileDayIndex < 5) {
      setMobileDayIndex(mobileDayIndex + 1);
    } else {
      router.push(`/student/${student.id}?week=${toISODate(addDays(monday, 7))}&day=0`);
    }
  }

  async function handleToggle(instance: StudentInstance, origin: { x: number; y: number }) {
    const goingToOpen = instance.status !== InstanceStatus.open;
    const nextStatus = goingToOpen
      ? InstanceStatus.open
      : instance.requiresReview
        ? InstanceStatus.pendingReview
        : InstanceStatus.done;

    // The per-item "something REALLY fun" moment (§6) — a genuine, no-review
    // completion only. Entering pendingReview or undoing stays quiet: §5's
    // "the reward lands only when the work has been shown" still holds.
    if (!goingToOpen && nextStatus === InstanceStatus.done && !prefersReducedMotion) {
      setItemCelebration({ key: Date.now(), origin });
    }

    setLocalInstances((current) =>
      current.map((i) => (i.id === instance.id ? { ...i, status: nextStatus } : i))
    );

    try {
      await toggleInstance(instance.id);
    } catch {
      // Server rejected it (e.g. no longer "today") — revert.
      setLocalInstances((current) =>
        current.map((i) => (i.id === instance.id ? { ...i, status: instance.status } : i))
      );
    }
  }

  async function handleReorderOpen(orderedIds: string[]) {
    const previous = localInstances;
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    setLocalInstances((current) =>
      current.map((i) => (order.has(i.id) ? { ...i, sortOrder: order.get(i.id)! } : i))
    );
    try {
      await reorderOpenItems(student.id, orderedIds);
    } catch {
      setLocalInstances(previous);
    }
  }

  // §5 step 2's passcode popover — approval happens right here on the
  // student's own screen, so (unlike the refresh-detected approval path
  // below) the full completion sequence fires immediately rather than
  // waiting for the next poll.
  async function handleApproveViaPasscode(
    instance: StudentInstance,
    passcode: string,
    origin: { x: number; y: number }
  ) {
    await approveReviewViaPasscode(instance.id, passcode); // throws on a wrong passcode; caller shows the error

    playCompletionTick();
    if (!prefersReducedMotion) setItemCelebration({ key: Date.now(), origin });
    setLocalInstances((current) =>
      current.map((i) => (i.id === instance.id ? { ...i, status: InstanceStatus.done, reviewedAt: new Date() } : i))
    );
  }

  /**
   * §7 drag-to-day, covering both ends of a project task's life: a
   * Projects-band backlog task dropped on a day column for the first time,
   * and an *already-scheduled* project task dragged onto a different day to
   * move it — DayColumn's own draggable-project-row (for non-today cells;
   * today's own reorder DndContext handles today's rows separately, so the
   * two never register the same draggable/droppable). Parent-assigned rows
   * never register as draggables here at all, so there's nothing to guard
   * against a student moving those.
   */
  async function handleWeekDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // §7 "prioritized" — reordering the project cards themselves. Both ends
    // of the drag are project ids here, never a day column or a task, so
    // this branch has to run before the day/task lookups below.
    if (localProjects.some((p) => p.id === activeId)) {
      if (activeId === overId) return;
      const previousOrder = localProjects;
      const ids = previousOrder.map((p) => p.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(previousOrder, oldIndex, newIndex);
      setLocalProjects(reordered);
      try {
        await reorderProjectsAction(student.id, reordered.map((p) => p.id));
      } catch {
        setLocalProjects(previousOrder);
      }
      return;
    }

    const taskId = activeId;
    const dateISO = overId;
    const targetDay = days.find((day) => toISODate(day) === dateISO);
    if (!targetDay) return;

    let backlogTask: StudentInstance | null = null;
    for (const project of localProjects) {
      const found = project.backlogTasks.find((t) => t.id === taskId);
      if (found) {
        backlogTask = found;
        break;
      }
    }

    if (backlogTask) {
      const scheduledTask = backlogTask;
      setLocalProjects((current) =>
        current.map((p) =>
          p.id === scheduledTask.projectId ? { ...p, backlogTasks: p.backlogTasks.filter((t) => t.id !== taskId) } : p
        )
      );
      setLocalInstances((current) => [
        ...current,
        { ...scheduledTask, dueDate: targetDay, originalDueDate: targetDay },
      ]);

      try {
        await moveProjectTaskAction(student.id, taskId, dateISO);
      } catch {
        setLocalProjects((current) =>
          current.map((p) =>
            p.id === scheduledTask.projectId ? { ...p, backlogTasks: [...p.backlogTasks, scheduledTask] } : p
          )
        );
        setLocalInstances((current) => current.filter((i) => i.id !== taskId));
      }
      return;
    }

    // Not in any backlog — an already-scheduled project task being moved to
    // a different day instead.
    const scheduled = localInstances.find((i) => i.id === taskId);
    if (!scheduled || !scheduled.dueDate || toISODate(scheduled.dueDate) === dateISO) return;
    const previousDueDate = scheduled.dueDate;
    const previousOriginalDueDate = scheduled.originalDueDate;

    setLocalInstances((current) =>
      current.map((i) => (i.id === taskId ? { ...i, dueDate: targetDay, originalDueDate: targetDay } : i))
    );

    try {
      await moveProjectTaskAction(student.id, taskId, dateISO);
    } catch {
      setLocalInstances((current) =>
        current.map((i) =>
          i.id === taskId ? { ...i, dueDate: previousDueDate, originalDueDate: previousOriginalDueDate } : i
        )
      );
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  }

  async function handleCycleAccentColor() {
    const previous = localAccentColor;
    setLocalAccentColor(nextAccentColor(previous));
    try {
      await cycleAccentColorAction(student.id);
    } catch {
      setLocalAccentColor(previous);
    }
  }

  return (
    <main style={{ background: COLORS.background, color: COLORS.text }} className="min-h-screen px-4 py-6 lg:px-10 lg:py-10">
      <div className="flex items-center justify-between">
        <Image src="/homeroom-wordmark.svg" alt="homeroom" width={110} height={20} className="h-5 w-auto" priority />
        <div className="flex items-center gap-4 text-sm">
          <button onClick={() => setComingUpOpen(true)} className="hover:underline" style={{ color: COLORS.muted }}>
            Coming Up
          </button>
          <button
            onClick={toggleMute}
            aria-label={muted ? "Turn completion sound on" : "Turn completion sound off"}
            className="text-base"
            style={{ color: COLORS.muted }}
          >
            {muted ? "🔈" : "🔊"}
          </button>
          <StudentMenu />
        </div>
      </div>

      <header
        className="mt-4 flex flex-wrap items-baseline justify-between gap-3 pb-3"
        style={{ borderBottom: `2px solid ${COLORS.text}` }}
      >
        <div className="flex items-baseline gap-3">
          <button
            type="button"
            onClick={handleCycleAccentColor}
            title="Tap to change my color"
            className="border-b border-dashed uppercase"
            style={{
              color: localAccentColor,
              borderColor: localAccentColor,
              fontFamily: "var(--font-syncopate)",
              fontSize: "1.15rem",
              letterSpacing: "0.03em",
            }}
          >
            {student.name}&rsquo;s week
          </button>
          <span className="text-xs" style={{ color: COLORS.muted }}>
            {formatWeekRange(monday, addDays(monday, 5))}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="font-bold uppercase" style={{ color: localAccentColor, letterSpacing: "0.03em" }}>
            {streak}-day streak · {todayDoneCount}/{todayInstances.length} today
          </span>
          <Link
            href={`/student/${student.id}?week=${toISODate(addDays(monday, -7))}`}
            className="uppercase hover:underline"
            style={{ color: COLORS.muted, letterSpacing: "0.03em" }}
          >
            ← Prev week
          </Link>
          {!isCurrentWeek && (
            <Link href={`/student/${student.id}`} className="hover:underline" style={{ color: COLORS.muted }}>
              📅 Today
            </Link>
          )}
          <Link
            href={`/student/${student.id}?week=${toISODate(addDays(monday, 7))}`}
            className="uppercase hover:underline"
            style={{ color: COLORS.muted, letterSpacing: "0.03em" }}
          >
            Next week →
          </Link>
        </div>
      </header>
      <p className="mt-1.5 text-xs" style={{ color: COLORS.mutedFaint }}>
        Tap {student.name}&rsquo;s own name to cycle their color — each tap advances to the next one, becomes
        their &ldquo;today&rdquo; and accent color everywhere on their board.
      </p>

      {todayIsSunday && (
        <p className="mt-3 text-sm" style={{ color: COLORS.mutedFaint }}>
          No school today — nothing here is checkable until Monday.
        </p>
      )}

      {/* Explicit `id`, same reasoning as ParentWeekBoard's own DndContext:
          without it, dnd-kit's internal aria-describedby id comes from a
          module-level counter that isn't SSR-safe, which is a real
          hydration-attribute mismatch once more than one draggable is
          registered (now true here too, with the project cards sortable). */}
      <DndContext
        id={`student-week-${student.id}`}
        sensors={bandSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleWeekDragEnd}
      >
        {(weekHasAnyItems || hasBacklogTasks) && (
          <>
            {/* Desktop: the full six-column week (§6). Below `lg`, six
                columns of full assignment rows have no room to breathe, so
                a phone gets the swipeable single-day pager instead. */}
            <div className="mt-8 hidden grid-cols-6 gap-6 lg:grid">
              {days.map((day) => {
                const dayISO = toISODate(day);
                const dayInstances = localInstances.filter((i) => i.dueDate && toISODate(i.dueDate) === dayISO);
                const daySeparatorsForDay = daySeparators.filter((s) => toISODate(s.date) === dayISO);
                const isToday = dayISO === todayISO;
                return (
                  <DayColumn
                    key={dayISO}
                    day={day}
                    isToday={isToday}
                    interactive={isToday}
                    instances={dayInstances}
                    separators={daySeparatorsForDay}
                    studentId={student.id}
                    studentName={student.name}
                    accentColor={localAccentColor}
                    prefersReducedMotion={prefersReducedMotion}
                    celebrated={celebratedToday}
                    now={now}
                    canAddTask={dayISO >= todayISO}
                    onCelebrate={handleCelebrate}
                    onToggle={handleToggle}
                    onReorderOpen={handleReorderOpen}
                    onApproveViaPasscode={handleApproveViaPasscode}
                  />
                );
              })}
            </div>

            <div className="mt-8 lg:hidden">
              <DayPagerControls
                activeIndex={mobileDayIndex}
                labels={DAY_SHORT_LABELS}
                accentColor={localAccentColor}
                onSelect={goToDayIndex}
                onPrev={goToPrevDay}
                onNext={goToNextDay}
              />
              {(() => {
                const day = days[mobileDayIndex];
                const dayISO = toISODate(day);
                const dayInstances = localInstances.filter((i) => i.dueDate && toISODate(i.dueDate) === dayISO);
                const daySeparatorsForDay = daySeparators.filter((s) => toISODate(s.date) === dayISO);
                const isToday = dayISO === todayISO;
                return (
                  <SwipeDayPager
                    dayKey={dayISO}
                    onSwipeLeft={goToNextDay}
                    onSwipeRight={goToPrevDay}
                    prefersReducedMotion={prefersReducedMotion}
                  >
                    <div className="mt-3">
                      <DayColumn
                        day={day}
                        isToday={isToday}
                        interactive={isToday}
                        instances={dayInstances}
                        separators={daySeparatorsForDay}
                        studentId={student.id}
                        studentName={student.name}
                        accentColor={localAccentColor}
                        prefersReducedMotion={prefersReducedMotion}
                        celebrated={celebratedToday}
                        now={now}
                        canAddTask={dayISO >= todayISO}
                        onCelebrate={handleCelebrate}
                        onToggle={handleToggle}
                            onReorderOpen={handleReorderOpen}
                        onApproveViaPasscode={handleApproveViaPasscode}
                        enableDrag={false}
                      />
                    </div>
                  </SwipeDayPager>
                );
              })()}
            </div>
          </>
        )}

        <ProjectsBand
          studentId={student.id}
          accentColor={localAccentColor}
          projects={localProjects}
          today={today}
          prefersReducedMotion={prefersReducedMotion}
        />
      </DndContext>

      {/* Outside the week/projects DndContext above — ideas never drag
          anywhere, they're a plain list (§7's "someday" scratch list). */}
      <IdeasList studentId={student.id} accentColor={localAccentColor} ideas={projectIdeas} />

      <ComingUpPanel
        open={comingUpOpen}
        onClose={() => setComingUpOpen(false)}
        items={comingUp}
        prefersReducedMotion={prefersReducedMotion}
      />

      {itemCelebration && (
        <ItemCelebration
          key={itemCelebration.key}
          origin={itemCelebration.origin}
          onDone={() => setItemCelebration(null)}
        />
      )}

      {reminderInstance?.scheduledTime && (
        <ReminderTakeover
          title={reminderInstance.title}
          scheduledTime={reminderInstance.scheduledTime}
          reducedMotion={prefersReducedMotion}
          onDismiss={() => setReminderInstance(null)}
        />
      )}
    </main>
  );
}

/** "Switch student" tucked behind a small "⋯" menu rather than sitting
 * next to the student's name — it's used rarely, so it shouldn't visually
 * compete with the week itself. */
function StudentMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-label="Menu"
        aria-expanded={open}
        className="text-base leading-none"
        style={{ color: COLORS.mutedFaint }}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded border py-1 shadow-sm"
          style={{ borderColor: COLORS.hairline, background: COLORS.background }}
        >
          <Link
            href="/"
            className="block px-3 py-1.5 text-sm hover:underline"
            style={{ color: COLORS.muted }}
          >
            ← Switch student
          </Link>
          <Link
            href="/parent"
            className="block px-3 py-1.5 text-sm hover:underline"
            style={{ color: COLORS.muted }}
          >
            Parent Mode
          </Link>
        </div>
      )}
    </div>
  );
}
