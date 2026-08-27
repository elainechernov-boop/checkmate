"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { InstanceStatus } from "@/generated/prisma/enums";
import { formatDayWeekdayShort, formatMonthDayLine, toISODate } from "@/lib/dates";
import { splitBySeparators } from "@/lib/daySeparators";
import { minutesProgress, sumEstimatedMinutes } from "@/lib/estimatedMinutes";
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
      className="mb-1.5 rounded-sm py-1 text-xs"
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
 * "Before breakfast"). Bounds where a student's own drag-reorder can reach
 * (see DayColumn's handleDragEnd). */
function SeparatorDivider({ label }: { label: string }) {
  return (
    <div className="my-1.5 flex items-center gap-2">
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
      <span
        className="shrink-0 font-medium uppercase"
        style={{ color: COLORS.muted, fontSize: "0.65rem", letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
    </div>
  );
}

function SortableRow({
  instance,
  prefersReducedMotion,
  isLast,
  accentColor,
  now,
  onToggle,
}: {
  instance: StudentInstance;
  prefersReducedMotion: boolean;
  isLast: boolean;
  accentColor: string;
  now: Date;
  onToggle: (origin: { x: number; y: number }) => void;
  // Open-bucket rows are never pendingReview (§6's ordering), so this
  // variant has no need for the approve-via-passcode prop at all.
}) {
  // dnd-kit owns this wrapper's transform (drag position + reorder FLIP);
  // Framer Motion's animations inside AssignmentRow stay on a separate node
  // so the two never fight over the same element's transform. The whole row
  // is the drag target now (no separate handle glyph) — a small activation
  // distance (set on the DndContext's sensor below) lets a plain click still
  // reach the title/arrow buttons; only a real drag past that threshold
  // starts a reorder, same trick ParentWeekBoard's rows use.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <AssignmentRow
        instance={instance}
        interactive
        prefersReducedMotion={prefersReducedMotion}
        isLast={isLast}
        accentColor={accentColor}
        now={now}
        onToggle={onToggle}
      />
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
  onReorderOpen,
  onApproveViaPasscode,
  enableDrag = true,
  compactHeader = false,
}: {
  day: Date;
  isToday: boolean;
  interactive: boolean;
  instances: StudentInstance[];
  // §6 "Morning/Afternoon/Evening" — parent-placed, shown every day they're
  // set on, not just today; only today's own SortableContext (below) treats
  // them as reorder boundaries.
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
  onReorderOpen: (orderedIds: string[]) => void;
  onApproveViaPasscode: (instance: StudentInstance, passcode: string, origin: { x: number; y: number }) => Promise<void>;
  // The mobile single-day pager owns this touch surface for horizontal
  // paging (SwipeDayPager) — a row-level touch-drag listener underneath it
  // would fight the page-swipe gesture for the same pointer, so the pager
  // passes false here and every row renders plain (tap-only) instead.
  enableDrag?: boolean;
  // §5.5: the mobile pager's own centered "Wed · Sep 10" heading already
  // names this day — a second weekday/date line inside the column would be
  // a duplicate. Mobile passes true and gets only the done-count line.
  compactHeader?: boolean;
}) {
  const [showTakeover, setShowTakeover] = useState(false);
  const wasAllDone = useRef<boolean | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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
    // Fire the day-complete moment exactly on the transition into "all done",
    // not on every render where it's already true (§6 step 5).
    if (allDone && wasAllDone.current === false && !celebrated) {
      setShowTakeover(true);
      onCelebrate();
    }
    wasAllDone.current = allDone;
  }, [allDone, isToday, celebrated, onCelebrate]);

  // §6 "Morning/Afternoon/Evening" — a student can drag freely within the
  // segment a separator bounds, never across one. `over` landing outside
  // `active`'s own segment (newIndex === -1) is simply a no-op: dnd-kit
  // snaps the row back to where it started, exactly like dropping nowhere.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeSegment = segments.find((segment) => segment.some((i) => i.id === active.id));
    if (!activeSegment) return;
    const oldIndex = activeSegment.findIndex((i) => i.id === active.id);
    const newIndex = activeSegment.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reorderedSegment = arrayMove(activeSegment, oldIndex, newIndex);
    const fullOrder = segments
      .flatMap((segment) => (segment === activeSegment ? reorderedSegment : segment))
      .map((i) => i.id);
    onReorderOpen(fullOrder);
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
        onToggle={(origin: { x: number; y: number }) => onToggle(instance, origin)}
        // Available even on a non-today column — a pendingReview item holds
        // its original day rather than rolling (§5), but parent approval
        // isn't gated by the student-only "today only" interactivity rule.
        onApproveViaPasscode={(passcode: string, origin: { x: number; y: number }) =>
          onApproveViaPasscode(instance, passcode, origin)
        }
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className="flex flex-1 flex-col p-3 pt-0 transition-colors"
        style={{ borderLeft: `1px solid ${COLORS.hairline}` }}
      >
        <div className="relative flex items-start justify-between pt-3">
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
              style={{ color: COLORS.muted, fontSize: "0.65rem", letterSpacing: "0.04em" }}
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
          <span aria-hidden className="mt-1.5 block h-[3px]" style={{ background: COLORS.hairline }}>
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
          {totalRows === 0 && calendarEvents.length === 0 && (
            <p className="py-1 text-center text-sm" style={{ color: COLORS.mutedFaint }}>
              Nothing due.
            </p>
          )}

          {rolled.map(plainRow)}

          {enableDrag && interactive && (open.length > 0 || timeSensitive.length > 0) ? (
            // Explicit `id` makes dnd-kit's internal aria-describedby id
            // deterministic — without it, dnd-kit derives it from a
            // module-level counter that isn't SSR-safe, causing a harmless
            // but real hydration-attribute mismatch (same fix already used
            // in ParentWeekBoard.tsx).
            <DndContext
              id={`day-${toISODate(day)}`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {segments.map((segment, index) => (
                // One SortableContext per segment (§6) — dnd-kit's own
                // reorder math only ever sees this segment's own draggable
                // items, and handleDragEnd's own segment check is the actual
                // boundary enforcement (this just keeps the FLIP animation
                // sane). A time-sensitive item in the segment renders as a
                // plain, non-sortable row instead (§12: still not
                // draggable), positioned right where the parent put it
                // relative to whatever else is in this segment.
                <Fragment key={index}>
                  <SortableContext
                    items={segment.filter((i) => !i.isTimeSensitive).map((i) => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {segment.map((instance) =>
                      instance.isTimeSensitive ? (
                        <AssignmentRow
                          key={instance.id}
                          instance={instance}
                          interactive={interactive && instance.status !== InstanceStatus.excused}
                          prefersReducedMotion={prefersReducedMotion}
                          isLast={instance.id === lastRowId}
                          accentColor={accentColor}
                          now={now}
                          onToggle={(origin) => onToggle(instance, origin)}
                        />
                      ) : (
                        <SortableRow
                          key={instance.id}
                          instance={instance}
                          prefersReducedMotion={prefersReducedMotion}
                          isLast={instance.id === lastRowId}
                          accentColor={accentColor}
                          now={now}
                          onToggle={(origin) => onToggle(instance, origin)}
                        />
                      )
                    )}
                  </SortableContext>
                  {separatorsInOrder[index] && <SeparatorDivider label={separatorsInOrder[index].label} />}
                </Fragment>
              ))}
            </DndContext>
          ) : (
            segments.map((segment, index) => (
              <Fragment key={index}>
                {segment.map(plainRow)}
                {separatorsInOrder[index] && <SeparatorDivider label={separatorsInOrder[index].label} />}
              </Fragment>
            ))
          )}

          {pendingReview.map(plainRow)}
          {completed.map(plainRow)}
        </div>

        {/* Pinned to the bottom of the column via the outer flex-1 column
            (design tokens: "N min total", plain and left-aligned, never
            centered below the card) — raw minutes, not hour-converted
            (formatTotalMinutes' "2h" form is for longer, aggregate totals
            like Reports, not a single day's). Hidden when no real estimate
            exists on the day (§5.4). */}
        {totalMinutes > 0 && (
          <p className="mt-auto pt-2.5 text-left" style={{ color: COLORS.mutedFaint, fontSize: "0.65rem" }}>
            {totalMinutes} min total
          </p>
        )}
      </div>
    </div>
  );
}
