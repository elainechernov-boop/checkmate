"use client";

import { useState, type FormEvent } from "react";
import type { PlanRecurrenceChoice } from "@/lib/projects";
import { WEEKDAYS, toISODate, type WeekdayCode } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { Modal } from "@/components/Modal";
import { planProjectTaskAction } from "./projectActions";
import type { StudentInstance } from "./types";

// The week view only ever shows Mon-Sat (§6) — picking Sunday here would
// quietly generate an occurrence that can never appear anywhere.
const PLAN_WEEKDAYS = WEEKDAYS.filter((day) => day.code !== "sun");

const CHOICES: { value: PlanRecurrenceChoice; label: string }[] = [
  { value: "once", label: "Just once" },
  { value: "everyDay", label: "Every day" },
  { value: "everyOtherDay", label: "Every other day" },
  { value: "pickDays", label: "Pick days…" },
];

/** §7's "Plan it" control — a kid-sized recurrence menu (four choices, not
 * the parent's full Repeat dropdown), running until the project's target
 * date by default or a chosen date. */
export function PlanTaskModal({
  task,
  studentId,
  defaultUntilDate,
  today,
  onClose,
  prefersReducedMotion,
}: {
  task: StudentInstance | null;
  studentId: string;
  defaultUntilDate: Date | null;
  today: Date;
  onClose: () => void;
  prefersReducedMotion: boolean;
}) {
  return (
    <Modal
      open={!!task}
      onClose={onClose}
      title={task ? `Plan "${task.title}"` : "Plan it"}
      prefersReducedMotion={prefersReducedMotion}
    >
      {task && (
        <PlanForm key={task.id} task={task} studentId={studentId} defaultUntilDate={defaultUntilDate} today={today} onSaved={onClose} />
      )}
    </Modal>
  );
}

function PlanForm({
  task,
  studentId,
  defaultUntilDate,
  today,
  onSaved,
}: {
  task: StudentInstance;
  studentId: string;
  defaultUntilDate: Date | null;
  today: Date;
  onSaved: () => void;
}) {
  const [choice, setChoice] = useState<PlanRecurrenceChoice>("once");
  const [startDate, setStartDate] = useState(toISODate(today));
  const [untilDate, setUntilDate] = useState(defaultUntilDate ? toISODate(defaultUntilDate) : "");
  const [days, setDays] = useState<Set<WeekdayCode>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsUntil = choice !== "once";
  const needsDays = choice === "pickDays";

  function toggleDay(code: WeekdayCode) {
    setDays((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await planProjectTaskAction(studentId, task.id, choice, startDate, Array.from(days), needsUntil ? untilDate || null : null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm">
      <div>
        <span className="block text-xs font-medium" style={{ color: COLORS.muted }}>
          Repeat
        </span>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {CHOICES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setChoice(option.value)}
              className="rounded border px-2 py-1.5 text-xs transition-colors"
              style={
                choice === option.value
                  ? { borderColor: COLORS.text, background: COLORS.text, color: "white" }
                  : { borderColor: COLORS.hairline, color: COLORS.text }
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium" style={{ color: COLORS.muted }}>
          {choice === "once" ? "Due date" : "Starting"}
        </label>
        <input
          type="date"
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          className="mt-1 w-full rounded border px-3 py-2"
          style={{ borderColor: COLORS.hairline }}
        />
      </div>

      {needsDays && (
        <div>
          <span className="block text-xs font-medium" style={{ color: COLORS.muted }}>
            On these days
          </span>
          <div className="mt-1 flex gap-3">
            {PLAN_WEEKDAYS.map((day) => (
              <label key={day.code} className="flex items-center gap-1.5 text-sm capitalize">
                <input type="checkbox" checked={days.has(day.code)} onChange={() => toggleDay(day.code)} />
                {day.code}
              </label>
            ))}
          </div>
        </div>
      )}

      {needsUntil && (
        <div>
          <label className="block text-xs font-medium" style={{ color: COLORS.muted }}>
            Until
          </label>
          <input
            type="date"
            value={untilDate}
            onChange={(event) => setUntilDate(event.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
            style={{ borderColor: COLORS.hairline }}
          />
          {!untilDate && (
            <p className="mt-1 text-xs" style={{ color: COLORS.mutedFaint }}>
              No target date on this project yet — pick when this plan should end.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: COLORS.amber }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="rounded px-4 py-2.5 text-white"
        style={{ background: COLORS.text }}
      >
        {saving ? "Planning…" : "Plan it"}
      </button>
    </form>
  );
}
