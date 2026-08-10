"use client";

import { useState } from "react";
import type { AssignmentInstance, AssignmentSeries, RecurrenceRule } from "@/generated/prisma/client";
import { toISODate, WEEKDAYS } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { Modal } from "@/components/Modal";
import { deleteAssignment, updateAssignment } from "./planner-actions";

export type EditableInstance = AssignmentInstance & {
  subject: { id: string; name: string } | null;
  series:
    | (Pick<AssignmentSeries, "id" | "endCondition" | "endDate" | "endCount" | "estimatedMinutes"> & {
        recurrence: Pick<RecurrenceRule, "frequency" | "daysOfWeek" | "interval"> | null;
      })
    | null;
};

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

export function EditAssignmentModal({
  instance,
  subjects,
  onClose,
  prefersReducedMotion,
}: {
  instance: EditableInstance | null;
  subjects: { id: string; name: string }[];
  onClose: () => void;
  prefersReducedMotion: boolean;
}) {
  return (
    <Modal
      open={!!instance}
      onClose={onClose}
      title={instance ? instance.title : "Edit assignment"}
      prefersReducedMotion={prefersReducedMotion}
    >
      {instance && <EditForm key={instance.id} instance={instance} subjects={subjects} onSaved={onClose} />}
    </Modal>
  );
}

function EditForm({
  instance,
  subjects,
  onSaved,
}: {
  instance: EditableInstance;
  subjects: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const isSeries = !!instance.seriesId;
  const [scope, setScope] = useState<(typeof SCOPE_OPTIONS)[number]["value"]>("only");
  const [repeat, setRepeat] = useState<string>(instance.series?.recurrence?.frequency ?? "none");
  const [endCondition, setEndCondition] = useState<string>(instance.series?.endCondition ?? "never");
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
    <form action={handleSubmit} className="flex flex-col gap-4 text-sm">
      <input type="hidden" name="instanceId" value={instance.id} />
      {isSeries && <input type="hidden" name="scope" value={scope} />}

      {isSeries && (
        <div>
          <span className="block text-xs font-medium text-[#6B6B6B]">Applies to</span>
          <div className="mt-1 flex gap-2">
            {SCOPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScope(option.value)}
                className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                  scope === option.value
                    ? "border-[#161616] bg-[#161616] text-white"
                    : "border-[#E1E3E6] text-[#161616] hover:border-[#A9ACB2]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-[#6B6B6B]">Title</label>
        <input
          type="text"
          name="title"
          required
          defaultValue={instance.title}
          className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#6B6B6B]">Subject</label>
        <select
          name="subjectId"
          defaultValue={instance.subjectId ?? ""}
          className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
        >
          <option value="">No subject</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-[#6B6B6B]">Details (optional)</label>
        <textarea
          name="details"
          rows={2}
          defaultValue={instance.details ?? ""}
          className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-[#6B6B6B]">Est. minutes (optional)</label>
        <input
          type="number"
          name="estimatedMinutes"
          min={0}
          defaultValue={instance.series?.estimatedMinutes ?? ""}
          className="mt-1 w-32 rounded border border-[#E1E3E6] px-3 py-2"
        />
      </div>

      {showDueDate && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B6B]">Due date</label>
          <input
            type="date"
            name="dueDate"
            required
            defaultValue={instance.dueDate ? toISODate(instance.dueDate) : ""}
            className="mt-1 w-full rounded border border-[#E1E3E6] px-3 py-2"
          />
        </div>
      )}

      {showRepeatSection && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B6B]">Repeat</label>
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
      )}

      {showRepeatSection && showDaysOfWeek && (
        <div>
          <span className="block text-xs font-medium text-[#6B6B6B]">On these days</span>
          <div className="mt-1 flex gap-3">
            {WEEKDAYS.map((day) => (
              <label key={day.code} className="flex items-center gap-1.5 text-sm capitalize">
                <input
                  type="checkbox"
                  name="daysOfWeek"
                  value={day.code}
                  defaultChecked={initialDaysOfWeek.has(day.code)}
                />
                {day.code}
              </label>
            ))}
          </div>
        </div>
      )}

      {showRepeatSection && repeat !== "none" && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B6B]">Ends</label>
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
              defaultValue={instance.series?.endDate ? toISODate(instance.series.endDate) : ""}
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
              defaultValue={instance.series?.endCount ?? ""}
              className="mt-2 w-full rounded border border-[#E1E3E6] px-3 py-2"
            />
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="requiresReview" defaultChecked={instance.requiresReview} />
        &ldquo;Show me the work&rdquo; — require sign-off before this counts as done
      </label>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm font-medium"
          style={{ color: COLORS.amber }}
        >
          Delete
        </button>
        <button
          type="submit"
          disabled={deleting}
          className="flex-1 rounded bg-[#161616] px-4 py-2.5 text-white hover:bg-[#333]"
        >
          Save
        </button>
      </div>
    </form>
  );
}
