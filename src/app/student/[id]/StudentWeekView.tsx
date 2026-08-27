"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import type { Student } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import type { FamilyCalendarEvent } from "@/lib/familyCalendar";
import { addDays, defaultWeekStart, formatDayWeekdayShort, formatMonthDayLine, formatWeekRange, toISODate } from "@/lib/dates";
import { COLORS, nextAccentColor } from "@/lib/theme";
import { isSoundMuted, playCompletionTick, playReminderChime, setSoundMuted } from "@/lib/completionSound";
import { hasBeenReminded, isReminderDue, markReminded } from "@/lib/reminders";
import { approveReviewViaPasscode, cycleAccentColorAction, reorderOpenItems, toggleInstance } from "./actions";
import { DayColumn } from "./DayColumn";
import { ComingUpPanel } from "./ComingUpPanel";
import { ItemCelebration } from "./ItemCelebration";
import { ProjectsBand } from "./ProjectsBand";
import { ReminderTakeover } from "./ReminderTakeover";
import { SwipeDayPager } from "@/components/SwipeDayPager";
import { DayPagerControls } from "@/components/DayPagerControls";
import type { DaySeparator, StudentInstance, StudentProject } from "./types";

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
  daySeparators,
  calendarEvents,
  streak,
  skipCelebratedGuard,
  requestedDayIndex,
}: {
  student: Student;
  monday: Date;
  today: Date;
  instances: StudentInstance[];
  comingUp: StudentInstance[];
  // Read-only motivational summary only (§5.4) — all authoring lives in
  // Parent Mode's /parent/projects.
  projects: StudentProject[];
  daySeparators: DaySeparator[];
  // Family-calendar events a parent has dragged/tapped onto this student's
  // board (Parent Mode's CalendarEventAssignment) — read-only here, marks
  // itself done once its own end time passes rather than being checked off.
  calendarEvents: FamilyCalendarEvent[];
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

  const [localAccentColor, setLocalAccentColor] = useState(student.accentColor);
  const [syncedAccentColor, setSyncedAccentColor] = useState(student.accentColor);
  const [localInstances, setLocalInstances] = useState(instances);
  const [syncedInstances, setSyncedInstances] = useState(instances);
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

  const weekHasAnyItems = localInstances.length > 0 || calendarEvents.length > 0;
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
        <StudentMenu muted={muted} onToggleMute={toggleMute} onOpenComingUp={() => setComingUpOpen(true)} />
      </div>

      <header
        className="mt-4 flex flex-wrap items-baseline justify-between gap-3"
        style={{ borderBottom: `2px solid ${COLORS.text}`, paddingBottom: 18 }}
      >
        <div className="flex items-baseline gap-3.5">
          <button
            type="button"
            onClick={handleCycleAccentColor}
            title="Tap to change my color"
            aria-label={`My color is ${localAccentColor}. Tap to change it.`}
            className="border-b border-dashed uppercase"
            style={{
              color: localAccentColor,
              borderColor: localAccentColor,
              fontFamily: "var(--font-syncopate)",
              fontWeight: 700,
              fontSize: 19,
              letterSpacing: "0.03em",
            }}
          >
            {student.name}&rsquo;s week
          </button>
          {/* §5.4: "Visible week range beside the name; the current
              implementation omits this and must restore it." */}
          <span style={{ color: COLORS.muted, fontSize: 12 }}>{formatWeekRange(days[0], days[5])}</span>
        </div>
        <div className="flex items-center gap-4">
          {/* §5.4: the student's own accent, not fixed cobalt; omit the
              streak phrase entirely at zero rather than showing "0-day
              streak." */}
          <span className="uppercase" style={{ color: localAccentColor, fontWeight: 700, letterSpacing: "0.04em", fontSize: 12 }}>
            {streak > 0 ? `${streak}-day streak · ` : ""}
            {todayDoneCount}/{todayInstances.length} today
          </span>
          <Link
            href={`/student/${student.id}?week=${toISODate(addDays(monday, -7))}`}
            className="uppercase hover:underline"
            style={{ color: COLORS.muted, letterSpacing: "0.04em", fontSize: 12 }}
          >
            ← Prev week
          </Link>
          {!isCurrentWeek && (
            <Link href={`/student/${student.id}`} className="hover:underline" style={{ color: COLORS.muted, fontSize: 12 }}>
              📅 Today
            </Link>
          )}
          <Link
            href={`/student/${student.id}?week=${toISODate(addDays(monday, 7))}`}
            className="uppercase hover:underline"
            style={{ color: COLORS.muted, letterSpacing: "0.04em", fontSize: 12 }}
          >
            Next week →
          </Link>
        </div>
      </header>

      {todayIsSunday && (
        <p className="mt-3 text-sm" style={{ color: COLORS.mutedFaint }}>
          No school today — nothing here is checkable until Monday.
        </p>
      )}

      {weekHasAnyItems && (
        <>
          {/* Desktop: the full six-column week (§6). Below `lg`, six
              columns of full assignment rows have no room to breathe, so
              a phone gets the swipeable single-day pager instead. */}
          <div className="mt-8 hidden grid-cols-6 lg:grid">
            {days.map((day) => {
              const dayISO = toISODate(day);
              const dayInstances = localInstances.filter((i) => i.dueDate && toISODate(i.dueDate) === dayISO);
              const daySeparatorsForDay = daySeparators.filter((s) => toISODate(s.date) === dayISO);
              const dayCalendarEvents = calendarEvents.filter((event) => event.dateISO === dayISO);
              const isToday = dayISO === todayISO;
              return (
                <DayColumn
                  key={dayISO}
                  day={day}
                  isToday={isToday}
                  interactive={isToday}
                  instances={dayInstances}
                  separators={daySeparatorsForDay}
                  calendarEvents={dayCalendarEvents}
                  now={now}
                  studentName={student.name}
                  accentColor={localAccentColor}
                  prefersReducedMotion={prefersReducedMotion}
                  celebrated={celebratedToday}
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
              currentLabel={`${formatDayWeekdayShort(days[mobileDayIndex])} · ${formatMonthDayLine(days[mobileDayIndex])}`}
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
              const dayCalendarEvents = calendarEvents.filter((event) => event.dateISO === dayISO);
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
                      calendarEvents={dayCalendarEvents}
                      studentName={student.name}
                      accentColor={localAccentColor}
                      prefersReducedMotion={prefersReducedMotion}
                      celebrated={celebratedToday}
                      now={now}
                      onCelebrate={handleCelebrate}
                      onToggle={handleToggle}
                      onReorderOpen={handleReorderOpen}
                      onApproveViaPasscode={handleApproveViaPasscode}
                      enableDrag={false}
                      compactHeader
                    />
                  </div>
                </SwipeDayPager>
              );
            })()}
          </div>
        </>
      )}

      <ProjectsBand accentColor={localAccentColor} projects={projects} />

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
function StudentMenu({
  muted,
  onToggleMute,
  onOpenComingUp,
}: {
  muted: boolean;
  onToggleMute: () => void;
  onOpenComingUp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    // §4/§6: menus close on Escape and return focus to the invoking control.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        ref={triggerRef}
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
          className="absolute right-0 top-full z-10 mt-2 whitespace-nowrap border py-1"
          style={{ borderColor: COLORS.hairline, background: COLORS.background }}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenComingUp();
            }}
            className="block w-full px-3 py-1.5 text-left text-sm hover:underline"
            style={{ color: COLORS.muted }}
          >
            Coming Up
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onToggleMute();
            }}
            className="block w-full px-3 py-1.5 text-left text-sm hover:underline"
            style={{ color: COLORS.muted }}
          >
            {muted ? "🔈 Turn sound on" : "🔊 Turn sound off"}
          </button>
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
