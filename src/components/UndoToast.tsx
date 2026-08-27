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
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3"
      // BUILD_SPEC.md Screen 12-K: a minimal contextual text line, not a
      // black rounded card — the white backing is only for legibility over
      // whatever's beneath it, with no border/radius/shadow of its own.
      style={{ background: COLORS.white, padding: "5px 8px" }}
    >
      <span style={{ color: COLORS.muted, fontSize: 11.5 }}>{message}</span>
      <button
        type="button"
        className="hr-text-action font-semibold"
        style={{ color: COLORS.cobalt, fontSize: 11.5 }}
        onClick={onUndo}
      >
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        className="hr-text-action"
        style={{ color: COLORS.mutedFaint, fontSize: 11.5 }}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
