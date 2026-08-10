"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Student } from "@/generated/prisma/client";
import { InstanceStatus, SchoolDayType } from "@/generated/prisma/enums";
import { addDays, formatDayDateLine, formatDayWeekdayName, toISODate } from "@/lib/dates";
import { getSubjectColor } from "@/lib/subjectColors";
import { formatScheduledTime } from "@/lib/reminders";
import { COLORS } from "@/lib/theme";
import {
  approveReviewAction,
  quickCreateAssignment,
  reorderDayInstances,
  rescheduleInstance,
  returnReviewAction,
  setDayType,
} from "./planner-actions";
import { EditAssignmentModal, type EditableInstance } from "./EditAssignmentModal";
import { RescheduleHelperModal, type ReschedulableItem } from "./RescheduleHelperModal";

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

export function ParentWeekBoard({
  students,
  subjects,
  monday,
  today,
  instances,
  schoolDayTypesByStudent,
}: {
  students: Student[];
  subjects: { id: string; name: string }[];
  monday: Date;
  today: Date;
  instances: EditableInstance[];
  schoolDayTypesByStudent: Record<string, Record<string, SchoolDayType>>;
}) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [helper, setHelper] = useState<{ studentId: string; dateISO: string } | null>(null);
  const [reschedulable, setReschedulable] = useState<ReschedulableItem[]>([]);
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const todayISO = toISODate(today);
  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const selectedInstance = instances.find((i) => i.id === selectedInstanceId) ?? null;

  /** §5 "field trips and off days" — reached from each card's own day
   * header now (not a separate strip), and scoped to just that one
   * student (§5's per-kid sick days/field trips — the family-wide academic
   * calendar lives on /parent/calendar instead). Re-materializing that
   * student's series may leave standalone instances behind, which is when
   * the Reschedule Helper opens. */
  async function handleDayTypeChange(studentId: string, dateISO: string, type: SchoolDayType) {
    const result = await setDayType(studentId, dateISO, type);
    if (result.reschedulable.length > 0) {
      setReschedulable(result.reschedulable);
      setHelper({ studentId, dateISO });
    }
  }

  return (
    <>
      <div className="mt-8 flex items-center justify-between text-sm">
        <Link href={`/parent?week=${prevWeek}`} className="px-1 text-[#6B6B6B] hover:underline">
          ← Prev week
        </Link>
        <Link href={`/parent?week=${nextWeek}`} className="px-1 text-[#6B6B6B] hover:underline">
          Next week →
        </Link>
      </div>

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
          instances={instances.filter((i) => i.studentId === student.id)}
          schoolDayTypes={schoolDayTypesByStudent[student.id] ?? {}}
          onEdit={setSelectedInstanceId}
          onDayTypeChange={(dateISO, type) => handleDayTypeChange(student.id, dateISO, type)}
        />
      ))}

      <EditAssignmentModal
        instance={selectedInstance}
        subjects={subjects}
        onClose={() => setSelectedInstanceId(null)}
        prefersReducedMotion={false}
      />

      <RescheduleHelperModal
        open={!!helper}
        studentId={helper?.studentId ?? null}
        dateISO={helper?.dateISO ?? null}
        items={reschedulable}
        onClose={() => setHelper(null)}
      />
    </>
  );
}

