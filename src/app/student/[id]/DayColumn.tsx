"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatDayWeekdayShort, formatMonthDayLine } from "@/lib/dates";
import { splitBySeparators } from "@/lib/daySeparators";
import { formatTotalMinutes, minutesProgress, sumEstimatedMinutes } from "@/lib/estimatedMinutes";
import type { FamilyCalendarEvent } from "@/lib/familyCalendar";
import { COLORS } from "@/lib/theme";
import { bucketDayInstances } from "@/lib/instanceGrouping";
import { AssignmentRow } from "./AssignmentRow";
import { DayCompleteTakeover } from "./DayCompleteTakeover";
import type { DaySeparator, StudentInstance } from "./types";

/** A parent-assigned family-calendar event (§ "the purpose is just to show
 * the kid they have this other thing going on") — read-only, never checked
 * off by the student; it marks itself done on its own once `now` passes the
 * event's own end time. Same cobalt-chip treatment as Parent Mode's own
 * AssignedCalendarEventRow, minus the hover-✕ (unassigning is a parent-only
 * action). */
function CalendarEventChip({ event, now }: { event: FamilyCalendarEvent; now: Date }) {
  const isPast = now > event.end;
  return (
    <div
      className="mb-1.5 py-1 text-xs"
      style={{
        background: isPast ? undefined : "rgba(22,87,255,0.07)",
        boxShadow: isPast ? undefined : `inset 3px 0 0 ${COLORS.cobalt}`,
        paddingLeft: "0.5rem",
        paddingRight: "0.5rem",
      }}
    >
      <span
        className="block truncate"
        style={isPast ? { color: COLORS.muted, textDecorationLine: "line-through" } : { color: COLORS.text }}
        title={event.title}
      >
        {event.title}
      </span>
      <span className="block" style={{ color: isPast ? COLORS.mutedFaint : COLORS.cobalt, fontSize: "0.7rem", fontWeight: 700 }}>
        {event.timeLabel ?? "All day"}
      </span>
    </div>
  );
}

/** §6 — a parent-placed, read-only-to-the-student divider (free text, e.g.
 * "Before breakfast"). */
function SeparatorDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2" style={{ padding: "8px 0 4px" }}>
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
      <span
        className="shrink-0 font-medium uppercase"
        style={{ color: COLORS.muted, fontSize: "9.5px", letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
    </div>
  );
}

