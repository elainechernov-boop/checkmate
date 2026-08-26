// The "homeroom" brand palette (design_handoff_homeroom_redesign/README.md)
// — cream background, near-black ink, and a small, fixed set of functional
// colors: crimson for attention-only states (live-now, "Show Mom" — never a
// student accent, never changes), cobalt as the UI primary / default
// student accent (also used for the imported family calendar overlay's chip
// color — there's no longer a separate calendar-only blue), and tennis-ball
// green as the brand accent itself, used sparingly. Subject ticks
// (subjectColors.ts) and each student's own accentColor (cycled via
// STUDENT_ACCENT_ROTATION below) are the other two places color appears.
export const COLORS = {
  background: "#FAF7F2",
  text: "#1A1A1A",
  muted: "#6B6B6B",
  mutedFaint: "#A9ACB2",
  hairline: "#E1E3E6",
  tennis: "#D8F609",
  cobalt: "#1657FF",
  crimson: "#E8264B",
  // Legacy alias, kept only until every call site is migrated in later
  // phases: "amber" was the old roll-mark/"Show Mom" tone (now crimson).
  amber: "#E8264B",
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
