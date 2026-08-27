"use client";

import { COLORS } from "@/lib/theme";

/**
 * HOMEROOM_UX_MIGRATION.md §3/§4 — "a plain text summary plus Undo action,
 * not a menu" and "Undo should not permanently consume nav space." Renders
 * only while `message` is set; the caller owns the timeout/dismiss logic
 * (each action already knows how long its own undo window is).
 */
export function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg px-4 py-2.5 text-sm shadow-lg"
      style={{ background: COLORS.text, color: COLORS.background }}
    >
      <span>{message}</span>
      <button type="button" className="hr-text-action font-semibold underline" onClick={onUndo}>
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        className="hr-text-action"
        style={{ color: COLORS.mutedFaint }}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
