"use client";

import { useState } from "react";
import type { Student } from "@/generated/prisma/client";
import { COLORS } from "@/lib/theme";
import { TextAction } from "@/components/FlatField";
import {
  createStudentAction,
  cycleStudentAccentAction,
  deleteStudentAction,
  updateStudentGradeAction,
  updateStudentNameAction,
} from "./actions";

/**
 * HOMEROOM_UX_MIGRATION.md §5.7 — a plain hairline list (no cards, no
 * native color well, no black Save button): click name or grade to edit
 * inline, a fixed accent-cycle button matching Student Mode's own, and a
 * permanent add row at the bottom.
 */
export function StudentsBoard({ students }: { students: Student[] }) {
  return (
    <div className="mt-6 max-w-[640px]">
      {students.map((student) => (
        <StudentRow key={student.id} student={student} />
      ))}
      <NewStudentRow />
    </div>
  );
}

function StudentRow({ student }: { student: Student }) {
  const [accentColor, setAccentColor] = useState(student.accentColor);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(student.name);
  const [editingGrade, setEditingGrade] = useState(false);
  const [grade, setGrade] = useState(student.gradeLevel);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleCycleColor() {
    const previous = accentColor;
    try {
      const result = await cycleStudentAccentAction(student.id);
      setAccentColor(result.accentColor);
    } catch {
      setAccentColor(previous);
    }
  }

  function commitName() {
    setEditingName(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== student.name) void updateStudentNameAction(student.id, trimmed);
    else setName(student.name);
  }

  function commitGrade() {
    setEditingGrade(false);
    const trimmed = grade.trim();
    if (trimmed && trimmed !== student.gradeLevel) void updateStudentGradeAction(student.id, trimmed);
    else setGrade(student.gradeLevel);
  }

  return (
    <div className="group flex items-center gap-4 border-b py-3 text-sm" style={{ borderColor: COLORS.hairline }}>
      <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: accentColor }} />

      {editingName ? (
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
            } else if (event.key === "Escape") {
              setName(student.name);
              setEditingName(false);
            }
          }}
          className="hr-flat-input w-32 uppercase"
          style={{ fontFamily: "var(--font-syncopate)", fontWeight: 700, letterSpacing: "0.03em", color: accentColor }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          className="w-32 truncate text-left uppercase"
          style={{ fontFamily: "var(--font-syncopate)", fontWeight: 700, letterSpacing: "0.03em", color: accentColor }}
        >
          {student.name}
        </button>
      )}

      {editingGrade ? (
        <input
          autoFocus
          value={grade}
          onChange={(event) => setGrade(event.target.value)}
          onBlur={commitGrade}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitGrade();
            } else if (event.key === "Escape") {
              setGrade(student.gradeLevel);
              setEditingGrade(false);
            }
          }}
          className="hr-flat-input w-24"
        />
      ) : (
        <button type="button" onClick={() => setEditingGrade(true)} className="w-24 truncate text-left" style={{ color: COLORS.muted }}>
          {student.gradeLevel}
        </button>
      )}

      <TextAction onClick={handleCycleColor} className="text-xs" style={{ color: COLORS.muted }}>
        Change color
      </TextAction>

      {confirmingDelete ? (
        <span className="ml-auto flex items-center gap-2 text-xs">
          <span style={{ color: COLORS.muted }}>Delete student?</span>
          <TextAction onClick={() => deleteStudentAction(student.id)} style={{ color: COLORS.crimson, fontWeight: 600 }}>
            Delete
          </TextAction>
          <TextAction onClick={() => setConfirmingDelete(false)} style={{ color: COLORS.muted }}>
            Cancel
          </TextAction>
        </span>
      ) : (
        <TextAction
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete ${student.name}`}
          className="hr-hover-action ml-auto text-xs"
          style={{ color: COLORS.mutedFaint }}
        >
          Delete
        </TextAction>
      )}
    </div>
  );
}

/** Permanent add row (§5.7) — Name then Grade, Enter on the final field
 * creates. Two plain fields rather than InlineEntry's single-input
 * convention, since a student needs both before it means anything. */
function NewStudentRow() {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!name.trim() || !grade.trim()) return;
    setPending(true);
    try {
      await createStudentAction(name, grade);
      setName("");
      setGrade("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-4 border-b border-dashed py-3 text-sm" style={{ borderColor: COLORS.dashed }}>
      <span aria-hidden className="h-3 w-3 shrink-0" />
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Name"
        disabled={pending}
        className="hr-flat-input w-32"
      />
      <input
        value={grade}
        onChange={(event) => setGrade(event.target.value)}
        placeholder="Grade level"
        disabled={pending}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        className="hr-flat-input w-24"
      />
      <TextAction onClick={submit} disabled={pending} style={{ color: COLORS.text, fontWeight: 600 }}>
        Add student
      </TextAction>
    </div>
  );
}
