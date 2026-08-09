"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { AssignmentInstance } from "@/generated/prisma/client";
import { toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { getSubjectColor } from "@/lib/subjectColors";

type InstanceWithSubject = AssignmentInstance & { subject: { id: string; name: string } | null };

function formatComingUpDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

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
  items: InstanceWithSubject[];
  prefersReducedMotion: boolean;
}) {
  const groups = new Map<string, { date: Date; items: InstanceWithSubject[] }>();
  for (const item of items) {
    if (!item.dueDate) continue;
    const key = toISODate(item.dueDate);
    if (!groups.has(key)) groups.set(key, { date: item.dueDate, items: [] });
    groups.get(key)!.items.push(item);
  }

  const slideTransition = prefersReducedMotion ? { duration: 0.15 } : { duration: 0.25, ease: "easeOut" as const };

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
            className="fixed right-0 top-0 z-50 h-full w-80 overflow-y-auto p-6"
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
