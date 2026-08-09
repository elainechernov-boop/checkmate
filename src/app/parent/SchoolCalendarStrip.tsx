"use client";

import { useState } from "react";
import { SchoolDayType } from "@/generated/prisma/enums";
import { formatDayLabel, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { setDayType } from "./planner-actions";
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

/** §5 "field trips and off days" — one shared day-type control per day (the
 * calendar isn't per-kid), reached by clicking the date itself rather than a
 * separate row of always-visible dropdowns. */
export function SchoolCalendarStrip({
  days,
  schoolDayTypes,
}: {
  days: Date[];
  schoolDayTypes: Record<string, SchoolDayType>;
}) {
  const [editingDateISO, setEditingDateISO] = useState<string | null>(null);
  const [helperDate, setHelperDate] = useState<string | null>(null);
  const [reschedulable, setReschedulable] = useState<ReschedulableItem[]>([]);

  async function handleChange(dateISO: string, type: SchoolDayType) {
    setEditingDateISO(null);
    const result = await setDayType(dateISO, type);
    if (result.reschedulable.length > 0) {
      setReschedulable(result.reschedulable);
      setHelperDate(dateISO);
    }
  }

  return (
    <>
      <div className="mt-8 grid grid-cols-6 gap-4">
        {days.map((day) => {
          const dateISO = toISODate(day);
          const type = schoolDayTypes[dateISO] ?? SchoolDayType.schoolDay;
          const tag = TYPE_TAG[type];
          const isEditing = editingDateISO === dateISO;

          return (
            <div key={dateISO}>
              {isEditing ? (
                <select
                  autoFocus
                  value={type}
                  onChange={(event) => handleChange(dateISO, event.target.value as SchoolDayType)}
                  onBlur={() => setEditingDateISO(null)}
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
                  onClick={() => setEditingDateISO(dateISO)}
                  className="text-left text-xs hover:underline"
                  style={{ color: tag ? COLORS.amber : COLORS.muted }}
                  title="Click to mark this day off, a field trip, sick, or a holiday"
                >
                  <span className="font-medium">{formatDayLabel(day)}</span>
                  {tag && <span> · {tag}</span>}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <RescheduleHelperModal
        open={!!helperDate}
        dateISO={helperDate}
        items={reschedulable}
        onClose={() => setHelperDate(null)}
      />
    </>
  );
}
