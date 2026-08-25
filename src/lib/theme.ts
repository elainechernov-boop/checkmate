// The near-monochrome palette from SPEC.md §9 — shifted to crisper, cooler
// neutrals (near-white bg, cool grays, thin cool hairlines) per feedback
// that the original warm/tan tones read as soft rather than crisp. Color
// still appears in a small, fixed set of functional places: subject ticks
// (subjectColors.ts), each student's own accentColor, amber for roll marks
// / "Show Mom", and — parent's own explicit request — a separate cool blue
// reserved for the imported family calendar overlay, so an external event
// reads at a glance as "not schoolwork" rather than blending into the same
// amber a timed assignment gets.
export const COLORS = {
  background: "#FAFAFA",
  text: "#161616",
  muted: "#6B6B6B",
  mutedFaint: "#A9ACB2",
  hairline: "#E1E3E6",
  amber: "#B5451B",
  calendar: "#3B5B7A",
} as const;
