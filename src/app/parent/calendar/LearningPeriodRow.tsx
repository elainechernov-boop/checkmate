"use client";

import { useState } from "react";
import type { LearningPeriod } from "@/generated/prisma/client";
import { toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { deleteLearningPeriod, updateLearningPeriod } from "./actions";

/** HOMEROOM_UX_MIGRATION.md §4/§5.11 — "Deletion uses inline confirmation,"
 * never a centered browser dialog. */
export function LearningPeriodRow({ lp }: { lp: LearningPeriod }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <form action={updateLearningPeriod} className="flex flex-wrap items-end gap-4 border-b py-3 text-sm" style={{ borderColor: COLORS.hairline }}>
      <input type="hidden" name="id" value={lp.id} />
      <div>
        <label className="block text-xs" style={{ color: COLORS.muted }}>
          Name
        </label>
        <input type="text" name="name" defaultValue={lp.name} required className="hr-flat-input w-24" />
      </div>
      <div>
        <label className="block text-xs" style={{ color: COLORS.muted }}>
          Start
        </label>
        <input type="date" name="startDate" defaultValue={toISODate(lp.startDate)} required className="hr-flat-input" />
      </div>
      <div>
        <label className="block text-xs" style={{ color: COLORS.muted }}>
          End
        </label>
        <input type="date" name="endDate" defaultValue={toISODate(lp.endDate)} required className="hr-flat-input" />
      </div>
      <div>
        <label className="block text-xs" style={{ color: COLORS.muted }}>
          HST meeting (optional)
        </label>
        <input
          type="date"
          name="hstMeetingDate"
          defaultValue={lp.hstMeetingDate ? toISODate(lp.hstMeetingDate) : ""}
          className="hr-flat-input"
        />
      </div>
      <button type="submit" className="hr-text-action font-medium" style={{ color: COLORS.text }}>
        Save
      </button>

      {confirmingDelete ? (
        <span className="ml-auto flex items-center gap-2">
          <span style={{ color: COLORS.muted }}>Delete?</span>
          <button type="submit" formAction={deleteLearningPeriod} className="hr-text-action font-medium" style={{ color: COLORS.crimson }}>
            Delete
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              setConfirmingDelete(false);
            }}
            className="hr-text-action"
            style={{ color: COLORS.muted }}
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="hr-text-action ml-auto"
          style={{ color: COLORS.crimson }}
        >
          Delete
        </button>
      )}
    </form>
  );
}
