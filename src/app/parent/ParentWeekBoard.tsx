"use client";

import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { addDays, defaultWeekStart, formatDayDateLine, formatDayWeekdayName, parseISODate, toISODate } from "@/lib/dates";
import { formatTotalMinutes } from "@/lib/estimatedMinutes";
import type { FamilyCalendarEvent } from "@/lib/familyCalendar";
import { getSubjectColor } from "@/lib/subjectColors";
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
import { addCalendarEventToTodoList } from "./calendar/actions";
import { EditAssignmentModal, type EditableInstance } from "./EditAssignmentModal";
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


export function ParentWeekBoard({
  students,
  subjects,
  monday,
  today,
  instances,
  daySeparators,
  calendarEvents,
  schoolDayTypesByStudent,
  requestedDayIndex,
}: {
  students: Student[];
  subjects: { id: string; name: string }[];
  monday: Date;
  today: Date;
  instances: EditableInstance[];
  daySeparators: DaySeparator[];
  // The family's imported Google Calendar (§ "on top of the view") — the
  // same list for every student, since it's not per-kid.
  calendarEvents: FamilyCalendarEvent[];
  schoolDayTypesByStudent: Record<string, Record<string, SchoolDayType>>;
  // Set only when a mobile swipe/arrow carried the parent across a week
  // edge (see page.tsx) — otherwise null, and the smart default applies.
  requestedDayIndex: number | null;
}) {
  const router = useRouter();
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const todayISO = toISODate(today);
  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const isCurrentWeek = toISODate(monday) === toISODate(defaultWeekStart(today));

  // Optimistic mirrors of the server props — without these, a drag (reorder
  // or reschedule) has nothing to show until the server action resolves and
  // Next.js revalidates, so dnd-kit's own transform resets to zero the
  // instant the drag ends and the row visibly snaps back to its old spot
  // before catching up a moment later. Same render-time resync pattern
  // StudentWeekView already uses for its own local state.
  const [localInstances, setLocalInstances] = useState(instances);
  const [syncedInstances, setSyncedInstances] = useState(instances);
  const [localDaySeparators, setLocalDaySeparators] = useState(daySeparators);
  const [syncedDaySeparators, setSyncedDaySeparators] = useState(daySeparators);
  if (instances !== syncedInstances) {
    setSyncedInstances(instances);
    setLocalInstances(instances);
  }
  if (daySeparators !== syncedDaySeparators) {
    setSyncedDaySeparators(daySeparators);
    setLocalDaySeparators(daySeparators);
  }

  const selectedInstance = localInstances.find((i) => i.id === selectedInstanceId) ?? null;

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
    await setDayType(studentId, dateISO, type);
  }

  /** The hover-X on each row (Parent Mode only) — a deliberate small target
   * the parent clicks on purpose, so unlike the edit sheet's delete this
   * skips any "are you sure": always deletes just this one occurrence. */
  async function handleDeleteInstance(instanceId: string) {
    await deleteAssignment(instanceId, "only");
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
    }
  }

  return (
    <>
      <div className="mt-8 flex items-center justify-between text-sm">
        <Link href={`/parent?week=${prevWeek}`} className="px-1 text-[#6B6B6B] hover:underline">
          ← Prev week
        </Link>
        {!isCurrentWeek && (
          <Link href="/parent" className="px-1 text-[#6B6B6B] hover:underline">
            📅 Today
          </Link>
        )}
        <Link href={`/parent?week=${nextWeek}`} className="px-1 text-[#6B6B6B] hover:underline">
          Next week →
        </Link>
      </div>

      {/* Below `lg`, six columns per student don't fit — everyone's board
          instead shows just the one day the pager is on, in step across
          students, so a parent scanning "today" for both kids swipes once. */}
      {students.length > 0 && (
        <div className="lg:hidden">
          <DayPagerControls
            activeIndex={mobileDayIndex}
            labels={DAY_SHORT_LABELS}
            accentColor={COLORS.text}
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

      {students.map((student) => (
        <StudentBoard
          key={student.id}
          student={student}
          days={days}
          todayISO={todayISO}
          instances={localInstances.filter((i) => i.studentId === student.id)}
          daySeparators={localDaySeparators.filter((s) => s.studentId === student.id)}
          calendarEvents={calendarEvents}
          schoolDayTypes={schoolDayTypesByStudent[student.id] ?? {}}
          onEdit={setSelectedInstanceId}
          onDelete={handleDeleteInstance}
          onDayTypeChange={(dateISO, type) => handleDayTypeChange(student.id, dateISO, type)}
          onReorderDay={(dateISO, orderedIds) => handleReorderDay(student.id, dateISO, orderedIds)}
          onReschedule={handleReschedule}
          mobileDayIndex={mobileDayIndex}
          onSwipeLeft={goToNextDay}
          onSwipeRight={goToPrevDay}
        />
      ))}

      <EditAssignmentModal
        instance={selectedInstance}
        subjects={subjects}
        onClose={() => setSelectedInstanceId(null)}
        prefersReducedMotion={false}
      />
    </>
  );
}

function StudentBoard({
  student,
  days,
  todayISO,
  instances,
  daySeparators,
  calendarEvents,
  schoolDayTypes,
  onEdit,
  onDelete,
  onDayTypeChange,
  onReorderDay,
  onReschedule,
  mobileDayIndex,
  onSwipeLeft,
  onSwipeRight,
}: {
  student: Student;
  days: Date[];
  todayISO: string;
  instances: EditableInstance[];
  daySeparators: DaySeparator[];
  calendarEvents: FamilyCalendarEvent[];
  schoolDayTypes: Record<string, SchoolDayType>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onDayTypeChange: (dateISO: string, type: SchoolDayType) => void;
  onReorderDay: (dateISO: string, orderedIds: string[]) => void | Promise<void>;
  onReschedule: (instanceId: string, newDateISO: string) => void | Promise<void>;
  mobileDayIndex: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  // A small activation distance lets a plain click still open the edit
  // modal — only a real drag (past this threshold) starts a reorder/reschedule.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const prefersReducedMotion = !!useReducedMotion();

  // Where the drag-to-place SeparatorHandle landed (or the "+ Separator"
  // button was clicked) — an inline text editor opens at this exact spot in
  // that day's card until it's submitted or cancelled (SeparatorCreateRow).
  const [creatingSeparator, setCreatingSeparator] = useState<{ dateISO: string; index: number } | null>(null);

  const eventsByDay = new Map<string, FamilyCalendarEvent[]>();
  for (const event of calendarEvents) {
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
   * One drag gesture, three possible outcomes. Dragging the bottom-of-card
   * SeparatorHandle (its id carries SEPARATOR_HANDLE_PREFIX — never a real
   * row) drops an inline creator at that spot instead of moving anything
   * (see creatingSeparator below); it never leaves the day it started in,
   * since a separator has nowhere else to go. Otherwise: dropped within the
   * same day reorders that day's cards (her own visual ordering, mixing
   * assignments and separators freely — §6) and dropped on a different day
   * reschedules it, same as before. A separator never leaves its own day —
   * there's no "reschedule" for one, so a cross-day drop of one is just
   * ignored. `over.id` is either a day's own dateISO (dropped on empty
   * space) or another row's id (dropped on/near a row) — both resolve back
   * to "which day."
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
    <section className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-wide">
        <Link href={`/student/${student.id}`} className="hover:underline" style={{ color: student.accentColor }}>
          {student.name}
        </Link>
      </h2>
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
        <div className="mt-3 hidden grid-cols-6 gap-4 lg:grid">
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
                onEdit={onEdit}
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

      {(() => {
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
                onEdit={onEdit}
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
  onEdit,
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
  // The family's imported Google Calendar, already filtered to this day
  // (§ Parent Mode "on top of the view") — read-only context, not part of
  // the day's own sortOrder sequence at all.
  events: FamilyCalendarEvent[];
  onEdit: (id: string) => void;
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
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editingType, setEditingType] = useState(false);
  const submittedRef = useRef(false);
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
    if (submittedRef.current) return;
    submittedRef.current = true;
    const trimmed = text.trim();
    setAdding(false);
    setText("");
    if (trimmed) void quickCreateAssignment(studentId, dateISO, trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submitQuickAdd();
    } else if (event.key === "Escape") {
      submittedRef.current = true; // discard without creating
      setAdding(false);
      setText("");
    }
  }

  return (
    <div className="flex flex-col">
      <div
        ref={setNodeRef}
        className="min-h-[100px] rounded border p-3 transition-colors"
        style={{
          borderColor: isOver ? COLORS.text : COLORS.hairline,
          background: isOver ? "#F1F2F4" : "white",
        }}
      >
        {/* §5 "field trips and off days" — click the date itself to change
            the day's type, matching the student view's two-line date/weekday
            treatment (§9). */}
        {editingType ? (
          <select
            autoFocus
            value={dayType}
            onChange={(event) => {
              setEditingType(false);
              onDayTypeChange(dateISO, event.target.value as SchoolDayType);
            }}
            onBlur={() => setEditingType(false)}
            className="w-full rounded border px-1.5 py-1 text-xs"
            style={{ borderColor: COLORS.hairline, color: COLORS.text }}
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
              className="block font-medium uppercase"
              style={{ color: COLORS.muted, fontSize: "0.55rem", letterSpacing: "0.05em" }}
            >
              {formatDayDateLine(day)}
            </span>
            <span
              className="block font-bold uppercase"
              style={{
                color: isToday ? accentColor : tag ? COLORS.amber : COLORS.text,
                fontSize: isToday ? "1.05rem" : "0.85rem",
                fontStretch: "condensed",
              }}
            >
              {formatDayWeekdayName(day)}
            </span>
            {tag && (
              <span className="block" style={{ color: COLORS.amber, fontSize: "0.65rem" }}>
                {tag}
              </span>
            )}
          </button>
        )}

        {events.length > 0 && (
          // §Parent Mode "on top of the view" — the family's own imported
          // calendar, read-only context sitting apart from the day's actual
          // sortOrder sequence (never draggable, never part of a reorder),
          // but styled with the same amber time-sensitive wash as a timed
          // assignment row (§12) since it's the same kind of information —
          // and each one can be pulled onto this student's list.
          <div className="mt-1.5 flex flex-col gap-1">
            {events.map((event) => (
              <CalendarEventRow key={event.id} event={event} studentId={studentId} />
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
                      onClick={() => onEdit(row.instance.id)}
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
                  onClick={() => onEdit(row.instance.id)}
                  onDelete={() => onDelete(row.instance.id)}
                />
              )
            )}
            {creatingSeparatorIndex != null && (
              <SeparatorCreateRow onSubmit={onSubmitSeparator} onCancel={onCancelSeparator} />
            )}
          </div>
        )}

        {adding ? (
          <input
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            onBlur={submitQuickAdd}
            onKeyDown={handleKeyDown}
            placeholder="Assignment title"
            className="mt-2 w-full rounded border border-[#E1E3E6] px-2 py-1 text-sm outline-none"
          />
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => {
                submittedRef.current = false;
                setAdding(true);
              }}
              className="text-xs text-[#A9ACB2] hover:text-[#6B6B6B]"
            >
              + Add
            </button>
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
                + Separator
              </button>
            )}
          </div>
        )}
      </div>
      {assignmentMinutes > 0 && (
        <p className="mt-1 text-center text-xs" style={{ color: COLORS.mutedFaint }}>
          {formatTotalMinutes(assignmentMinutes)} total
        </p>
      )}
      {projectMinutes > 0 && (
        <p className="text-center text-xs" style={{ color: COLORS.mutedFaint }}>
          {formatTotalMinutes(projectMinutes)} project time
        </p>
      )}
    </div>
  );
}

