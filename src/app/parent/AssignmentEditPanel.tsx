"use client";

import { useState } from "react";
import type { AssignmentInstance, AssignmentSeries, RecurrenceRule } from "@/generated/prisma/client";
import { toISODate, WEEKDAYS } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { deleteAssignment, updateAssignment } from "./planner-actions";

export type EditableInstance = AssignmentInstance & {
  subject: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  series:
    | (Pick<AssignmentSeries, "id" | "endCondition" | "endDate" | "endCount" | "estimatedMinutes"> & {
        recurrence: Pick<RecurrenceRule, "frequency" | "daysOfWeek" | "interval"> | null;
      })
    | null;
};

// §12: 10 / 30 / 60 minutes ahead of the assignment's own scheduledTime.
const REMINDER_OPTIONS = [
  { value: "10", label: "10 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
];

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

const SCOPE_OPTIONS = [
  { value: "only", label: "This assignment only" },
  { value: "following", label: "This and following" },
  { value: "all", label: "All in series" },
] as const;

const fieldLabel = "block text-[0.65rem] font-medium uppercase tracking-wide";
const fieldInput = "mt-0.5 w-full border-b bg-transparent py-1 text-xs outline-none";

/**
 * The redesign's "identical inline-expand/edit pattern, on the parent's own
 * board" (README §4) — every field EditAssignmentModal used to edit inside
 * a full-screen dialog, now rendered directly beneath the row instead
 * (ParentWeekBoard's RowFrame), no backdrop or portal. Every field still
 * submits together in one `updateAssignment(formData)` call — the
 * Repeat/Ends/scope-picker fields are too interdependent to usefully
 * commit one at a time, so "inline" here means "in place," not "each
 * field its own round trip" (matching how the read-only student panel
 * already works: one expand, one place, not five separate saves).
 */
export function EditPanel({
  instance,
  subjects,
  onSaved,
  onCancel,
}: {
  instance: EditableInstance;
  subjects: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isSeries = !!instance.seriesId;
  const [scope, setScope] = useState<(typeof SCOPE_OPTIONS)[number]["value"]>("only");
  const [repeat, setRepeat] = useState<string>(instance.series?.recurrence?.frequency ?? "none");
  const [endCondition, setEndCondition] = useState<string>(instance.series?.endCondition ?? "never");
  const [timeSensitive, setTimeSensitive] = useState(instance.isTimeSensitive);
  const [deleting, setDeleting] = useState(false);

  const showRepeatSection = !isSeries || scope !== "only";
  const showDueDate = !isSeries || scope === "only";
  const showDaysOfWeek = repeat === "weekly" || repeat === "biweekly";
  const initialDaysOfWeek = new Set((instance.series?.recurrence?.daysOfWeek ?? "").split(",").filter(Boolean));

  async function handleSubmit(formData: FormData) {
    await updateAssignment(formData);
    onSaved();
  }

  async function handleDelete() {
    const message =
      !isSeries || scope === "only"
        ? "Delete this assignment? This can't be undone."
        : scope === "following"
          ? "Delete this and every future occurrence in this series? Completed work is kept. This can't be undone."
          : "Delete this entire series? Completed work is kept. This can't be undone.";
    if (!window.confirm(message)) return;

    setDeleting(true);
    try {
      await deleteAssignment(instance.id, isSeries ? scope : "only");
      onSaved();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form
      action={handleSubmit}
      onClick={(event) => event.stopPropagation()}
      className="mt-2 flex flex-col gap-3 border-t pt-3 text-xs"
      style={{ borderColor: COLORS.hairline }}
    >
      <input type="hidden" name="instanceId" value={instance.id} />
      {isSeries && <input type="hidden" name="scope" value={scope} />}

      {isSeries && (
        <div>
          <span className={fieldLabel} style={{ color: COLORS.muted }}>
            Applies to
          </span>
          <div className="mt-1 flex gap-3">
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                style={{ color: scope === option.value ? COLORS.text : COLORS.mutedFaint, fontWeight: scope === option.value ? 700 : 400 }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Title
        </label>
        <input type="text" name="title" required defaultValue={instance.title} className={fieldInput} style={{ borderColor: COLORS.hairline, color: COLORS.text }} />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={fieldLabel} style={{ color: COLORS.muted }}>
            Subject
          </label>
          <select name="subjectId" defaultValue={instance.subjectId ?? ""} className={fieldInput} style={{ borderColor: COLORS.hairline, color: COLORS.text }}>
            <option value="">No subject</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className={fieldLabel} style={{ color: COLORS.muted }}>
            Est. min
          </label>
          <input
            type="number"
            name="estimatedMinutes"
            min={0}
            defaultValue={instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? ""}
            className={fieldInput}
            style={{ borderColor: COLORS.hairline, color: COLORS.text }}
          />
        </div>
      </div>

      <div>
        <label className={fieldLabel} style={{ color: COLORS.muted }}>
          Details
        </label>
        <textarea
          name="details"
          rows={2}
          defaultValue={instance.details ?? ""}
          className={fieldInput}
          style={{ borderColor: COLORS.hairline, color: COLORS.text }}
        />
      </div>

      {showDueDate && (
        <div>
          <label className={fieldLabel} style={{ color: COLORS.muted }}>
            Due date
          </label>
          <input
            type="date"
            name="dueDate"
            required
            defaultValue={instance.dueDate ? toISODate(instance.dueDate) : ""}
            className={fieldInput}
            style={{ borderColor: COLORS.hairline, color: COLORS.text, width: "auto" }}
          />
        </div>
      )}

      <div>
        <label className="flex items-center gap-2" style={{ color: COLORS.text }}>
          <input type="checkbox" checked={timeSensitive} onChange={(event) => setTimeSensitive(event.target.checked)} />
          Happens at a set time — highlight it and remind me
        </label>

        {timeSensitive && (
          <div className="mt-2 flex items-end gap-3">
            <div>
              <label className={fieldLabel} style={{ color: COLORS.muted }}>
                Time
              </label>
              <input
                type="time"
                name="scheduledTime"
                required
                defaultValue={instance.scheduledTime ?? ""}
                className={fieldInput}
                style={{ borderColor: COLORS.hairline, color: COLORS.text, width: "auto" }}
              />
            </div>
            <div>
              <label className={fieldLabel} style={{ color: COLORS.muted }}>
                Remind
              </label>
              <select
                name="reminderMinutesBefore"
                defaultValue={String(instance.reminderMinutesBefore ?? 10)}
                className={fieldInput}
                style={{ borderColor: COLORS.hairline, color: COLORS.text, width: "auto" }}
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

      {showRepeatSection && (
        <div>
          <label className={fieldLabel} style={{ color: COLORS.muted }}>
            Repeat
          </label>
          <select
            name="repeat"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            className={fieldInput}
            style={{ borderColor: COLORS.hairline, color: COLORS.text, width: "auto" }}
          >
            {REPEAT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {showRepeatSection && showDaysOfWeek && (
        <div>
          <span className={fieldLabel} style={{ color: COLORS.muted }}>
            On these days
          </span>
          <div className="mt-1 flex gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day.code} className="flex items-center gap-1 capitalize" style={{ color: COLORS.text }}>
                <input type="checkbox" name="daysOfWeek" value={day.code} defaultChecked={initialDaysOfWeek.has(day.code)} />
                {day.code}
              </label>
            ))}
          </div>
        </div>
      )}

      {showRepeatSection && repeat !== "none" && (
        <div>
          <label className={fieldLabel} style={{ color: COLORS.muted }}>
            Ends
          </label>
          <select
            name="endCondition"
            value={endCondition}
            onChange={(event) => setEndCondition(event.target.value)}
            className={fieldInput}
            style={{ borderColor: COLORS.hairline, color: COLORS.text, width: "auto" }}
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
              defaultValue={instance.series?.endDate ? toISODate(instance.series.endDate) : ""}
              className={fieldInput}
              style={{ borderColor: COLORS.hairline, color: COLORS.text, width: "auto" }}
            />
          )}
          {endCondition === "afterNCount" && (
            <input
              type="number"
              name="endCount"
              min={1}
              required
              placeholder="Number of times"
              defaultValue={instance.series?.endCount ?? ""}
              className={fieldInput}
              style={{ borderColor: COLORS.hairline, color: COLORS.text, width: "auto" }}
            />
          )}
        </div>
      )}

      <label className="flex items-center gap-2" style={{ color: COLORS.text }}>
        <input type="checkbox" name="requiresReview" defaultChecked={instance.requiresReview} />
        &ldquo;Show me the work&rdquo; — require sign-off before this counts as done
      </label>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={deleting} className="font-medium" style={{ color: COLORS.text }}>
          Save
        </button>
        <button type="button" onClick={onCancel} style={{ color: COLORS.mutedFaint }}>
          Cancel
        </button>
        <button type="button" onClick={handleDelete} disabled={deleting} className="ml-auto font-medium" style={{ color: COLORS.crimson }}>
          Delete
        </button>
      </div>
    </form>
  );
}
