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

export function AssignmentForm({ students, subjects }: { students: Student[]; subjects: Subject[] }) {
  const [repeat, setRepeat] = useState("none");
  const [endCondition, setEndCondition] = useState("never");
  const showDaysOfWeek = repeat === "weekly" || repeat === "biweekly";

  return (
    <form action={createAssignment} className="mt-8 max-w-lg space-y-6">
      <div>
        <label className="block text-sm font-medium">Title</label>
        <input
          type="text"
          name="title"
          required
          className="mt-1 w-full rounded border border-[#DDD6CB] px-3 py-2"
        />
      </div>

      <div>
        <span className="block text-sm font-medium">Student</span>
        <div className="mt-1 flex gap-2">
          {students.map((student, index) => (
            <label
              key={student.id}
              className="flex-1 cursor-pointer rounded border border-[#DDD6CB] px-3 py-2 text-center text-sm has-[:checked]:border-[#1A1A1A] has-[:checked]:bg-[#1A1A1A] has-[:checked]:text-white"
              style={{ borderTopColor: student.accentColor, borderTopWidth: 3 }}
            >
              <input
                type="radio"
                name="studentId"
                value={student.id}
                required
                defaultChecked={index === 0}
                className="sr-only"
              />
              {student.name}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">Subject</label>
        <select name="subjectId" required className="mt-1 w-full rounded border border-[#DDD6CB] px-3 py-2">
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">Details (optional)</label>
        <textarea name="details" rows={2} className="mt-1 w-full rounded border border-[#DDD6CB] px-3 py-2" />
      </div>

      <div>
        <label className="block text-sm font-medium">Est. minutes (optional)</label>
        <input
          type="number"
          name="estimatedMinutes"
          min={0}
          className="mt-1 w-32 rounded border border-[#DDD6CB] px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Due date</label>
        <input
          type="date"
          name="dueDate"
          required
          className="mt-1 w-full rounded border border-[#DDD6CB] px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Repeat</label>
        <select
          name="repeat"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          className="mt-1 w-full rounded border border-[#DDD6CB] px-3 py-2"
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
            className="mt-1 w-full rounded border border-[#DDD6CB] px-3 py-2"
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
              className="mt-2 w-full rounded border border-[#DDD6CB] px-3 py-2"
            />
          )}
          {endCondition === "afterNCount" && (
            <input
              type="number"
              name="endCount"
              min={1}
              required
              placeholder="Number of times"
              className="mt-2 w-full rounded border border-[#DDD6CB] px-3 py-2"
            />
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requiresReview" />
        &ldquo;Show me the work&rdquo; — require sign-off before this counts as done
      </label>

      <button type="submit" className="rounded bg-[#1A1A1A] px-4 py-2.5 text-white hover:bg-[#333]">
        Create assignment
      </button>
    </form>
  );
}
