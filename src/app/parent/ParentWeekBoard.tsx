"use client";

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DaySeparator, Student } from "@/generated/prisma/client";
import { InstanceStatus, SchoolDayType } from "@/generated/prisma/enums";
import {
  addDays,
  defaultWeekStart,
  formatDayWeekdayShort,
  formatMonthDayLine,
  formatWeekRange,
  parseISODate,
  toISODate,
} from "@/lib/dates";
import { formatTotalMinutes } from "@/lib/estimatedMinutes";
import type { FamilyCalendarEvent } from "@/lib/familyCalendar";
import { formatRollMark } from "@/lib/instanceGrouping";
import { formatScheduledTime } from "@/lib/reminders";
import { COLORS } from "@/lib/theme";
import {
  addDaySeparatorAction,
  approveReviewAction,
  deleteAssignment,
  deleteDaySeparatorAction,
  quickCreateAssignment,
  reorderDayInstances,
  rescheduleInstance,
  returnReviewAction,
  setDayType,
} from "./planner-actions";
import { assignCalendarEventAction, dismissCalendarEventAction, unassignCalendarEventAction } from "./calendar/actions";
import { EditPanel, type EditableInstance } from "./AssignmentEditPanel";
import { SwipeDayPager } from "@/components/SwipeDayPager";
import { DayPagerControls } from "@/components/DayPagerControls";

const DAY_SHORT_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultDayIndex(days: Date[], todayISO: string, isCurrentWeek: boolean): number {
  if (!isCurrentWeek) return 0;
  const index = days.findIndex((day) => toISODate(day) === todayISO);
  return index === -1 ? 0 : index;
}

const TYPE_OPTIONS: { value: SchoolDayType; label: string }[] = [
  { value: "schoolDay", label: "School day" },
  { value: "offDay", label: "Off day" },
  { value: "fieldTrip", label: "Field trip" },
  { value: "sick", label: "Sick day" },
  { value: "holiday", label: "Holiday" },
];

const TYPE_TAG: Record<SchoolDayType, string | null> = {
  schoolDay: null,
  offDay: "Off day",
  fieldTrip: "Field trip",
  sick: "Sick day",
  holiday: "Holiday",
};

// A day cell's row is either an assignment or a separator (§6) — both share
// the same sortOrder numbering space (see reorderInstances.ts), so they
// merge into one ordered, one-SortableContext list here. Unlike the
// student's own reorder, a parent isn't segment-bounded: she can move a
// separator itself, or drag an instance across one, freely.
type DayRow = { kind: "instance"; instance: EditableInstance } | { kind: "separator"; separator: DaySeparator };

function rowId(row: DayRow): string {
  return row.kind === "instance" ? row.instance.id : row.separator.id;
}

// The drag-to-place-a-new-separator handle at the bottom of each day card
// (SeparatorHandle below) isn't a row that exists yet, so it gets its own id
// namespace rather than a real instance/separator id — handleDragEnd below
// tells the two apart by this prefix.
const SEPARATOR_HANDLE_PREFIX = "sep-handle-";
function separatorHandleId(dateISO: string): string {
  return `${SEPARATOR_HANDLE_PREFIX}${dateISO}`;
}

// A dragged CalendarStrip row's drag id — the strip is shared (not
// per-student, §"one shared 6-column agenda"), so unlike the old
// per-student-prefixed scheme, this carries only the event's own id; *which*
// student it lands on comes from whichever ASSIGN_DROP_PREFIX droppable it's
// released over (see the top-level assign DndContext in ParentWeekBoard).
const CALENDAR_EVENT_PREFIX = "cal-event-";
function calendarEventDragId(eventId: string): string {
  return `${CALENDAR_EVENT_PREFIX}${eventId}`;
}

// The whole-board drop target each StudentBoard is wrapped in, inside the
// top-level assign DndContext — dropping a CalendarStrip event anywhere on
// a student's board assigns it to them (using the event's own fixed date,
// not whichever day cell it happened to land on — a parent's precise drop
// accuracy shouldn't matter more than that).
const ASSIGN_DROP_PREFIX = "assign-";
function assignDropId(studentId: string): string {
  return `${ASSIGN_DROP_PREFIX}${studentId}`;
}


