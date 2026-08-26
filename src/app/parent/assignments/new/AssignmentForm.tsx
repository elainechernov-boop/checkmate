"use client";

import { useState } from "react";
import { WEEKDAYS } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { createAssignment } from "./actions";

type Student = { id: string; name: string; accentColor: string };
type Subject = { id: string; name: string };

const REPEAT_OPTIONS = [
  { value: "none", label: "Does not repeat" },
  { value: "weekdays", label: "Every school day" },
  { value: "weekly", label: "Weekly on…" },
  { value: "biweekly", label: "Every 2 weeks on…" },
  { value: "monthly", label: "Monthly" },
];

const END_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "onDate", label: "On date" },
  { value: "afterNCount", label: "After N times" },
];

// §12: 10 / 30 / 60 minutes ahead of the assignment's own scheduledTime.
const REMINDER_OPTIONS = [
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
];

const fieldLabel = "block text-xs font-medium uppercase tracking-wide";
const fieldInput = "mt-1 w-full border-b bg-transparent py-1.5 outline-none";

export function AssignmentForm({ students, subjects }: { students: Student[]; subjects: Subject[] }) {
  const [repeat, setRepeat] = useState("none");
  const [endCondition, setEndCondition] = useState("never");
  const [studentIds, setStudentIds] = useState<string[]>(students[0] ? [students[0].id] : []);
  const [timeSensitive, setTimeSensitive] = useState(false);
  const showDaysOfWeek = repeat === "weekly" || repeat === "biweekly";

  function toggleStudent(id: string) {
    setStudentIds((current) =>
      current.includes(id) ? current.filter((studentId) => studentId !== id) : [...current, id]
    );
  }

  return (
    <form action={createAssignment} className="mt-8 max-w-lg space-y-6 text-sm" style={{ color: COLORS.text }}>
      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Title
        </label>
        <input type="text" name="title" required className={fieldInput} style={{ borderColor: COLORS.hairline }} />
      </div>

      <div>
        <span className={fieldLabel} style={{ color: COLORS.muted }}>
          Student{studentIds.length > 1 ? "s" : ""}
        </span>
        <p className="mt-1 text-xs" style={{ color: COLORS.mutedFaint }}>
          Select more than one to give each student their own copy of this assignment.
        </p>
        <div className="mt-2 flex gap-2">
          {students.map((student) => {
            const selected = studentIds.includes(student.id);
            return (
              <label
                key={student.id}
                className="flex-1 cursor-pointer border px-3 py-2 text-center transition-colors"
                style={{
                  borderColor: selected ? COLORS.text : COLORS.hairline,
                  background: selected ? COLORS.text : "transparent",
                  color: selected ? "white" : COLORS.text,
                  borderTopColor: student.accentColor,
                  borderTopWidth: 3,
                }}
              >
                <input
                  type="checkbox"
                  name="studentId"
                  value={student.id}
                  checked={selected}
                  onChange={() => toggleStudent(student.id)}
                  className="sr-only"
                />
                {student.name}
              </label>
            );
          })}
        </div>
        {studentIds.length === 0 && (
          <p className="mt-1 text-xs" style={{ color: COLORS.crimson }}>
            Select at least one student.
          </p>
        )}
      </div>

      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Subject
        </label>
        <select name="subjectId" required className={fieldInput} style={{ borderColor: COLORS.hairline }}>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Details (optional)
        </label>
        <textarea name="details" rows={2} className={fieldInput} style={{ borderColor: COLORS.hairline }} />
      </div>

      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Est. minutes (optional)
        </label>
        <input type="number" name="estimatedMinutes" min={0} className={`${fieldInput} w-32`} style={{ borderColor: COLORS.hairline }} />
      </div>

      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Due date
        </label>
        <input type="date" name="dueDate" required className={`${fieldInput} w-auto`} style={{ borderColor: COLORS.hairline }} />
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={timeSensitive} onChange={(event) => setTimeSensitive(event.target.checked)} />
          This happens at a set time (e.g. an online class) — highlight it and remind me
        </label>

        {timeSensitive && (
          <div className="mt-2 flex items-end gap-3">
            <div>
              <label className={fieldLabel} style={{ color: COLORS.muted }}>
                Time
              </label>
              <input type="time" name="scheduledTime" required className={`${fieldInput} w-auto`} style={{ borderColor: COLORS.hairline }} />
            </div>
            <div>
              <label className={fieldLabel} style={{ color: COLORS.muted }}>
                Remind
              </label>
              <select name="reminderMinutesBefore" defaultValue="10" className={`${fieldInput} w-auto`} style={{ borderColor: COLORS.hairline }}>
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Repeat
        </label>
        <select
          name="repeat"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          className={fieldInput}
          style={{ borderColor: COLORS.hairline }}
        >
          {REPEAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {showDaysOfWeek && (
        <div>
          <span className={fieldLabel} style={{ color: COLORS.muted }}>
            On these days
          </span>
          <div className="mt-1 flex gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day.code} className="flex items-center gap-1.5 capitalize">
                <input type="checkbox" name="daysOfWeek" value={day.code} />
                {day.code}
              </label>
            ))}
          </div>
        </div>
      )}

      {repeat !== "none" && (
        <div>
          <label className={fieldLabel} style={{ color: COLORS.muted }}>
            Ends
          </label>
          <select
            name="endCondition"
            value={endCondition}
            onChange={(event) => setEndCondition(event.target.value)}
            className={fieldInput}
            style={{ borderColor: COLORS.hairline }}
          >
            {END_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {endCondition === "onDate" && (
            <input type="date" name="endDate" required className={`${fieldInput} w-auto`} style={{ borderColor: COLORS.hairline }} />
          )}
          {endCondition === "afterNCount" && (
            <input
              type="number"
              name="endCount"
              min={1}
              required
              placeholder="Number of times"
              className={fieldInput}
              style={{ borderColor: COLORS.hairline }}
            />
          )}
        </div>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" name="requiresReview" />
        &ldquo;Show me the work&rdquo; — require sign-off before this counts as done
      </label>

      <button
        type="submit"
        disabled={studentIds.length === 0}
        className="px-4 py-2.5 text-white disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: COLORS.text }}
      >
        Create assignment
      </button>
    </form>
  );
}
