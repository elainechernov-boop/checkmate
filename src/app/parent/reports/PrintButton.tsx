"use client";

import { COLORS } from "@/lib/theme";

/** HOMEROOM_UX_MIGRATION.md §5.10 — a plain-text print action; no boxed
 * button anywhere in the redesign, and never called a "work sample PDF"
 * (this is a meeting-prep/activity report, not a work sample). Safari's
 * own Print to PDF does the rest. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm hover:underline print:hidden"
      style={{ color: COLORS.cobalt }}
    >
      Print / Save as PDF →
    </button>
  );
}
