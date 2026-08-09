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

/** §5 "field trips and off days" — a per-day type control shared across all
 * students' boards (the school calendar isn't per-kid), sitting above them. */
export function SchoolCalendarStrip({
  days,
  schoolDayTypes,
}: {
  days: Date[];
  schoolDayTypes: Record<string, SchoolDayType>;
}) {
  const [helperDate, setHelperDate] = useState<string | null>(null);
  const [reschedulable, setReschedulable] = useState<ReschedulableItem[]>([]);

  async function handleChange(dateISO: string, type: SchoolDayType) {
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
          const isBlocking = type !== SchoolDayType.schoolDay;
          return (
            <div key={dateISO} className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium" style={{ color: COLORS.muted }}>
                {formatDayLabel(day)}
              </span>
              <select
                value={type}
                onChange={(event) => handleChange(dateISO, event.target.value as SchoolDayType)}
                className="min-w-0 rounded border px-1.5 py-1 text-xs"
                style={{ borderColor: COLORS.hairline, color: isBlocking ? COLORS.amber : COLORS.muted }}
              >
                {TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