/** The visual content shared by both row variants below — everything
 * except the outer element that carries (or doesn't carry) dnd-kit's
 * sortable wiring. */
function RowContents({ instance }: { instance: EditableInstance }) {
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

  return (
    <>
      <span
        aria-hidden
        className="mt-1 inline-block self-stretch"
        style={{ width: 2, background: getSubjectColor(instance.subject?.name), flexShrink: 0 }}
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
            <span className="mt-0.5 shrink-0" style={{ color: COLORS.amber, fontSize: "0.7rem" }} title={`Rolled ${instance.rolledCount} day(s)`}>
              {rollMark}
            </span>
          )}
        </span>
        {metaText && (
          <span className="block" style={{ color: COLORS.mutedFaint, fontSize: "0.7rem" }}>
            {metaText}
          </span>
        )}
        {/* §12: parent's own quiet confirmation that a time/reminder is set. */}
        {instance.isTimeSensitive && instance.scheduledTime && (
          <span className="block" style={{ color: COLORS.amber, fontSize: "0.7rem" }}>
            🕐 {formatScheduledTime(instance.scheduledTime)}
          </span>
        )}
        {isPendingReview && (
          <span className="block" style={{ color: COLORS.amber, fontSize: "0.7rem" }}>
            ✋ Show Mom
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
  onDelete,
  children,
}: {
  instance: EditableInstance;
  isLast: boolean;
  onDelete: () => void;
  children: ReactNode;
}) {
  const isPendingReview = instance.status === InstanceStatus.pendingReview;
  const isTimeSensitive = instance.isTimeSensitive && !!instance.scheduledTime;

  return (
    <div
      className="group relative flex flex-col gap-1 rounded-sm px-1 py-0.5"
      style={{
        borderBottom: isLast ? undefined : `1px solid ${COLORS.hairline}`,
        // §12: mirrors the student view's whole-row highlight (not just the
        // amber time text below) — bleeds to the day cell's own edges the
        // same way, still within §9's two-color budget.
        ...(isTimeSensitive
          ? {
              background: "rgba(181, 69, 27, 0.07)",
              boxShadow: `inset 3px 0 0 ${COLORS.amber}`,
              marginLeft: "-0.75rem",
              marginRight: "-0.75rem",
              paddingLeft: "0.85rem",
              paddingRight: "0.75rem",
            }
          : undefined),
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
        className="absolute right-0.5 top-0.5 rounded px-1 text-xs text-[#A9ACB2] opacity-0 transition-opacity hover:text-[#161616] group-hover:opacity-100"
      >
        ✕
      </button>
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
        className="absolute right-0.5 top-1 rounded px-1 text-xs text-[#A9ACB2] opacity-0 transition-opacity hover:text-[#161616] group-hover:opacity-100"
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
          className="min-w-0 flex-1 rounded border border-[#E1E3E6] px-1.5 py-0.5 text-center text-xs outline-none"
        />
        <span className="h-px flex-1" style={{ background: COLORS.hairline }} />
      </div>
      <div className="flex items-center justify-center gap-1.5">
        {SEPARATOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            // Keeps the input focused through the click so the onBlur above
            // never fires (and cancels) before this button's own onClick does.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => submit(preset)}
            className="rounded-full border px-2 py-0.5 text-[10px]"
            style={{ borderColor: COLORS.hairline, color: COLORS.muted }}
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

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: isDragging ? "grabbing" : "grab",
        touchAction: "none",
        borderColor: COLORS.hairline,
        color: COLORS.mutedFaint,
      }}
      className="rounded border border-dashed px-2 py-0.5 text-xs hover:text-[#6B6B6B]"
      title="Click to add a separator, or drag it to where you want it"
    >
      ⠿ Separator
    </div>
  );
}

/** A family calendar event overlaid on the day (§ Parent Mode "on top of
 * the view") — styled with the same amber time-sensitive wash a timed
 * assignment row gets (§12), since to a parent scanning the day they're the
 * same kind of thing: something at a fixed time. The "+" pulls it onto this
 * student's list as a real (editable, completable) task — a timed one if
 * the event carries a time, an untimed one for an all-day event — with no
 * subject yet; the parent adds one later via the normal edit sheet. */
function CalendarEventRow({ event, studentId }: { event: FamilyCalendarEvent; studentId: string }) {
  const [adding, setAdding] = useState(false);

  async function handleAdd() {
    setAdding(true);
    try {
      await addCalendarEventToTodoList(studentId, event.title, event.dateISO, event.start.toISOString(), event.allDay);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      className="group relative flex items-start gap-2 rounded-sm py-0.5 pr-5 text-xs"
      style={{
        background: "rgba(181, 69, 27, 0.07)",
        boxShadow: `inset 3px 0 0 ${COLORS.amber}`,
        paddingLeft: "0.5rem",
      }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate" style={{ color: COLORS.text }} title={event.title}>
          {event.title}
        </span>
        <span className="block" style={{ color: COLORS.amber, fontSize: "0.7rem" }}>
          🕐 {event.timeLabel ?? "All day"}
        </span>
      </span>
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        aria-label={`Add "${event.title}" to this student's list`}
        title="Add to this student's list"
        className="shrink-0 rounded px-1 text-xs opacity-0 transition-opacity hover:text-[#161616] group-hover:opacity-100 disabled:opacity-100"
        style={{ color: COLORS.muted }}
      >
        {adding ? "…" : "+"}
      </button>
    </div>
  );
}

function DraggableRow({
  instance,
  isLast,
  onClick,
  onDelete,
}: {
  instance: EditableInstance;
  isLast: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });

  return (
    <RowFrame instance={instance} isLast={isLast} onDelete={onDelete}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onClick={onClick}
        style={{
          transform: CSS.Transform.toString(transform),
          transition: transition ?? undefined,
          opacity: isDragging ? 0.5 : 1,
          zIndex: isDragging ? 10 : undefined,
          position: "relative",
          cursor: "pointer",
          touchAction: "none",
        }}
        className="flex items-start gap-2 pr-4 text-sm hover:bg-black/[0.03]"
      >
        <RowContents instance={instance} />
      </div>
    </RowFrame>
  );
}

/** The mobile day pager's row: same look as DraggableRow, minus dnd-kit's
 * sortable wiring — that gesture surface would otherwise fight
 * SwipeDayPager's horizontal drag for the same touch (see StudentWeekView's
 * matching `enableDrag` for the identical reasoning on the student side).
 * Reordering and cross-day dragging stay desktop-only; a tap still opens
 * the edit sheet either way. */
function StaticRow({
  instance,
  isLast,
  onClick,
  onDelete,
}: {
  instance: EditableInstance;
  isLast: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <RowFrame instance={instance} isLast={isLast} onDelete={onDelete}>
      <div onClick={onClick} className="flex cursor-pointer items-start gap-2 pr-4 text-sm hover:bg-black/[0.03]">
        <RowContents instance={instance} />
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
          className="min-w-0 flex-1 rounded border border-[#E1E3E6] px-2 py-1 text-xs outline-none"
          disabled={pending}
        />
        <button
          type="button"
          onClick={handleReturn}
          disabled={pending}
          className="shrink-0 text-xs font-medium"
          style={{ color: COLORS.amber }}
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
      <button type="button" onClick={handleApprove} disabled={pending} className="text-xs font-medium text-[#161616]">
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
