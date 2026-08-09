"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { COLORS } from "@/lib/theme";
import { applyReschedule } from "./planner-actions";

export interface ReschedulableItem {
  id: string;
  title: string;
  studentName: string;
}

/** §5 "Reschedule Helper" — shift to next school day / a chosen date /
 * distribute across the week, for whatever was still sitting on a day the
 * parent just marked off/field-trip/sick. */
export function RescheduleHelperModal({
  open,
  dateISO,
  items,
  onClose,
}: {
  open: boolean;
  dateISO: string | null;
  items: ReschedulableItem[];
  onClose: () => void;
}) {
  const [chosenDate, setChosenDate] = useState("");
  const [pending, setPending] = useState(false);

  async function run(mode: "nextSchoolDay" | "chosenDate" | "distribute") {
    if (!dateISO || pending) return;
    if (mode === "chosenDate" && !chosenDate) return;
    setPending(true);
    await applyReschedule(dateISO, mode, mode === "chosenDate" ? chosenDate : undefined);
    setPending(false);
    setChosenDate("");
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Reschedule the day's work" prefersReducedMotion={false}>
      <div className="flex flex-col gap-4 text-sm">
        <p style={{ color: COLORS.muted }}>
          {items.length} assignment{items.length === 1 ? "" : "s"} {items.length === 1 ? "was" : "were"} already
          scheduled that day.
        </p>

        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              {item.title} <span style={{ color: COLORS.muted }}>· {item.studentName}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run("nextSchoolDay")}
            className="rounded border px-3 py-2 text-left hover:border-[#A9ACB2]"
            style={{ borderColor: COLORS.hairline }}
          >
            Shift to next school day
          </button>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={chosenDate}
              onChange={(event) => setChosenDate(event.target.value)}
              className="flex-1 rounded border px-2 py-1.5"
              style={{ borderColor: COLORS.hairline }}
            />
            <button
              type="button"
              disabled={pending || !chosenDate}
              onClick={() => run("chosenDate")}
              className="shrink-0 rounded border px-3 py-2 hover:border-[#A9ACB2]"
              style={{ borderColor: COLORS.hairline }}
            >
              Move here
            </button>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() => run("distribute")}
            className="rounded border px-3 py-2 text-left hover:border-[#A9ACB2]"
            style={{ borderColor: COLORS.hairline }}
          >
            Distribute across the week
          </button>
        </div>
      </div>
    </Modal>
  );
}
