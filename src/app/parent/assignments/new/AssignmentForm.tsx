"use client";

import { useState } from "react";
import { WEEKDAYS } from "@/lib/dates";
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
    <form action={createAssignment} className="mt-8 max-w-lg space-y-6">
      <div>
        <label className="block text-sm font-medium">Title</label>
        <input
          type="text"
          name="title"
          required
          className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
        />
      </div>

      <div>
        <span className="block text-sm font-medium">Student{studentIds.length > 1 ? "s" : ""}</span>
        <p className="mt-1 text-xs text-[#6B6B6B]">
          Select more than one to give each student their own copy of this assignment.
        </p>
        <div className="mt-2 flex gap-2">
          {students.map((student) => {
            const selected = studentIds.includes(student.id);
            return (
              <label
                key={student.id}
                className={`flex-1 cursor-pointer rounded border px-3 py-2 text-center text-sm transition-colors ${
                  selected
                    ? "border-[#161616] bg-[#161616] text-white"
                    : "border-[#E1E3E6] text-[#161616] hover:border-[#A9ACB2]"
                }`}
                style={{ borderTopColor: student.accentColor, borderTopWidth: 3 }}
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
          <p className="mt-1 text-xs text-[#B5451B]">Select at least one student.</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium">Subject</label>
        <select name="subjectId" required className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2">
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Details (optional)</label>
        <textarea name="details" rows={2} className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2" />
      </div>

      <div>
        <label className="block text-sm font-medium">Est. minutes (optional)</label>
        <input
          type="number"
          name="estimatedMinutes"
          min={0}
          className="mt-1 w-32 rounded border border-[#E1E3E6] px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Due date</label>
        <input
          type="date"
          name="dueDate"
          required
          className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={timeSensitive}
            onChange={(event) => setTimeSensitive(event.target.checked)}
          />
          This happens at a set time (e.g. an online class) — highlight it and remind me
        </label>

        {timeSensitive && (
          <div className="mt-2 flex items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-[#6B6B6B]">Time</label>
              <input
                type="time"
                name="scheduledTime"
                required
                className="mt-1 rounded border border-[#E1E3E6] px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#6B6B6B]">Remind</label>
              <select
                name="reminderMinutesBefore"
                defaultValue="10"
                className="mt-1 rounded border border-[#E1E3E6] px-3 py-2"
              >
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
        <label className="block text-sm font-medium">Repeat</label>
        <select
          name="repeat"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
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
          <span className="block text-sm font-medium">On these days</span>
          <div className="mt-1 flex gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day.code} className="flex items-center gap-1.5 text-sm capitalize">
                <input type="checkbox" name="daysOfWeek" value={day.code} />
                {day.code}
              </label>
            ))}
          </div>
        </div>
      )}

      {repeat !== "none" && (
        <div>
          <label className="block text-sm font-medium">Ends</label>
          <select
            name="endCondition"
            value={endCondition}
            onChange={(event) => setEndCondition(event.target.value)}
            className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
          >
            {END_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {endCondition === "onDate" && (
            <input
              type="date"
              name="endDate"
              required
              className="mt-2 w-full rounded border border-[#E1E3E6] px-3 py-2"
            />
          )}
          {endCondition === "afterNCount" && (
            <input
              type="number"
              name="endCount"
              min={1}
              required
              placeholder="Number of times"
              className="mt-2 w-full rounded border border-[#E1E3E6] px-3 py-2"
            />
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requiresReview" />
        &ldquo;Show me the work&rdquo; — require sign-off before this counts as done
      </label>

      <button
        type="submit"
        disabled={studentIds.length === 0}
        className="rounded bg-[#161616] px-4 py-2.5 text-white hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Create assignment
      </button>
    </form>
  );
}
