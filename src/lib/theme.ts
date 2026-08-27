// The "homeroom" brand palette — HOMEROOM_UX_MIGRATION.md §3 is the source
// of truth; keep every value here one-to-one with the `--hr-*` custom
// properties in globals.css. Cream is the standard app background; white is
// reserved for Parent Mode cards and the print report. Crimson is semantic
// only (live-now, "Show Mom", errors, destructive actions) and is never a
// student accent. Cobalt is the default system color / default student
// accent (also the imported family calendar overlay's chip color). Tennis
// is a brand/progress accent — never small text on cream or white, it
// lacks contrast there. Subject ticks (subjectColors.ts) and each student's
// own accentColor (cycled via STUDENT_ACCENT_ROTATION below) are the other
// two places color appears.
export const COLORS = {
  background: "#FAF7F2",
  white: "#FFFFFF",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  mutedFaint: "#A9ACB2",
  hairline: "#E1E3E6",
  dashed: "#C7C2B8",
  tennis: "#D8F609",
  cobalt: "#1657FF",
  crimson: "#E8264B",
  magenta: "#F0179E",
  seafoam: "#2FD9A8",
  poppy: "#FF9500",
  violet: "#B15CFF",
  orange: "#FF5E00",
} as const;

// Tapping a student's own name cycles through this fixed order (README
// "New feature: student-editable accent color") — cobalt is the default a
// freshly-seeded student starts on.
export const STUDENT_ACCENT_ROTATION = [
  "#1657FF", // cobalt (default)
  "#F0179E", // magenta
  "#2FD9A8", // sea foam
  "#D8F609", // tennis-ball
  "#FF9500", // poppy
  "#B15CFF", // violet
  "#FF5E00", // bright orange
] as const;

export function nextAccentColor(current: string): string {
  const index = STUDENT_ACCENT_ROTATION.indexOf(current as (typeof STUDENT_ACCENT_ROTATION)[number]);
  return STUDENT_ACCENT_ROTATION[(index + 1) % STUDENT_ACCENT_ROTATION.length];
}
