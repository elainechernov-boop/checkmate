"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Student } from "@/generated/prisma/client";
import { addDays, formatDayLabel, formatWeekLabel, toISODate } from "@/lib/dates";
import { getSubjectColor } from "@/lib/subjectColors";
import { COLORS } from "@/lib/theme";
import { quickCreateAssignment, rescheduleInstance } from "./planner-actions";
import { EditAssignmentModal, type EditableInstance } from "./EditAssignmentModal";

export function ParentWeekBoard({
  students,
  subjects,
  monday,
  instances,
}: {
  students: Student[];
  subjects: { id: string; name: string }[];
  monday: Date;
  instances: EditableInstance[];
}) {
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  const prevWeek = toISODate(addDays(monday, -7));
  const nextWeek = toISODate(addDays(monday, 7));
  const selectedInstance = instances.find((i) => i.id === selectedInstanceId) ?? null;

  return (
    <>
      <div className="mt-8 flex items-center gap-6 text-sm">
        <Link href={`/parent?week=${prevWeek}`} className="px-1 text-[#6B6B6B] hover:underline">
          ← Prev week
        </Link>
        <span className="font-medium">Week of {formatWeekLabel(days[0])}</span>
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
          instances={instances.filter((i) => i.studentId === student.id)}
          onEdit={setSelectedInstanceId}
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
  instances,
  onEdit,
}: {
  student: Student;
  days: Date[];
  instances: EditableInstance[];
  onEdit: (id: string) => void;
}) {
  // A small activation distance lets a plain click still open the edit
  // modal — only a real drag (past this threshold) starts a reschedule.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const instance = instances.find((i) => i.id === active.id);
    if (!instance || !instance.dueDate) return;
    const newDateISO = String(over.id);
    if (toISODate(instance.dueDate) === newDateISO) return;
    await rescheduleInstance(instance.id, newDateISO);
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: student.accentColor }}>
        {student.name}
      </h2>
      {/* Explicit `id` makes dnd-kit's internal aria-describedby id
          deterministic — without it, dnd-kit derives it from a module-level
          counter that isn't SSR-safe (it keeps incrementing across
          requests on the server but resets to 0 on the client), causing a
          harmless but real hydration-attribute mismatch. */}
      <DndContext id={`student-${student.id}`} sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="mt-3 grid grid-cols-6 gap-4">
          {days.map((day) => {
            const dateISO = toISODate(day);
            const dayInstances = instances.filter((i) => i.dueDate && toISODate(i.dueDate) === dateISO);
            return (
              <DayCell
                key={dateISO}
                studentId={student.id}
                day={day}
                dateISO={dateISO}
                instances={dayInstances}
                onEdit={onEdit}
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
  instances,
  onEdit,
}: {
  studentId: string;
  day: Date;
  dateISO: string;
  instances: EditableInstance[];
  onEdit: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dateISO });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const submittedRef = useRef(false);

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
        background: isOver ? "#F3EFE7" : "white",
      }}
    >
      <div className="text-xs font-medium text-[#6B6B6B]">{formatDayLabel(day)}</div>
      <div className="mt-2 flex flex-col gap-1">
        {instances.map((instance) => (
          <DraggableRow key={instance.id} instance={instance} onClick={() => onEdit(instance.id)} />
        ))}
      </div>

      {adding ? (
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={submitQuickAdd}
          onKeyDown={handleKeyDown}
          placeholder="Assignment title"
          className="mt-2 w-full rounded border border-[#DDD6CB] px-2 py-1 text-sm outline-none"
        />
      ) : (
        <button
          onClick={() => {
            submittedRef.current = false;
            setAdding(true);
          }}
          className="mt-2 text-xs text-[#B8AF9F] hover:text-[#6B6B6B]"
        >
          + Add
        </button>
      )}
    </div>
  );
}

function DraggableRow({ instance, onClick }: { instance: EditableInstance; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: instance.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
        cursor: "pointer",
      }}
      className="flex items-baseline gap-2 rounded px-1 py-0.5 text-sm hover:bg-black/[0.03]"
    >
      <span
        aria-hidden
        className="mt-0.5 inline-block self-stretch"
        style={{ width: 2, background: getSubjectColor(instance.subject?.name), flexShrink: 0 }}
      />
      <span>{instance.title}</span>
      {instance.requiresReview && <span style={{ color: COLORS.amber, fontSize: "0.7rem" }}>Show Mom</span>}
    </div>
  );
}
