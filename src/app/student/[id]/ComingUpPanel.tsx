"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatComingUpDate, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { getSubjectColor } from "@/lib/subjectColors";
import type { StudentInstance } from "./types";

/** §2/§5: the next 14 days of due dates, kept minimal and read-only — grayed,
 * never interactive. "The week view is the teacher." */
export function ComingUpPanel({
  open,
  onClose,
  items,
  prefersReducedMotion,
}: {
  open: boolean;
  onClose: () => void;
  items: StudentInstance[];
  prefersReducedMotion: boolean;
}) {
  const groups = new Map<string, { date: Date; items: StudentInstance[] }>();
  for (const item of items) {
    if (!item.dueDate) continue;
    const key = toISODate(item.dueDate);
    if (!groups.has(key)) groups.set(key, { date: item.dueDate, items: [] });
    groups.get(key)!.items.push(item);
  }

  const slideTransition = prefersReducedMotion ? { duration: 0.15 } : { duration: 0.25, ease: "easeOut" as const };

  // §6/§4: "Coming Up... close on outside click, Close, or Escape, and
  // restore focus" — the invoking control (the header's "⋯" menu item) gets
  // focus back once this closes, same as ParentNavMenu/UndoMenu's dropdowns.
  const invokerRef = useRef<Element | null>(null);
  useEffect(() => {
    if (open) {
      invokerRef.current = document.activeElement;
      return;
    }
    if (invokerRef.current instanceof HTMLElement) invokerRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={slideTransition}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            className="fixed right-0 top-0 z-50 h-full w-80 max-w-[88vw] overflow-y-auto p-6"
            style={{ background: COLORS.background, borderLeft: `1px solid ${COLORS.hairline}` }}
            initial={prefersReducedMotion ? { opacity: 0 } : { x: 40, opacity: 0 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { x: 40, opacity: 0 }}
            transition={slideTransition}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium" style={{ color: COLORS.text }}>
                Coming Up
              </h2>
              <button onClick={onClose} className="text-sm" style={{ color: COLORS.muted }}>
                Close
              </button>
            </div>

            {groups.size === 0 && (
              <p className="mt-6 text-sm" style={{ color: COLORS.mutedFaint }}>
                Nothing due in the next two weeks.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-5">
              {[...groups.values()].map(({ date, items: dayItems }) => (
                <div key={toISODate(date)}>
                  <div className="text-xs font-medium" style={{ color: COLORS.muted }}>
                    {formatComingUpDate(date)}
                  </div>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {dayItems.map((item) => (
                      <li key={item.id} className="flex items-baseline gap-2 text-sm" style={{ color: COLORS.mutedFaint }}>
                        <span
                          aria-hidden
                          className="inline-block h-2 w-0.5 shrink-0"
                          style={{ background: getSubjectColor(item.subject?.name) }}
                        />
                        {item.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