export function ParentWeekBoard({
  students,
  subjects,
  monday,
  today,
  instances,
  daySeparators,
  calendarEvents,
  calendarEventAssignments,
  schoolDayTypesByStudent,
  requestedDayIndex,
}: {
  students: Student[];
  subjects: { id: string; name: string }[];
  monday: Date;
  today: Date;
  instances: EditableInstance[];
  daySeparators: DaySeparator[];
  // The family's imported Google Calendar — one shared list, rendered once
  // in CalendarStrip below (the redesign's "single biggest structural fix"
  // over the old per-student-duplicated agenda).
  calendarEvents: FamilyCalendarEvent[];
  // Which events are assigned to which student (CalendarEventAssignment) —
  // an assigned event also renders under that student's board, but it stays
  // visible in the shared strip too (a family event can apply to more than
  // one kid, and a parent may want to assign it again after unassigning).
  calendarEventAssignments: { eventKey: string; studentId: string }[];
  schoolDayTypesByStudent: Record<string, Record<string, SchoolDayType>>;
  // Set only when a mobile swipe/arrow carried the parent across a week
  // edge (see page.tsx) — otherwise null, and the smart default applies.
  requestedDayIndex: number | null;
}) {
  const router = useRouter();
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const todayISO = toISODate(today);
  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const isCurrentWeek = toISODate(monday) === toISODate(defaultWeekStart(today));
  const assignSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Recomputed every 60s, purely so an assigned event's own auto-complete
  // (now > event.end) actually ticks over without a full page reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const eventById = new Map(calendarEvents.map((event) => [event.id, event]));

  // Optimistic mirrors of the server props — without these, a drag (reorder
  // or reschedule) has nothing to show until the server action resolves and
  // Next.js revalidates, so dnd-kit's own transform resets to zero the
  // instant the drag ends and the row visibly snaps back to its old spot
  // before catching up a moment later. Same render-time resync pattern
  // StudentWeekView already uses for its own local state. Assign/unassign
  // needs this exactly as much as reorder/reschedule do — without it, a
  // dragged (or tapped) calendar event just sits still until the next
  // server round trip finishes, which reads as "it didn't work."
  const [localInstances, setLocalInstances] = useState(instances);
  const [syncedInstances, setSyncedInstances] = useState(instances);
  const [localDaySeparators, setLocalDaySeparators] = useState(daySeparators);
  const [syncedDaySeparators, setSyncedDaySeparators] = useState(daySeparators);
  const [localAssignments, setLocalAssignments] = useState(calendarEventAssignments);
  const [syncedAssignments, setSyncedAssignments] = useState(calendarEventAssignments);
  if (instances !== syncedInstances) {
    setSyncedInstances(instances);
    setLocalInstances(instances);
  }
  if (daySeparators !== syncedDaySeparators) {
    setSyncedDaySeparators(daySeparators);
    setLocalDaySeparators(daySeparators);
  }
  if (calendarEventAssignments !== syncedAssignments) {
    setSyncedAssignments(calendarEventAssignments);
    setLocalAssignments(calendarEventAssignments);
  }

  // The shared strip stays a plain list of every calendar event regardless
  // of assignment state — a family event (e.g. a doctor's appointment) can
  // apply to more than one kid, so assigning it to one student's board must
  // not remove it from the shared agenda everyone else still sees.
  const eventsByStudent = new Map<string, FamilyCalendarEvent[]>();
  const assignedStudentIdsByEvent = new Map<string, Set<string>>();
  for (const assignment of localAssignments) {
    const calEvent = eventById.get(assignment.eventKey);
    if (!calEvent) continue;
    if (!eventsByStudent.has(assignment.studentId)) eventsByStudent.set(assignment.studentId, []);
    eventsByStudent.get(assignment.studentId)!.push(calEvent);
    if (!assignedStudentIdsByEvent.has(assignment.eventKey)) assignedStudentIdsByEvent.set(assignment.eventKey, new Set());
    assignedStudentIdsByEvent.get(assignment.eventKey)!.add(assignment.studentId);
  }

  // §4 "Async feedback" — every optimistic action below reverts to
  // `previous` on failure (already true) and now also surfaces a quiet,
  // auto-dismissing message instead of failing silently.
  const [actionError, setActionError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  function reportError(message: string) {
    setActionError(message);
    if (errorTimeoutRef.current) window.clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = window.setTimeout(() => setActionError(null), 5000);
  }

  async function handleAssign(eventId: string, studentId: string) {
    const previous = localAssignments;
    if (!previous.some((a) => a.eventKey === eventId && a.studentId === studentId)) {
      setLocalAssignments((current) => [...current, { eventKey: eventId, studentId }]);
    }
    try {
      await assignCalendarEventAction(eventId, studentId);
    } catch {
      setLocalAssignments(previous);
      reportError("Couldn't assign that event. Try again.");
    }
  }

  async function handleUnassign(eventId: string, studentId: string) {
    const previous = localAssignments;
    setLocalAssignments((current) => current.filter((a) => !(a.eventKey === eventId && a.studentId === studentId)));
    try {
      await unassignCalendarEventAction(eventId, studentId);
    } catch {
      setLocalAssignments(previous);
      reportError("Couldn't remove that event. Try again.");
    }
  }

  async function handleAssignDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId.startsWith(CALENDAR_EVENT_PREFIX) || !overId.startsWith(ASSIGN_DROP_PREFIX)) return;
    const eventId = activeId.slice(CALENDAR_EVENT_PREFIX.length);
    const studentId = overId.slice(ASSIGN_DROP_PREFIX.length);
    await handleAssign(eventId, studentId);
  }

  // The mobile pager's day, shared across every student's board below (a
  // parent planning "today" wants to see every kid's today at once, not
  // page through them independently) — same render-time resync pattern
  // StudentWeekView uses for its own mobile day index.
  const [mobileDayIndex, setMobileDayIndex] = useState(
    () => requestedDayIndex ?? defaultDayIndex(days, todayISO, isCurrentWeek)
  );
  const [syncedMonday, setSyncedMonday] = useState(monday);
  if (toISODate(monday) !== toISODate(syncedMonday)) {
    setSyncedMonday(monday);
    setMobileDayIndex(requestedDayIndex ?? defaultDayIndex(days, todayISO, isCurrentWeek));
  }

  // §5.6 "Parent mobile architecture" — one student and one day at a time,
  // not every board stacked. Plain text tabs (`Miles · Violet`); changing
  // the selected day (above) never resets which student is selected here.
  const [selectedStudentId, setSelectedStudentId] = useState(students[0]?.id ?? "");
  const mobileStudentId = students.some((s) => s.id === selectedStudentId) ? selectedStudentId : (students[0]?.id ?? "");

  function goToDayIndex(index: number) {
    setMobileDayIndex(index);
  }
  function goToPrevDay() {
    if (mobileDayIndex > 0) {
      setMobileDayIndex(mobileDayIndex - 1);
    } else {
      router.push(`/parent?week=${prevWeek}&day=5`);
    }
  }
  function goToNextDay() {
    if (mobileDayIndex < 5) {
      setMobileDayIndex(mobileDayIndex + 1);
    } else {
      router.push(`/parent?week=${nextWeek}&day=0`);
    }
  }

  /** §5 "field trips and off days" — reached from each card's own day
   * header now (not a separate strip), and scoped to just that one
   * student (§5's per-kid sick days/field trips — the family-wide academic
   * calendar lives on /parent/calendar instead). Recurring occurrences on
   * the day disappear via re-materialization; any standalone instance left
   * behind moves straight to the next school day — see setDayType. */
  async function handleDayTypeChange(studentId: string, dateISO: string, type: SchoolDayType) {
    try {
      await setDayType(studentId, dateISO, type);
    } catch {
      reportError("Couldn't change that day's type. Try again.");
    }
  }

  /** The hover-X on each row (Parent Mode only) — a deliberate small target
   * the parent clicks on purpose, so unlike the edit sheet's delete this
   * skips any "are you sure": always deletes just this one occurrence, and
   * the resulting Undo entry (recordUndo in deleteAssignment) is the
   * recovery path, not a confirmation prompt. */
  async function handleDeleteInstance(instanceId: string) {
    try {
      await deleteAssignment(instanceId, "only");
    } catch {
      reportError("Couldn't delete that. Try again.");
    }
  }

  /** Same-day drag-reorder (mixing assignments and separators freely — a
   * parent isn't segment-bounded the way a student is). Optimistic: the
   * new sortOrder shows immediately, matching what the server is about to
   * assign, and only reverts if the action actually fails. */
  async function handleReorderDay(studentId: string, dateISO: string, orderedIds: string[]) {
    const previousInstances = localInstances;
    const previousSeparators = localDaySeparators;
    const orderIndex = new Map(orderedIds.map((id, index) => [id, index]));
    setLocalInstances((current) =>
      current.map((instance) => (orderIndex.has(instance.id) ? { ...instance, sortOrder: orderIndex.get(instance.id)! } : instance))
    );
    setLocalDaySeparators((current) =>
      current.map((separator) => (orderIndex.has(separator.id) ? { ...separator, sortOrder: orderIndex.get(separator.id)! } : separator))
    );
    try {
      await reorderDayInstances(studentId, dateISO, orderedIds);
    } catch {
      setLocalInstances(previousInstances);
      setLocalDaySeparators(previousSeparators);
      reportError("Couldn't reorder that. Try again.");
    }
  }

  /** Cross-day drag-reschedule — mirrors assignmentEdits.ts's own
   * rescheduleInstance, which always sets both dueDate and originalDueDate
   * to the new date regardless of whether the instance is series-linked. */
  async function handleReschedule(instanceId: string, newDateISO: string) {
    const previousInstances = localInstances;
    const newDueDate = parseISODate(newDateISO);
    setLocalInstances((current) =>
      current.map((instance) => (instance.id === instanceId ? { ...instance, dueDate: newDueDate, originalDueDate: newDueDate } : instance))
    );
    try {
      await rescheduleInstance(instanceId, newDateISO);
    } catch {
      setLocalInstances(previousInstances);
      reportError("Couldn't reschedule that. Try again.");
    }
  }

  return (
    <>
      <div className="mt-5 flex items-center justify-between text-sm">
        <Link href={`/parent?week=${prevWeek}`} className="px-1 text-[#6B6B6B] hover:underline">
          ← Prev week
        </Link>
        {!isCurrentWeek && (
          <Link href="/parent" className="px-1 text-[#6B6B6B] hover:underline">
            Today
          </Link>
        )}
        <Link href={`/parent?week=${nextWeek}`} className="px-1 text-[#6B6B6B] hover:underline">
          Next week →
        </Link>
      </div>

      {/* Below `lg`, six columns per student don't fit, and stacking every
          board (the old mobile layout) buries the second kid's board below
          a full scroll of the first's — §5.6's "one student and one day at
          a time" instead: plain text tabs pick the student, the pager below
          pages the day, and only that one student's board renders its
          mobile section (see StudentBoard's mobileActive). */}
      {students.length > 1 && (
        <div className="mt-6 flex items-center gap-1.5 lg:hidden" style={{ fontSize: 12 }}>
          {students.map((student, index) => {
            const active = student.id === mobileStudentId;
            return (
              <span key={student.id} className="flex items-center gap-1.5">
                {index > 0 && <span style={{ color: COLORS.mutedFaint }}>·</span>}
                <button
                  type="button"
                  onClick={() => setSelectedStudentId(student.id)}
                  aria-pressed={active}
                  style={{
                    color: active ? student.accentColor : COLORS.muted,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {student.name}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {students.length > 0 && (
        <div className="lg:hidden">
          <DayPagerControls
            activeIndex={mobileDayIndex}
            labels={DAY_SHORT_LABELS}
            currentLabel={`${formatDayWeekdayShort(days[mobileDayIndex])} · ${formatMonthDayLine(days[mobileDayIndex])}`}
            accentColor={students.find((s) => s.id === mobileStudentId)?.accentColor ?? COLORS.text}
            onSelect={goToDayIndex}
            onPrev={goToPrevDay}
            onNext={goToNextDay}
          />
        </div>
      )}

      {students.length === 0 && (
        <p className="mt-10 text-sm text-[#6B6B6B]">
          Add a student to start planning.{" "}
          <Link href="/parent/students" className="underline">
            Add one now
          </Link>
          .
        </p>
      )}

      {/* One shared agenda strip (the redesign's "single biggest structural
          fix" over the old per-student-duplicated feed) — draggable events
          live in the same DndContext as every student's board-wide drop
          target below, so a drag from here can land on any of them. Tap the
          per-student initial chip works too, no drag required. */}
      {students.length > 0 && (
        <DndContext id="calendar-assign" sensors={assignSensors} onDragEnd={handleAssignDragEnd}>
          <CalendarStrip
            days={days}
            events={calendarEvents}
            students={students}
            assignedStudentIdsByEvent={assignedStudentIdsByEvent}
            onAssign={handleAssign}
            onUnassign={handleUnassign}
            mobileSelectedDateISO={toISODate(days[mobileDayIndex])}
          />

          {students.map((student) => (
            <AssignDropZone key={student.id} studentId={student.id}>
              <StudentBoard
                student={student}
                days={days}
                todayISO={todayISO}
                instances={localInstances.filter((i) => i.studentId === student.id)}
                daySeparators={localDaySeparators.filter((s) => s.studentId === student.id)}
                assignedEvents={eventsByStudent.get(student.id) ?? []}
                onUnassign={(eventId) => handleUnassign(eventId, student.id)}
                now={now}
                subjects={subjects}
                schoolDayTypes={schoolDayTypesByStudent[student.id] ?? {}}
                onDelete={handleDeleteInstance}
                onDayTypeChange={(dateISO, type) => handleDayTypeChange(student.id, dateISO, type)}
                onReorderDay={(dateISO, orderedIds) => handleReorderDay(student.id, dateISO, orderedIds)}
                onReschedule={handleReschedule}
                mobileDayIndex={mobileDayIndex}
                mobileActive={student.id === mobileStudentId}
                onSwipeLeft={goToNextDay}
                onSwipeRight={goToPrevDay}
              />
            </AssignDropZone>
          ))}
        </DndContext>
      )}

      <div role="alert" aria-live="assertive">
        {actionError && (
          <div
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
            style={{ background: COLORS.white, padding: "5px 8px" }}
          >
            <span style={{ color: COLORS.crimson, fontSize: 11.5 }}>{actionError}</span>
          </div>
        )}
      </div>
    </>
  );
}

function StudentBoard({
  student,
  days,
  todayISO,
  instances,
  daySeparators,
  assignedEvents,
  onUnassign,
  now,
  subjects,
  schoolDayTypes,
  onDelete,
  onDayTypeChange,
  onReorderDay,
  onReschedule,
  mobileDayIndex,
  mobileActive,
  onSwipeLeft,
  onSwipeRight,
}: {
  student: Student;
  days: Date[];
  todayISO: string;
  instances: EditableInstance[];
  daySeparators: DaySeparator[];
  // Calendar events assigned to this student (CalendarEventAssignment) — the
  // shared CalendarStrip keeps showing every event regardless, so this is
  // purely "which of them are also on this student's board."
  assignedEvents: FamilyCalendarEvent[];
  onUnassign: (eventId: string) => void;
  now: Date;
  subjects: { id: string; name: string }[];
  schoolDayTypes: Record<string, SchoolDayType>;
  onDelete: (id: string) => void;
  onDayTypeChange: (dateISO: string, type: SchoolDayType) => void;
  onReorderDay: (dateISO: string, orderedIds: string[]) => void | Promise<void>;
  onReschedule: (instanceId: string, newDateISO: string) => void | Promise<void>;
  mobileDayIndex: number;
  // §5.6 — only the currently-selected student's board renders its mobile
  // (single-day) section; every board still renders its desktop grid
  // unconditionally (that one is already CSS-hidden below `lg` regardless).
  mobileActive: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  // A small activation distance lets a plain click still open the edit
  // panel — only a real drag (past this threshold) starts a reorder/reschedule.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const prefersReducedMotion = !!useReducedMotion();

  // Where the drag-to-place SeparatorHandle landed (or the "+ Separator"
  // button was clicked) — an inline text editor opens at this exact spot in
  // that day's card until it's submitted or cancelled (SeparatorCreateRow).
  const [creatingSeparator, setCreatingSeparator] = useState<{ dateISO: string; index: number } | null>(null);

  const eventsByDay = new Map<string, FamilyCalendarEvent[]>();
  for (const event of assignedEvents) {
    if (!eventsByDay.has(event.dateISO)) eventsByDay.set(event.dateISO, []);
    eventsByDay.get(event.dateISO)!.push(event);
  }

  const byDay = new Map<string, DayRow[]>();
  for (const day of days) byDay.set(toISODate(day), []);
  for (const instance of instances) {
    if (!instance.dueDate) continue;
    const key = toISODate(instance.dueDate);
    byDay.get(key)?.push({ kind: "instance", instance });
  }
  for (const separator of daySeparators) {
    const key = toISODate(separator.date);
    byDay.get(key)?.push({ kind: "separator", separator });
  }
  const sortOrderOf = (row: DayRow) => (row.kind === "instance" ? row.instance.sortOrder : row.separator.sortOrder);
  for (const list of byDay.values()) list.sort((a, b) => sortOrderOf(a) - sortOrderOf(b));

  function findRow(id: string): { dateISO: string; row: DayRow } | null {
    for (const [dateISO, rows] of byDay) {
      const row = rows.find((r) => rowId(r) === id);
      if (row) return { dateISO, row };
    }
    return null;
  }

  /**
   * One drag gesture, three possible outcomes (a calendar-event drag is a
   * separate DndContext entirely now — see ParentWeekBoard's own
   * handleAssignDragEnd — so this one never sees CALENDAR_EVENT_PREFIX
   * ids). Dragging the bottom-of-card SeparatorHandle (its id carries
   * SEPARATOR_HANDLE_PREFIX — never a real row) drops an inline creator at
   * that spot instead of moving anything (see creatingSeparator below); it
   * never leaves the day it started in, since a separator has nowhere else
   * to go. Otherwise: dropped within the same day reorders that day's cards
   * (her own visual ordering, mixing assignments and separators freely —
   * §6) and dropped on a different day reschedules it. A separator never
   * leaves its own day — there's no "reschedule" for one, so a cross-day
   * drop of one is just ignored. `over.id` is either a day's own dateISO
   * (dropped on empty space) or another row's id (dropped on/near a row) —
   * both resolve back to "which day."
   */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith(SEPARATOR_HANDLE_PREFIX)) {
      const sourceDateISO = activeId.slice(SEPARATOR_HANDLE_PREFIX.length);
      const targetDateISO = byDay.has(overId) ? overId : (findRow(overId)?.dateISO ?? null);
      if (targetDateISO !== sourceDateISO) return;
      const dayList = byDay.get(sourceDateISO) ?? [];
      const overIndex = dayList.findIndex((r) => rowId(r) === overId);
      setCreatingSeparator({ dateISO: sourceDateISO, index: overIndex === -1 ? dayList.length : overIndex });
      return;
    }

    const found = findRow(activeId);
    if (!found) return;
    const { dateISO: sourceDateISO, row: activeRow } = found;

    const targetDateISO = byDay.has(overId) ? overId : (findRow(overId)?.dateISO ?? null);
    if (!targetDateISO) return;

    if (targetDateISO === sourceDateISO) {
      if (activeId === overId) return;
      const dayList = byDay.get(sourceDateISO) ?? [];
      const oldIndex = dayList.findIndex((r) => rowId(r) === activeId);
      const newIndex = dayList.findIndex((r) => rowId(r) === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(dayList, oldIndex, newIndex).map(rowId);
      await onReorderDay(sourceDateISO, reordered);
    } else if (activeRow.kind === "instance") {
      await onReschedule(activeId, targetDateISO);
    }
  }

  /** SeparatorCreateRow's submit — one round trip creates the row and lands
   * it at the exact spot the handle was dropped (see addDaySeparatorAction). */
  async function handleCreateSeparator(dateISO: string, index: number, label: string) {
    const existingOrderedIds = (byDay.get(dateISO) ?? []).map(rowId);
    setCreatingSeparator(null);
    await addDaySeparatorAction(student.id, dateISO, label, index, existingOrderedIds);
  }

  return (
    <section
      className={`mt-5 rounded-xl ${mobileActive ? "" : "hidden lg:block"}`}
      style={{ background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.06)", padding: "20px 24px" }}
    >
      <div className="flex items-baseline gap-3.5 border-b pb-3" style={{ borderColor: COLORS.hairline }}>
        <Link
          href={`/student/${student.id}`}
          className="hover:underline"
          style={{
            color: student.accentColor,
            fontFamily: "var(--font-syncopate)",
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {student.name}
        </Link>
        <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{formatWeekRange(days[0], days[5])}</span>
      </div>
      {/* Explicit `id` makes dnd-kit's internal aria-describedby id
          deterministic — without it, dnd-kit derives it from a module-level
          counter that isn't SSR-safe (it keeps incrementing across
          requests on the server but resets to 0 on the client), causing a
          harmless but real hydration-attribute mismatch. */}
      <DndContext
        id={`student-${student.id}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="mt-3 hidden grid-cols-6 lg:grid">
          {days.map((day) => {
            const dateISO = toISODate(day);
            return (
              <DayCell
                key={dateISO}
                studentId={student.id}
                day={day}
                dateISO={dateISO}
                isToday={dateISO === todayISO}
                accentColor={student.accentColor}
                dayType={schoolDayTypes[dateISO] ?? SchoolDayType.schoolDay}
                rows={byDay.get(dateISO) ?? []}
                events={eventsByDay.get(dateISO) ?? []}
                onUnassign={onUnassign}
                now={now}
                subjects={subjects}
                onDelete={onDelete}
                onDayTypeChange={onDayTypeChange}
                creatingSeparatorIndex={creatingSeparator?.dateISO === dateISO ? creatingSeparator.index : null}
                onRequestSeparator={() => setCreatingSeparator({ dateISO, index: (byDay.get(dateISO) ?? []).length })}
                onSubmitSeparator={(label) => handleCreateSeparator(dateISO, creatingSeparator?.index ?? 0, label)}
                onCancelSeparator={() => setCreatingSeparator(null)}
              />
            );
          })}
        </div>
      </DndContext>

      {mobileActive && (() => {
        const day = days[mobileDayIndex];
        const dateISO = toISODate(day);
        return (
          <div className="mt-3 lg:hidden">
            <SwipeDayPager
              dayKey={dateISO}
              onSwipeLeft={onSwipeLeft}
              onSwipeRight={onSwipeRight}
              prefersReducedMotion={prefersReducedMotion}
            >
              <DayCell
                studentId={student.id}
                day={day}
                dateISO={dateISO}
                isToday={dateISO === todayISO}
                accentColor={student.accentColor}
                dayType={schoolDayTypes[dateISO] ?? SchoolDayType.schoolDay}
                rows={byDay.get(dateISO) ?? []}
                events={eventsByDay.get(dateISO) ?? []}
                onUnassign={onUnassign}
                now={now}
                subjects={subjects}
                onDelete={onDelete}
                onDayTypeChange={onDayTypeChange}
                enableDrag={false}
                creatingSeparatorIndex={creatingSeparator?.dateISO === dateISO ? creatingSeparator.index : null}
                onRequestSeparator={() => setCreatingSeparator({ dateISO, index: (byDay.get(dateISO) ?? []).length })}
                onSubmitSeparator={(label) => handleCreateSeparator(dateISO, creatingSeparator?.index ?? 0, label)}
                onCancelSeparator={() => setCreatingSeparator(null)}
              />
            </SwipeDayPager>
          </div>
        );
      })()}
    </section>
  );
}

function DayCell({
  studentId,
  day,
  dateISO,
  isToday,
  accentColor,
  dayType,
  rows,
  events,
  onUnassign,
  now,
  subjects,
  onDelete,
  onDayTypeChange,
  enableDrag = true,
  creatingSeparatorIndex,
  onRequestSeparator,
  onSubmitSeparator,
  onCancelSeparator,
}: {
  studentId: string;
  day: Date;
  dateISO: string;
  isToday: boolean;
  accentColor: string;
  dayType: SchoolDayType;
  rows: DayRow[];
  // This student's own assigned calendar events for this day (§ Parent Mode
  // "on top of the view") — read-only-ish context (unassign only), not part
  // of the day's own sortOrder sequence at all.
  events: FamilyCalendarEvent[];
  onUnassign: (eventId: string) => void;
  now: Date;
  subjects: { id: string; name: string }[];
  onDelete: (id: string) => void;
  onDayTypeChange: (dateISO: string, type: SchoolDayType) => void;
  // The mobile day pager (single day, swipe-driven) passes false: reorder
  // and cross-day-reschedule drags need the desktop grid's per-student
  // DndContext and would otherwise contend with the pager's own swipe
  // gesture for the same touch (see StaticRow).
  enableDrag?: boolean;
  // §6 divider — set only for the one day whose inline creator (typed text,
  // or a Morning/Afternoon/Evening quick-pick) is currently open, and only
  // to the exact row index it should appear at (see StudentBoard's
  // creatingSeparator and handleDragEnd's SeparatorHandle branch).
  creatingSeparatorIndex: number | null;
  onRequestSeparator: () => void;
  onSubmitSeparator: (label: string) => void;
  onCancelSeparator: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateISO });
  const [text, setText] = useState("");
  const [editingType, setEditingType] = useState(false);
  const tag = TYPE_TAG[dayType];

  // §3's estimatedMinutes, summed for the day — assignment work and project
  // work kept as two separate totals (project time isn't schoolwork load
  // the same way, §7) rather than one blended number.
  let assignmentMinutes = 0;
  let projectMinutes = 0;
  for (const row of rows) {
    if (row.kind !== "instance") continue;
    const minutes = row.instance.estimatedMinutes ?? row.instance.series?.estimatedMinutes ?? null;
    if (minutes == null) continue;
    if (row.instance.project) projectMinutes += minutes;
    else assignmentMinutes += minutes;
  }

  function submitQuickAdd() {
    const trimmed = text.trim();
    setText("");
    if (trimmed) void quickCreateAssignment(studentId, dateISO, trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitQuickAdd();
    } else if (event.key === "Escape") {
      setText("");
    }
  }

  return (
    <div className="flex flex-col">
      <div
        ref={setNodeRef}
        // Named group (`group/divider`, not plain `group`) — this wraps
        // every row below, each of which already has its own unnamed
        // `group` scoping its own hover-X delete button; a plain `group`
        // here would make hovering anywhere in the whole day cell reveal
        // every row's delete button at once, not just the one under the
        // pointer. The divider handle below opts in with `group-hover/divider`.
        className="group/divider min-h-[100px] px-2.5 transition-colors"
        style={{
          borderLeft: `1px solid ${COLORS.hairline}`,
          background: isOver ? `${accentColor}0d` : undefined,
        }}
      >
        {/* §5 "field trips and off days" — click the date itself to change
            the day's type, matching the student view's own weekday-first
            two-line header order. */}
        {editingType ? (
          <select
            autoFocus
            value={dayType}
            onChange={(event) => {
              setEditingType(false);
              onDayTypeChange(dateISO, event.target.value as SchoolDayType);
            }}
            onBlur={() => setEditingType(false)}
            className="hr-flat-input text-xs"
            style={{ width: "auto", color: COLORS.text }}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setEditingType(true)}
            className="text-left leading-tight"
            title="Click to mark this day off, a field trip, sick, or a holiday"
          >
            <span
              className="block font-bold uppercase"
              style={{
                // "Today" is a fixed cobalt system marker on the parent's own
                // board (not the student's own accent — that's reserved for
                // the student's own view, README's five-item accent list).
                // An off/sick/holiday day mutes to faint gray; a field trip
                // still reads as a normal school day, its tag carries the
                // attention color instead.
                color: isToday
                  ? COLORS.cobalt
                  : dayType === SchoolDayType.offDay || dayType === SchoolDayType.sick || dayType === SchoolDayType.holiday
                    ? COLORS.mutedFaint
                    : COLORS.text,
                fontSize: isToday ? "1.05rem" : "0.85rem",
                letterSpacing: "0.04em",
              }}
            >
              {formatDayWeekdayShort(day)}
              {tag && (
                <span
                  className="ml-1"
                  style={{ fontWeight: 400, fontSize: "0.6rem", color: dayType === SchoolDayType.fieldTrip ? COLORS.crimson : undefined }}
                >
                  · {tag}
                </span>
              )}
            </span>
            <span
              className="block font-medium uppercase"
              style={{ color: COLORS.muted, fontSize: "0.6rem", letterSpacing: "0.04em" }}
            >
              {formatMonthDayLine(day)}
            </span>
          </button>
        )}

        {events.length > 0 && (
          // This student's own assigned calendar events (README's drag-or-
          // tap-to-assign) — read-only context sitting apart from the day's
          // actual sortOrder sequence, cobalt-chip styled so it reads as
          // "something else going on," not schoolwork. Never checked off by
          // the student; it just marks itself done once its own end time
          // passes (see isPast below). Hover-✕ sends it back to the shared
          // agenda (unassignCalendarEventAction) rather than deleting it.
          <div className="mt-1.5 flex flex-col gap-1">
            {events.map((event) => (
              <AssignedCalendarEventRow key={event.id} event={event} onUnassign={() => onUnassign(event.id)} now={now} />
            ))}
          </div>
        )}

        {enableDrag ? (
          <SortableContext items={rows.map(rowId)} strategy={verticalListSortingStrategy}>
            <div className="mt-2 flex flex-col">
              {creatingSeparatorIndex === 0 && (
                <SeparatorCreateRow onSubmit={onSubmitSeparator} onCancel={onCancelSeparator} />
              )}
              {rows.map((row, index) => (
                <Fragment key={rowId(row)}>
                  {row.kind === "separator" ? (
                    <SeparatorRow
                      separator={row.separator}
                      onDelete={() => deleteDaySeparatorAction(row.separator.id)}
                    />
                  ) : (
                    <DraggableRow
                      instance={row.instance}
                      isLast={index === rows.length - 1 && creatingSeparatorIndex == null}
                      subjects={subjects}
                      accentColor={accentColor}
                      onDelete={() => onDelete(row.instance.id)}
                    />
                  )}
                  {creatingSeparatorIndex === index + 1 && (
                    <SeparatorCreateRow onSubmit={onSubmitSeparator} onCancel={onCancelSeparator} />
                  )}
                </Fragment>
              ))}
            </div>
          </SortableContext>
        ) : (
          <div className="mt-2 flex flex-col">
            {rows.map((row, index) =>
              row.kind === "separator" ? (
                <StaticSeparatorRow key={row.separator.id} separator={row.separator} />
              ) : (
                <StaticRow
                  key={row.instance.id}
                  instance={row.instance}
                  isLast={index === rows.length - 1}
                  subjects={subjects}
                  accentColor={accentColor}
                  onDelete={() => onDelete(row.instance.id)}
                />
              )
            )}
            {creatingSeparatorIndex != null && (
              <SeparatorCreateRow onSubmit={onSubmitSeparator} onCancel={onCancelSeparator} />
            )}
          </div>
        )}

        {/* Permanent "Type here, press Enter" input — every day gets one,
            not just today (a parent plans ahead across the whole week),
            and it's never gated behind a "+ Add" button. */}
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type here, press Enter"
          className="mt-[5px] w-full border-b bg-transparent outline-none"
          style={{
            borderColor: COLORS.hairline,
            color: COLORS.text,
            borderBottomStyle: "dashed",
            fontSize: 11.5,
            padding: "3px 0",
          }}
        />
        <div className="mt-1.5">
          {/* §6 divider — click to append one at the bottom, or (desktop
              only) drag this same handle to drop it exactly where it
              belongs among the day's rows above. */}
          {enableDrag ? (
            <SeparatorHandle dateISO={dateISO} onClick={onRequestSeparator} />
          ) : (
            <button
              type="button"
              onClick={onRequestSeparator}
              className="text-xs text-[#A9ACB2] hover:text-[#6B6B6B]"
            >
              — Add divider
            </button>
          )}
        </div>
      </div>
      {(assignmentMinutes > 0 || projectMinutes > 0) && (
        <div style={{ borderTop: `1px solid ${COLORS.hairline}`, marginTop: 6, paddingTop: 10 }}>
          {assignmentMinutes > 0 && (
            <p className="text-center" style={{ color: COLORS.mutedFaint, fontSize: 10.5 }}>
              {formatTotalMinutes(assignmentMinutes)} total
            </p>
          )}
          {projectMinutes > 0 && (
            <p className="text-center" style={{ color: COLORS.mutedFaint, fontSize: 10.5 }}>
              {formatTotalMinutes(projectMinutes)} project time
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The visual content shared by both row variants below — everything
 * except the outer element that carries (or doesn't carry) dnd-kit's
 * sortable wiring. */
function RowContents({
  instance,
  accentColor,
  onToggleExpand,
}: {
  instance: EditableInstance;
  accentColor: string;
  onToggleExpand: () => void;
}) {
  const isPendingReview = instance.status === InstanceStatus.pendingReview;
  // Mirrors the student view's own read of "done" (§6) — struck through and
  // muted, so the parent board shows at a glance what's actually finished
  // instead of just what's been planned.
  const isDone = instance.status === InstanceStatus.done || instance.status === InstanceStatus.excused;
  const rollMark = instance.status === InstanceStatus.open ? formatRollMark(instance.rolledCount) : null;

  // Subject + estimated time underneath the title, matching the student
  // view's meta line (§9) so a parent gets the same at-a-glance context.
  const estMinutes = instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? null;
  const metaText = [instance.subject?.name, estMinutes != null ? `${estMinutes} min` : null]
    .filter(Boolean)
    .join(" · ");

  // BUILD_SPEC.md Part I §1 exact identity-tick algorithm: done/excused ->
  // hairline gray, project task -> student accent, everything else -> ink.
  // Subject is never a color, only muted text metadata (above).
  const tickColor = isDone ? COLORS.hairline : instance.project ? accentColor : COLORS.text;

  return (
    <>
      <span
        aria-hidden
        className="mt-1 inline-block self-stretch"
        style={{ width: 3, background: tickColor, flexShrink: 0 }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          <span
            className="block break-words"
            style={isDone ? { color: COLORS.muted, textDecorationLine: "line-through" } : undefined}
          >
            {instance.title}
          </span>
          {rollMark && (
            <span className="mt-0.5 shrink-0" style={{ color: COLORS.crimson, fontSize: "0.7rem" }} title={`Rolled ${instance.rolledCount} day(s)`}>
              {rollMark}
            </span>
          )}
        </span>
        {/* The meta line — click to expand the inline edit panel. Never the
            title, matching the student view's "meta line, not title" rule
            (here, title has no separate action of its own, but the click
            target stays consistent across both boards). A done row goes
            back to being just the struck-through title, matching
            Canvas.dc.html's completed rows exactly — nothing left to plan
            or check on a finished item. */}
        {!isDone && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggleExpand();
            }}
            className="block text-left"
            style={{ color: COLORS.mutedFaint, fontSize: "0.7rem", textDecoration: "underline dotted", textUnderlineOffset: "2px" }}
          >
            {metaText || "···"}
          </button>
        )}
        {/* §12: parent's own quiet confirmation that a time/reminder is set. */}
        {!isDone && instance.isTimeSensitive && instance.scheduledTime && (
          <span className="block" style={{ color: COLORS.crimson, fontSize: "0.7rem" }}>
            🕐 {formatScheduledTime(instance.scheduledTime)}
          </span>
        )}
        {isPendingReview && (
          <span className="block" style={{ color: COLORS.crimson, fontSize: "0.7rem" }}>
            🤚 Mom
          </span>
        )}
      </span>
    </>
  );
}

/** The outer frame shared by both row variants: the time-sensitive
 * highlight wash, the return note, the review controls, and the hover-X
 * delete — everything that sits around the row itself rather than inside
 * its drag surface. */
function RowFrame({
  instance,
  isLast,
  subjects,
  expanded,
  onCloseExpanded,
  onDelete,
  children,
}: {
  instance: EditableInstance;
  isLast: boolean;
  subjects: { id: string; name: string }[];
  // The redesign's inline edit panel (README §4's "identical inline-
  // expand/edit pattern, on the parent's own board") — local state owned by
  // DraggableRow/StaticRow, rendered here since this is the shared chrome
  // both variants sit inside.
  expanded: boolean;
  onCloseExpanded: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const isPendingReview = instance.status === InstanceStatus.pendingReview;

  return (
    <div
      className="group relative flex flex-col gap-1 px-1 py-0.5"
      style={{
        borderBottom: isLast ? undefined : `1px solid ${COLORS.hairline}`,
      }}
    >
      {children}

      {instance.returnNote && (
        <p className="pl-3 text-xs" style={{ color: COLORS.muted }}>
          {instance.returnNote}
        </p>
      )}

      {/* §5 step 2/4 — approve/return from Parent Mode. Kept outside the
          draggable node above (no drag listeners here) so these buttons
          never race dnd-kit's pointer handling. */}
      {isPendingReview && <ReviewControls instanceId={instance.id} />}

      {/* Hover-only quick delete — a deliberately small, precise target, so
          no confirm prompt: a parent clicking a tiny X on purpose is
          exactly the "no 'are you sure' needed" case. Kept outside the
          draggable node for the same reason ReviewControls is. */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${instance.title}`}
        title="Delete"
        className="absolute right-0.5 top-0.5 px-1 text-xs text-[#A9ACB2] opacity-100 transition-opacity lg:opacity-0 hover:text-[#1A1A1A] lg:group-hover:opacity-100"
      >
        ✕
      </button>

      {expanded && <EditPanel instance={instance} subjects={subjects} onSaved={onCloseExpanded} onCancel={onCloseExpanded} />}
    </div>
  );
}

/** §6 divider — Parent Mode's own draggable divider row: a plain
 * hairline-and-label (free text, e.g. "Before breakfast" — see
 * SeparatorCreateRow), sortable alongside assignment rows in the same
 * DndContext (unlike a student, a parent can freely reposition one or drag
 * an assignment across it). Hover-X delete, same "no confirm needed"
 * reasoning as an assignment's own. */
function SeparatorRow({ separator, onDelete }: { separator: DaySeparator; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: separator.id,
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
      className="group relative flex items-center gap-2 py-1.5 pr-4"
    >
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
      <span
        className="shrink-0 font-medium uppercase"
        style={{ color: COLORS.muted, fontSize: "0.65rem", letterSpacing: "0.06em" }}
      >
        {separator.label}
      </span>
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={`Delete ${separator.label} separator`}
        title="Delete"
        className="absolute right-0.5 top-1 px-1 text-xs text-[#A9ACB2] opacity-100 transition-opacity lg:opacity-0 hover:text-[#1A1A1A] lg:group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

/** The mobile pager's separator row — same look, no drag wiring, matching
 * StaticRow's own reasoning. Parent-only page, so no delete control is
 * dropped here for space; the desktop grid is where that lives. */
function StaticSeparatorRow({ separator }: { separator: DaySeparator }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
      <span
        className="shrink-0 font-medium uppercase"
        style={{ color: COLORS.muted, fontSize: "0.65rem", letterSpacing: "0.06em" }}
      >
        {separator.label}
      </span>
      <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
    </div>
  );
}

const SEPARATOR_PRESETS = ["Morning", "Afternoon", "Evening"];

/** The inline editor a separator's creation opens into, right at the spot
 * it'll land (see StudentBoard's creatingSeparator) — free text, or one of
 * the three quick-pick presets that used to be the only options. Enter or a
 * preset click submits; Escape or blurring empty cancels. */
function SeparatorCreateRow({ onSubmit, onCancel }: { onSubmit: (label: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const submittedRef = useRef(false);

  function submit(label: string) {
    const trimmed = label.trim();
    if (!trimmed || submittedRef.current) return;
    submittedRef.current = true;
    onSubmit(trimmed);
  }

  function cancel() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onCancel();
  }

  return (
    <div className="my-1.5 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit(text);
            } else if (event.key === "Escape") {
              cancel();
            }
          }}
          onBlur={() => (text.trim() ? submit(text) : cancel())}
          placeholder="Label (e.g. Before breakfast)"
          className="hr-flat-input min-w-0 flex-1 text-center"
        />
        <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
      </div>
      <div className="flex items-center justify-center gap-3">
        {SEPARATOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            // Keeps the input focused through the click so the onBlur above
            // never fires (and cancels) before this button's own onClick does.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => submit(preset)}
            className="hr-text-action text-[10px] hover:underline"
            style={{ color: COLORS.muted }}
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

/** §6 divider — the drag-to-place handle at the bottom of every day card.
 * Both a click (append at the bottom) and a drag (drop it exactly where it
 * belongs among the day's rows — see StudentBoard's handleDragEnd) open the
 * same SeparatorCreateRow; the small activation distance on the shared
 * PointerSensor is what lets the click still land as a click. */
function SeparatorHandle({ dateISO, onClick }: { dateISO: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: separatorHandleId(dateISO),
  });

  // §5.6/§3: "Replace the permanently visible dashed `⠿ Separator` box with
  // a quiet text action such as `— Add divider`, revealed on hover/focus
  // desktop and visible on touch layouts" (globals.css's .hr-hover-action,
  // paired with the day cell's own `group` — see DayCell). Still the same
  // drag-to-place handle as before; only the at-rest visual weight changes.
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : undefined,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
        color: COLORS.mutedFaint,
      }}
      className="hr-hover-action group-hover/divider:opacity-100 text-xs hover:text-[#6B6B6B]"
      title="Click to add a divider, or drag it to where you want it"
    >
      — Add divider
    </button>
  );
}

/** A calendar event assigned to this student, under their own board — not
 * schoolwork, never checked off; it marks itself done on its own once
 * `now` passes its end time. Hover-✕ unassigns (back to the shared strip),
 * it never deletes anything (the feed itself is read-only). */
function AssignedCalendarEventRow({
  event,
  onUnassign,
  now,
}: {
  event: FamilyCalendarEvent;
  onUnassign: () => void;
  now: Date;
}) {
  const isPast = now > event.end;
  return (
    <div
      className="group relative flex items-start gap-2 py-0.5 pr-1 text-xs"
      style={{
        background: isPast ? undefined : "rgba(22,87,255,0.07)",
        boxShadow: isPast ? undefined : `inset 3px 0 0 ${COLORS.cobalt}`,
        paddingLeft: "0.5rem",
      }}
    >
      <span className="min-w-0 flex-1">
        <span
          className="block truncate"
          style={isPast ? { color: COLORS.muted, textDecorationLine: "line-through" } : { color: COLORS.text }}
          title={event.title}
        >
          {event.title}
        </span>
        <span className="block" style={{ color: isPast ? COLORS.mutedFaint : COLORS.cobalt, fontSize: "0.7rem" }}>
          🕐 {event.timeLabel ?? "All day"}
        </span>
      </span>
      <button
        type="button"
        onClick={(domEvent) => {
          domEvent.stopPropagation();
          onUnassign();
        }}
        aria-label={`Remove "${event.title}" from this board`}
        title="Remove from this board"
        className="shrink-0 px-1 text-xs opacity-100 transition-opacity lg:opacity-0 hover:text-[#1A1A1A] lg:group-hover:opacity-100"
        style={{ color: COLORS.muted }}
      >
        ✕
      </button>
    </div>
  );
}

/** The one shared "This Week — Family Calendar" agenda (README's "single
 * biggest structural fix" over the old per-student-duplicated feed) —
 * every event not yet assigned to a student, once, above every board.
 * Each row is a drag source (dropped on any student's board below assigns
 * it — ParentWeekBoard's own handleAssignDragEnd) and carries a small
 * per-student initial chip for the no-drag-required tap-to-assign path. */
function CalendarStrip({
  days,
  events,
  students,
  assignedStudentIdsByEvent,
  onAssign,
  onUnassign,
  mobileSelectedDateISO,
}: {
  days: Date[];
  events: FamilyCalendarEvent[];
  students: Student[];
  assignedStudentIdsByEvent: Map<string, Set<string>>;
  onAssign: (eventId: string, studentId: string) => void;
  onUnassign: (eventId: string, studentId: string) => void;
  // §5.6 "Shared family agenda... one selected day mobile" — which day's
  // events the mobile layout collapses to (desktop always shows all six).
  mobileSelectedDateISO: string;
}) {
  const eventsByDay = new Map<string, FamilyCalendarEvent[]>();
  for (const day of days) eventsByDay.set(toISODate(day), []);
  for (const event of events) eventsByDay.get(event.dateISO)?.push(event);

  return (
    <section className="mt-5 rounded-xl px-6 py-5" style={{ background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
      <div className="flex items-baseline justify-between border-b pb-3" style={{ borderColor: COLORS.hairline }}>
        <h2 style={{ color: COLORS.text, fontSize: 17, fontWeight: 700 }}>This Week — Family Calendar</h2>
        <span style={{ color: COLORS.muted, fontSize: 11.5 }}>from your Google Calendar</span>
      </div>
      {/* §5.6: one faint instructional sentence here, replacing the "drag to
          a kid, or" text that used to repeat on every single event row. */}
      <p className="mt-1.5 text-xs" style={{ color: COLORS.mutedFaint }}>
        Tap a student&rsquo;s initial to assign an event, or drag it onto their board.
      </p>
      {events.length === 0 ? (
        <p className="mt-3 text-xs" style={{ color: COLORS.mutedFaint }}>
          Nothing this week.
        </p>
      ) : (
        <>
          <div className="mt-3 hidden lg:grid lg:grid-cols-6">
            {days.map((day) => {
              const dateISO = toISODate(day);
              return (
                <div key={dateISO} style={{ padding: "0 10px", borderLeft: `1px solid ${COLORS.hairline}` }}>
                  <span className="block font-bold" style={{ color: COLORS.text, fontSize: 11 }}>
                    {formatDayWeekdayShort(day)}
                  </span>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {(eventsByDay.get(dateISO) ?? []).map((event) => (
                      <CalendarStripEventRow
                        key={event.id}
                        event={event}
                        students={students}
                        assignedStudentIds={assignedStudentIdsByEvent.get(event.id) ?? EMPTY_STUDENT_ID_SET}
                        onAssign={onAssign}
                        onUnassign={onUnassign}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 lg:hidden">
            {(eventsByDay.get(mobileSelectedDateISO) ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: COLORS.mutedFaint }}>
                Nothing this day.
              </p>
            ) : (
              (eventsByDay.get(mobileSelectedDateISO) ?? []).map((event) => (
                <CalendarStripEventRow
                  key={event.id}
                  event={event}
                  students={students}
                  assignedStudentIds={assignedStudentIdsByEvent.get(event.id) ?? EMPTY_STUDENT_ID_SET}
                  onAssign={onAssign}
                  onUnassign={onUnassign}
                />
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}

const EMPTY_STUDENT_ID_SET = new Set<string>();

function CalendarStripEventRow({
  event,
  students,
  assignedStudentIds,
  onAssign,
  onUnassign,
}: {
  event: FamilyCalendarEvent;
  students: Student[];
  // Stays visible in the strip even once assigned (a family event can apply
  // to more than one kid), so each per-student chip needs to show whether
  // it's already assigned rather than just "tap to assign."
  assignedStudentIds: Set<string>;
  onAssign: (eventId: string, studentId: string) => void;
  onUnassign: (eventId: string, studentId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: calendarEventDragId(event.id),
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="group flex flex-col gap-1 p-1.5 text-xs"
      style={{
        background: "rgba(22,87,255,0.07)",
        boxShadow: `inset 3px 0 0 ${COLORS.cobalt}`,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="min-w-0 flex-1 truncate" style={{ color: COLORS.text }} title={event.title}>
          {event.title}
        </span>
        {/* stopPropagation matches every other hover-X in this file — sits
            inside this row's own draggable node, so a click here shouldn't
            also register as the start of a drag. */}
        <button
          type="button"
          onClick={(domEvent) => {
            domEvent.stopPropagation();
            void dismissCalendarEventAction(event.id);
          }}
          aria-label={`Hide "${event.title}" from this overlay`}
          title="Hide this event"
          className="shrink-0 text-xs opacity-100 transition-opacity lg:opacity-0 hover:text-[#1A1A1A] lg:group-hover:opacity-100"
          style={{ color: COLORS.mutedFaint }}
        >
          ✕
        </button>
      </div>
      <span style={{ color: COLORS.cobalt, fontWeight: 700 }}>{event.timeLabel ?? "All day"}</span>
      <div className="flex items-center gap-1">
        {students.map((student) => {
          const isAssigned = assignedStudentIds.has(student.id);
          return (
            <button
              key={student.id}
              type="button"
              onClick={(domEvent) => {
                domEvent.stopPropagation();
                if (isAssigned) onUnassign(event.id, student.id);
                else onAssign(event.id, student.id);
              }}
              aria-pressed={isAssigned}
              title={isAssigned ? `Remove from ${student.name}'s board` : `Assign to ${student.name}`}
              aria-label={isAssigned ? `"${event.title}" is on ${student.name}'s board — tap to remove` : `Assign "${event.title}" to ${student.name}`}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
              style={
                isAssigned
                  ? { background: "transparent", border: `1.5px solid ${student.accentColor}`, color: student.accentColor }
                  : { background: student.accentColor, color: "white" }
              }
            >
              {student.name.charAt(0).toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Every student's board sits inside this droppable in the top-level assign
 * DndContext — dropping a CalendarStrip event anywhere on it assigns that
 * event to this student (see ParentWeekBoard's handleAssignDragEnd). */
function AssignDropZone({ studentId, children }: { studentId: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: assignDropId(studentId) });
  return (
    <div ref={setNodeRef} className="rounded transition-shadow" style={isOver ? { boxShadow: `0 0 0 2px ${COLORS.cobalt}` } : undefined}>
      {children}
    </div>
  );
}

function DraggableRow({
  instance,
  isLast,
  subjects,
  accentColor,
  onDelete,
}: {
  instance: EditableInstance;
  isLast: boolean;
  subjects: { id: string; name: string }[];
  accentColor: string;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });
  const [expanded, setExpanded] = useState(false);

  return (
    <RowFrame instance={instance} isLast={isLast} subjects={subjects} expanded={expanded} onCloseExpanded={() => setExpanded(false)} onDelete={onDelete}>
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
          cursor: "grab",
          touchAction: "none",
          fontSize: 12,
        }}
        className="flex items-start gap-2 pr-4 hover:bg-black/[0.03]"
      >
        <RowContents instance={instance} accentColor={accentColor} onToggleExpand={() => setExpanded((current) => !current)} />
      </div>
    </RowFrame>
  );
}

/** The mobile day pager's row: same look as DraggableRow, minus dnd-kit's
 * sortable wiring — that gesture surface would otherwise fight
 * SwipeDayPager's horizontal drag for the same touch (see StudentWeekView's
 * matching `enableDrag` for the identical reasoning on the student side).
 * Reordering and cross-day dragging stay desktop-only; a tap still opens
 * the edit panel either way. */
function StaticRow({
  instance,
  isLast,
  subjects,
  accentColor,
  onDelete,
}: {
  instance: EditableInstance;
  isLast: boolean;
  subjects: { id: string; name: string }[];
  accentColor: string;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <RowFrame instance={instance} isLast={isLast} subjects={subjects} expanded={expanded} onCloseExpanded={() => setExpanded(false)} onDelete={onDelete}>
      <div className="flex items-start gap-2 pr-4 hover:bg-black/[0.03]" style={{ fontSize: 12 }}>
        <RowContents instance={instance} accentColor={accentColor} onToggleExpand={() => setExpanded((current) => !current)} />
      </div>
    </RowFrame>
  );
}

function ReviewControls({ instanceId }: { instanceId: string }) {
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function handleApprove() {
    setPending(true);
    await approveReviewAction(instanceId);
  }

  async function handleReturn() {
    setPending(true);
    await returnReviewAction(instanceId, note);
  }

  if (returning) {
    return (
      <div className="flex items-center gap-1.5 pl-3">
        <input
          autoFocus
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional note (e.g. 'redo the last two')"
          className="hr-flat-input min-w-0 flex-1"
          disabled={pending}
        />
        <button
          type="button"
          onClick={handleReturn}
          disabled={pending}
          className="shrink-0 text-xs font-medium"
          style={{ color: COLORS.crimson }}
        >
          Send back
        </button>
        <button
          type="button"
          onClick={() => setReturning(false)}
          disabled={pending}
          className="shrink-0 text-xs"
          style={{ color: COLORS.muted }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 pl-3">
      <button type="button" onClick={handleApprove} disabled={pending} className="text-xs font-medium" style={{ color: COLORS.cobalt }}>
        ✓ Approve
      </button>
      <button
        type="button"
        onClick={() => setReturning(true)}
        disabled={pending}
        className="text-xs"
        style={{ color: COLORS.muted }}
      >
        Send back
      </button>
    </div>
  );
}
