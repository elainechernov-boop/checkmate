"use client";

import { COLORS } from "@/lib/theme";

/** README §3: "a plain-text 'Export as PDF work sample →' link" — no boxed
 * button anywhere in the redesign; Safari's own Print to PDF does the rest. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="text-sm hover:underline print:hidden"
      style={{ color: COLORS.cobalt }}
    >
      Export as PDF work sample →
    </button>
  );
}
