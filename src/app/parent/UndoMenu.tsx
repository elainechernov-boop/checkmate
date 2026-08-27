"use client";

import { useState } from "react";
import { UndoToast } from "@/components/UndoToast";
import { undoEntryAction } from "./undoActions";
import type { UndoLogRow } from "@/lib/undoLog";

/**
 * HOMEROOM_UX_MIGRATION.md §3/§4 — "Undo should not permanently consume nav
 * space. Show a contextual Undo toast after a reversible action." Only the
 * single most recent reversible step (deleting an assignment, marking a day
 * off/holiday) is ever surfaced; once it's undone (or dismissed, or another
 * destructive action happens), `entries` revalidates and the next-most-
 * recent one takes its place. A parent who doesn't act on it can dismiss it
 * outright — it isn't parked in the nav waiting to be noticed.
 */
export function UndoMenu({ entries }: { entries: UndoLogRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  // A newly-recorded entry (a fresh delete/day-type-change) always gets its
  // own toast, even if the previous one was dismissed or errored — reset
  // during render (same pattern as StudentWeekView's synced-prop resyncs)
  // rather than in an effect.
  const [syncedLatestId, setSyncedLatestId] = useState<string | null>(null);

  const latest = entries.find((entry) => !entry.undone);
  if ((latest?.id ?? null) !== syncedLatestId) {
    setSyncedLatestId(latest?.id ?? null);
    setError(null);
  }

  if (!latest || latest.id === dismissedId) return null;

  async function handleUndo() {
    setPendingId(latest!.id);
    setError(null);
    const result = await undoEntryAction(latest!.id);
    setPendingId(null);
    if (result.error) setError(result.error);
  }

  return (
    <UndoToast
      message={error ?? `${latest.summary}${pendingId === latest.id ? " — undoing…" : ""}`}
      onUndo={handleUndo}
      onDismiss={() => setDismissedId(latest.id)}
    />
  );
}