function StudentBoard({
  student,
  days,
  todayISO,
  instances,
  schoolDayTypes,
  onEdit,
  onDayTypeChange,
}: {
  student: Student;
  days: Date[];
  todayISO: string;
  instances: EditableInstance[];
  schoolDayTypes: Record<string, SchoolDayType>;
  onEdit: (id: string) => void;
  onDayTypeChange: (dateISO: string, type: SchoolDayType) => void;
}) {
  // A small activation distance lets a plain click still open the edit
  // modal — only a real drag (past this threshold) starts a reorder/reschedule.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byDay = new Map<string, EditableInstance[]>();
  for (const day of days) byDay.set(toISODate(day), []);
  for (const instance of instances) {
    if (!instance.dueDate) continue;
    const key = toISODate(instance.dueDate);
    byDay.get(key)?.push(instance);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  function dayOf(instanceId: string): string | null {
    const instance = instances.find((i) => i.id === instanceId);
    return instance?.dueDate ? toISODate(instance.dueDate) : null;
  }

  /**
   * One drag gesture, two possible outcomes: dropped within the same day
   * reorders that day's cards (her own visual ordering — useful ahead of
   * future dividers like "lunch"); dropped on a different day reschedules
   * it, same as before. `over.id` is either a day's own dateISO (dropped on
   * empty space) or another card's id (dropped on/near a row) — both
   * resolve back to "which day."
   */
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const sourceDateISO = dayOf(activeId);
    if (!sourceDateISO) return;

    const targetDateISO = byDay.has(overId) ? overId : dayOf(overId);
    if (!targetDateISO) return;

    if (targetDateISO === sourceDateISO) {
      if (activeId === overId) return;
      const dayList = byDay.get(sourceDateISO) ?? [];
      const oldIndex = dayList.findIndex((i) => i.id === activeId);
      const newIndex = dayList.findIndex((i) => i.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(dayList, oldIndex, newIndex).map((i) => i.id);
      await reorderDayInstances(student.id, sourceDateISO, reordered);
    } else {
      await rescheduleInstance(activeId, targetDateISO);
    }
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
        <div className="mt-3 grid grid-cols-6 gap-4">
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
                instances={byDay.get(dateISO) ?? []}
                onEdit={onEdit}
                onDayTypeChange={onDayTypeChange}
              />
            );
          })}
        </div>
      </DndContext>
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
  instances,
  onEdit,
  onDayTypeChange,
}: {
  studentId: string;
  day: Date;
  dateISO: string;
  isToday: boolean;
  accentColor: string;
  dayType: SchoolDayType;
  instances: EditableInstance[];
  onEdit: (id: string) => void;
  onDayTypeChange: (dateISO: string, type: SchoolDayType) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateISO });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [editingType, setEditingType] = useState(false);
  const submittedRef = useRef(false);
  const tag = TYPE_TAG[dayType];

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

      <SortableContext items={instances.map((instance) => instance.id)} strategy={verticalListSortingStrategy}>
        <div className="mt-2 flex flex-col">
          {instances.map((instance, index) => (
            <DraggableRow
              key={instance.id}
              instance={instance}
              isLast={index === instances.length - 1}
              onClick={() => onEdit(instance.id)}
            />
          ))}
        </div>
      </SortableContext>

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
        <button
          onClick={() => {
            submittedRef.current = false;
            setAdding(true);
          }}
          className="mt-2 text-xs text-[#A9ACB2] hover:text-[#6B6B6B]"
        >
          + Add
        </button>
      )}
    </div>
  );
}

function DraggableRow({
  instance,
  isLast,
  onClick,
}: {
  instance: EditableInstance;
  isLast: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.id,
  });
  const isPendingReview = instance.status === InstanceStatus.pendingReview;

  // Subject + estimated time underneath the title, matching the student
  // view's meta line (§9) so a parent gets the same at-a-glance context.
  const estMinutes = instance.series?.estimatedMinutes ?? null;
  const metaText = [instance.subject?.name, estMinutes != null ? `${estMinutes} min` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex flex-col gap-1 px-1 py-0.5"
      style={{ borderBottom: isLast ? undefined : `1px solid ${COLORS.hairline}` }}
    >
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
        className="flex items-start gap-2 text-sm hover:bg-black/[0.03]"
      >
        <span
          aria-hidden
          className="mt-1 inline-block self-stretch"
          style={{ width: 2, background: getSubjectColor(instance.subject?.name), flexShrink: 0 }}
        />
        <span className="min-w-0 flex-1">
          <span className="block break-words">{instance.title}</span>
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
      </div>

      {instance.returnNote && (
        <p className="pl-3 text-xs" style={{ color: COLORS.muted }}>
          {instance.returnNote}
        </p>
      )}

      {/* §5 step 2/4 — approve/return from Parent Mode. Kept outside the
          draggable node above (no drag listeners here) so these buttons
          never race dnd-kit's pointer handling. */}
      {isPendingReview && <ReviewControls instanceId={instance.id} />}
    </div>
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
