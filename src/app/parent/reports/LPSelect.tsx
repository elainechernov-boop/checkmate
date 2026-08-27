"use client";

import { useRouter } from "next/navigation";
import { COLORS } from "@/lib/theme";

/** Per-student learning-period selector in the section header (§5.9) —
 * navigating (not a separate "Go" button) keeps this feeling like a plain
 * select, not a form. */
export function LPSelect({
  studentId,
  learningPeriods,
  selectedId,
}: {
  studentId: string;
  learningPeriods: { id: string; name: string }[];
  selectedId: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selectedId}
      onChange={(event) => {
        const params = new URLSearchParams(window.location.search);
        params.set(`lp_${studentId}`, event.target.value);
        router.push(`/parent/reports?${params.toString()}`);
      }}
      className="hr-flat-input"
      style={{ width: "auto", color: COLORS.muted, fontSize: 12 }}
      aria-label={`Learning period`}
    >
      {learningPeriods.map((lp) => (
        <option key={lp.id} value={lp.id}>
          {lp.name}
        </option>
      ))}
    </select>
  );
}
