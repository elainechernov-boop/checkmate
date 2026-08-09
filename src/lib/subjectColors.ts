// Subjects don't carry a color in the data model (§3) — the week view needs
// one small solid tick per subject (§6, §9), so we assign a fixed, muted
// hue per the default subject list, with a deterministic fallback for any
// subject a parent adds later. All hues are kept low-saturation to stay
// "near-monochrome" per §9 — this is one of the three places color appears,
// not an invitation to go bright.
const PALETTE: Record<string, string> = {
  Math: "#5C7A6E",
  ELA: "#B5734A",
  Latin: "#8A4A4A",
  Science: "#6E7A4A",
  History: "#A98A3E",
  Art: "#7A5C8A",
  Scouts: "#4A7A5C",
  Handwriting: "#7A6A5C",
  Other: "#8A8272",
};

const FALLBACK_PALETTE = Object.values(PALETTE);

export function getSubjectColor(subjectName: string | null | undefined): string {
  if (!subjectName) return "#8A8272";
  if (PALETTE[subjectName]) return PALETTE[subjectName];

  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = (hash * 31 + subjectName.charCodeAt(i)) | 0;
  }
  return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}