export function DayColumn({
  day,
  isToday,
  interactive,
  instances,
  separators,
  calendarEvents,
  studentName,
  accentColor,
  prefersReducedMotion,
  celebrated,
  now,
  onCelebrate,
  onToggle,
  onApproveViaPasscode,
  compactHeader = false,
}: {
  day: Date;
  isToday: boolean;
  interactive: boolean;
  instances: StudentInstance[];
  // §6 "Morning/Afternoon/Evening" — parent-placed, shown every day they're
  // set on, not just today.
  separators: DaySeparator[];
  // This day's own parent-assigned family-calendar events (CalendarEventChip
  // above) — read-only context, not part of the day's sortOrder sequence.
  calendarEvents: FamilyCalendarEvent[];
  studentName: string;
  accentColor: string;
  prefersReducedMotion: boolean;
  celebrated: boolean;
  // Wall-clock time, refreshed every ~20s by StudentWeekView — drives the
  // live/soon/later/past time badges (see AssignmentRow).
  now: Date;
  onCelebrate: () => void;
  onToggle: (instance: StudentInstance, origin: { x: number; y: number }) => void;
  onApproveViaPasscode: (instance: StudentInstance, passcode: string, origin: { x: number; y: number }) => Promise<void>;
  // §5.5: the mobile pager's own centered "Wed · Sep 10" heading already
  // names this day — a second weekday/date line inside the column would be
  // a duplicate. Mobile passes true and gets only the done-count line.
  compactHeader?: boolean;
}) {
  const [showTakeover, setShowTakeover] = useState(false);
  // True once every real item is done but the completion wasn't the
  // student's own doing (e.g. a parent approved the last pendingReview item
  // from Parent Mode while this student wasn't looking) — the takeover
  // waits for them to tap the "Finish the day" row below instead of playing
  // off-screen the moment the next poll notices.
  const [awaitingFinish, setAwaitingFinish] = useState(false);
  // Have we already fired-or-prompted for the current streak of "all done"?
  // Only ever set inside that success path below — never merely because
  // `celebrated` read as true, since StudentWeekView's own `celebratedToday`
  // starts as a placeholder `true` (avoiding an SSR flash) before its
  // effect corrects it to the real localStorage value a moment later; if
  // this ref latched onto that placeholder pass, the correction to `false`
  // right after would arrive too late to ever be acted on.
  const hasHandledRef = useRef(false);
  // Set synchronously by this student's own tap (toggleFromRow/approveFromRow
  // below), just before the toggle/approve call that might complete the day
  // — read by the effect below in the very next render it causes, then
  // cleared every render so a later, unrelated change (a poll picking up an
  // external approval) always defaults to "not me."
  const justActedRef = useRef(false);

  const { rolled, timeSensitive, open, pendingReview, completed } = bucketDayInstances(instances);
  // §6/§12: time-sensitive items share the same sortOrder numbering space as
  // ordinary open items (Parent Mode's own drag-reorder never treats them
  // specially — see ParentWeekBoard.tsx), so they're segmented by the day's
  // separators exactly the same way: wherever the parent actually placed
  // one relative to "Morning"/"Afternoon"/whatever she typed, that's where
  // it shows up here too, instead of always floating above every separator
  // regardless of where she put it.
  const { segments, separatorsInOrder } = splitBySeparators([...open, ...timeSensitive], separators);
  const allDone =
    instances.length > 0 &&
    open.length === 0 &&
    timeSensitive.length === 0 &&
    pendingReview.length === 0 &&
    rolled.length === 0;
  const totalRows = rolled.length + timeSensitive.length + open.length + pendingReview.length + completed.length;
  // §5.4: real estimates only — an untimed task contributes nothing to
  // either total, and both totals/the bar below hide themselves (via the
  // `> 0` guards) rather than ever showing a fabricated number.
  const totalMinutes = sumEstimatedMinutes(instances);
  const { done: doneMinutes, total: progressTotalMinutes } = minutesProgress(instances);
  const progressPercent = progressTotalMinutes > 0 ? Math.min(100, Math.round((doneMinutes / progressTotalMinutes) * 100)) : 0;
  // The column's true bottom-to-top order (rolled -> segments [time-sensitive
  // and open, interleaved by separator placement] -> pendingReview ->
  // completed, §6/§12) regardless of which bucket a row is rendered from —
  // only this one row skips its trailing divider.
  const orderedRows = [...rolled, ...segments.flat(), ...pendingReview, ...completed];
  const lastRowId = orderedRows.length > 0 ? orderedRows[orderedRows.length - 1].id : null;

  useEffect(() => {
    if (!isToday) return;
    if (!allDone) {
      // Undoing the item that completed the day is a real external event
      // (Parent Mode, or the student's own undo) this effect is the right
      // place to react to, same reasoning as the rest of this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (awaitingFinish) setAwaitingFinish(false);
      hasHandledRef.current = false;
      justActedRef.current = false;
      return;
    }
    // Handle "all done" exactly once per genuine completion (mount already
    // finding it done counts the same as just transitioning into it) — not
    // on every later render where it's still true (§6 step 5). `celebrated`
    // still reading as its placeholder `true` just holds this off rather
    // than consuming the one attempt — see hasHandledRef's own comment.
    if (!celebrated && !hasHandledRef.current) {
      hasHandledRef.current = true;
      if (justActedRef.current) {
        // The student's own tap just now completed the last real item —
        // play the reward immediately, same as always.
        setShowTakeover(true);
        onCelebrate();
      } else {
        // Everything's done, but not through anything the student just did
        // here — most often a parent approving the last pendingReview item
        // from Parent Mode. Wait for them to claim it themselves instead of
        // firing a full-screen takeover they aren't even looking at.
        setAwaitingFinish(true);
      }
    }
    justActedRef.current = false;
  }, [allDone, isToday, celebrated, onCelebrate, awaitingFinish]);

  function handleFinishDay() {
    setAwaitingFinish(false);
    setShowTakeover(true);
    onCelebrate();
  }

  // Wrap onToggle/onApproveViaPasscode so the effect above can tell "the
  // student just did this, right here" apart from a status change that
  // arrived through props (a poll refresh noticing an external approval).
  function toggleFromRow(instance: StudentInstance) {
    return (origin: { x: number; y: number }) => {
      justActedRef.current = true;
      onToggle(instance, origin);
    };
  }

  function approveFromRow(instance: StudentInstance) {
    return (passcode: string, origin: { x: number; y: number }) => {
      justActedRef.current = true;
      return onApproveViaPasscode(instance, passcode, origin);
    };
  }

  function plainRow(instance: StudentInstance) {
    const rowInteractive = interactive && instance.status !== InstanceStatus.excused;
    return (
      <AssignmentRow
        key={instance.id}
        instance={instance}
        interactive={rowInteractive}
        prefersReducedMotion={prefersReducedMotion}
        isLast={instance.id === lastRowId}
        accentColor={accentColor}
        now={now}
        onToggle={toggleFromRow(instance)}
        // Available even on a non-today column — a pendingReview item holds
        // its original day rather than rolling (§5), but parent approval
        // isn't gated by the student-only "today only" interactivity rule.
        onApproveViaPasscode={approveFromRow(instance)}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="flex flex-1 flex-col transition-colors"
        style={{ borderLeft: `1px solid ${COLORS.hairline}`, padding: "10px 12px 0" }}
      >
        <div className="relative flex items-start justify-between">
          {/* The redesign's day header order (Canvas.dc.html): a short bold
              weekday first, almost all the visual weight there, then a tiny
              date + done-count line beneath it. Today's name picks up the
              student's own accent color instead of the near-black default.
              On the mobile pager, the weekday+date already appears in the
              centered pager heading above, so only the done-count remains
              here (§5.5: no duplicate day heading). */}
          <div className="flex flex-col leading-tight">
            {!compactHeader && (
              <span
                className="font-bold uppercase"
                style={{
                  color: isToday ? accentColor : COLORS.text,
                  fontSize: "0.8125rem",
                  letterSpacing: "0.04em",
                }}
              >
                {formatDayWeekdayShort(day)}
              </span>
            )}
            <span
              className="font-medium uppercase"
              style={{ color: COLORS.muted, fontSize: "0.65625rem", letterSpacing: "0.04em", paddingTop: 2 }}
            >
              {compactHeader ? `${completed.length}/${totalRows} done` : `${formatMonthDayLine(day)} · ${completed.length}/${totalRows} done`}
            </span>
          </div>
          {showTakeover && (
            <DayCompleteTakeover
              studentName={studentName}
              reducedMotion={prefersReducedMotion}
              onDone={() => setShowTakeover(false)}
            />
          )}
        </div>

        {/* Minutes-done ÷ minutes-total for the day (design tokens §1.2) —
            not an assignment-count bar, in the student's own accent color.
            Hidden entirely when nothing on the day carries a real estimate
            (§5.4: never show a bar built from invented minutes). */}
        {progressTotalMinutes > 0 && (
          <span aria-hidden className="block h-[3px]" style={{ background: COLORS.hairline, margin: "5px 0 6px" }}>
            <span className="block h-full" style={{ width: `${progressPercent}%`, background: accentColor }} />
          </span>
        )}

        {calendarEvents.length > 0 && (
          <div className="mt-2 flex flex-col">
            {calendarEvents.map((event) => (
              <CalendarEventChip key={event.id} event={event} now={now} />
            ))}
          </div>
        )}

        <div className="mt-2 flex flex-col">
          {/* Screen 4-N: past/future empty days show whitespace only; only
              today may show the quiet "Nothing due." line. */}
          {totalRows === 0 && calendarEvents.length === 0 && isToday && (
            <p className="py-1 text-center" style={{ color: COLORS.mutedFaint, fontSize: 11.5 }}>
              Nothing due.
            </p>
          )}

          {rolled.map(plainRow)}

          {/* §14: order is parent-set and locked — the student's own view
              is display-only, same treatment for every bucket. */}
          {segments.map((segment, index) => (
            <Fragment key={index}>
              {segment.map(plainRow)}
              {separatorsInOrder[index] && <SeparatorDivider label={separatorsInOrder[index].label} />}
            </Fragment>
          ))}

          {pendingReview.map(plainRow)}
          {completed.map(plainRow)}

          {/* The manual "I'm ready to celebrate" beat for a day that
              finished without the student's own tap (mirrors
              ProjectFinishedTakeover's own button) — click the row's text,
              same as completing any other row, no checkbox. */}
          {awaitingFinish && (
            <button
              type="button"
              onClick={handleFinishDay}
              className="flex items-start py-1.5 text-left"
              style={{ gap: 7 }}
            >
              <span aria-hidden className="mt-0.5 shrink-0 self-stretch" style={{ width: 3, minHeight: 22, background: accentColor }} />
              <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: accentColor }}>Finish the day</span>
            </button>
          )}
        </div>

        {/* Pinned to the bottom of the column via the outer flex-1 column
            (design tokens: "N min total", plain and left-aligned, never
            centered below the card). Hidden when no real estimate exists
            on the day (§5.4). */}
        {totalMinutes > 0 && (
          <p className="mt-auto pt-2.5 text-left" style={{ color: COLORS.mutedFaint, fontSize: "0.65rem" }}>
            {formatTotalMinutes(totalMinutes)} total
          </p>
        )}
      </div>
    </div>
  );
}
