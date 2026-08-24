"use client";

import { useEffect, useRef, useState } from "react";
import { COLORS } from "@/lib/theme";
import { undoEntryAction } from "./undoActions";
import type { UndoLogRow } from "@/lib/undoLog";

/**
 * Parent Mode's undo — the last 10-20 destructive steps (deleting an
 * assignment, marking a day off/holiday), each reversible on its own.
 * Everything else (edits, reschedules, reorders) isn't logged here; those
 * are easy enough to redo by hand that the snapshot-and-reverse machinery
 * isn't worth it yet.
 */
export function UndoMenu({ entries }: { entries: UndoLogRow[] }) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (entries.length === 0) return null;

  async function handleUndo(id: string) {
    setPendingId(id);
    setError(null);
    const result = await undoEntryAction(id);
    setPendingId(null);
    if (result.error) setError(result.error);
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Undo recent changes"
        aria-expanded={open}
        className="flex items-center gap-1 px-1 text-[#6B6B6B] hover:underline"
      >
        Undo {open ? "▴" : "▾"}
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-10 mt-2 w-72 rounded border py-1 shadow-sm"
          style={{ borderColor: COLORS.hairline, background: COLORS.background }}
        >
          {error && (
            <p className="px-3 py-1.5 text-xs" style={{ color: COLORS.amber }}>
              {error}
            </p>
          )}
          <ul className="max-h-80 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span
                  className="min-w-0 truncate"
                  style={{
                    color: entry.undone ? COLORS.mutedFaint : COLORS.text,
                    textDecoration: entry.undone ? "line-through" : undefined,
                  }}
                  title={entry.summary}
                >
                  {entry.summary}
                </span>
                {!entry.undone && (
                  <button
                    type="button"
                    onClick={() => handleUndo(entry.id)}
                    disabled={pendingId === entry.id}
                    className="shrink-0 text-xs font-medium hover:underline"
                    style={{ color: COLORS.text }}
                  >
                    {pendingId === entry.id ? "Undoing…" : "Undo"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
