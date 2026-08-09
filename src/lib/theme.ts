// The near-monochrome palette from SPEC.md §9 — shifted to crisper, cooler
// neutrals (near-white bg, cool grays, thin cool hairlines) per feedback
// that the original warm/tan tones read as soft rather than crisp. Color
// still appears in exactly three places: subject ticks (subjectColors.ts),
// each student's own accentColor, and this single amber for roll marks /
// "Show Mom" — both left untouched, since they're functional cues, not
// part of the neutral background feel.
export const COLORS = {
  background: "#FAFAFA",
  text: "#161616",
  muted: "#6B6B6B",
  mutedFaint: "#A9ACB2",
  hairline: "#E1E3E6",
  amber: "#B5451B",
} as const;
