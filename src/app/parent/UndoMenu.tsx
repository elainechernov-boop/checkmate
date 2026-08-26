"use client";

import { useState } from "react";
import { COLORS } from "@/lib/theme";
import { undoEntryAction } from "./undoActions";
import type { UndoLogRow } from "@/lib/undoLog";

/**
 * Parent Mode's undo — a plain text link/toast (README §4: "a plain text
 * 'Undo' link/toast, not a menu"), not a dropdown. Only the single most
 * recent reversible step (deleting an assignment, marking a day off/
 * holiday) is ever surfaced; once it's undone (or another destructive
 * action happens), `entries` revalidates and the next-most-recent one
 * takes its place.
 */
export function UndoMenu({ entries }: { entries: UndoLogRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const latest = entries.find((entry) => !entry.undone);
  if (!latest) return null;

  async function handleUndo() {
    setPendingId(latest!.id);
    setError(null);
    const result = await undoEntryAction(latest!.id);
    setPendingId(null);
    if (result.error) setError(result.error);
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {error ? (
        <span className="truncate" style={{ color: COLORS.crimson }} title={error}>
          {error}
        </span>
      ) : (
        <>
          <span className="hidden max-w-[10rem] truncate lg:inline" style={{ color: COLORS.mutedFaint }} title={latest.summary}>
            {latest.summary}
          </span>
          <button
            type="button"
            onClick={handleUndo}
            disabled={pendingId === latest.id}
            className="shrink-0 hover:underline"
            style={{ color: COLORS.cobalt }}
          >
            {pendingId === latest.id ? "Undoing…" : "Undo"}
          </button>
        </>
      )}
    </span>
  );
}
