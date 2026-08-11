"use client";

import { useState, type ReactNode } from "react";
import { motion, type PanInfo } from "framer-motion";

// Below this offset (px) or velocity (px/s), a drag is read as "changed my
// mind" and springs back to center via dragConstraints rather than paging.
const SWIPE_DISTANCE = 60;
const SWIPE_VELOCITY = 400;

/**
 * A one-card-at-a-time horizontal pager for the mobile day view (both
 * Student and Parent boards): drag left/right to page, snapping back if the
 * drag doesn't clear the distance/velocity threshold. `dayKey` identifies
 * whichever day is currently shown — changing it (from a swipe, an arrow
 * button, or a dot) is what actually swaps the rendered content; this
 * component owns only the gesture and the enter animation, not the day
 * index itself, so the caller stays the single source of truth for "which
 * day" (needed to fall through to a week change at either edge).
 *
 * Deliberately not AnimatePresence: Modal.tsx already found that this
 * app/framer-motion combination never actually unmounts an AnimatePresence
 * child after its exit animation finishes (opacity settles at 0, the node
 * just stays). Confirmed here too — a fast swipe or dot-jump left two
 * overlapping day cards stacked in the DOM. A plain `key`-driven remount
 * has no such failure mode (React unmounts the old element outright, no
 * animation library in the loop for that part) and still gets the entering
 * day its slide-in; the outgoing day just disappears instantly instead of
 * animating out, which reads fine at this speed.
 */
export function SwipeDayPager({
  dayKey,
  onSwipeLeft,
  onSwipeRight,
  prefersReducedMotion,
  children,
}: {
  dayKey: string;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  prefersReducedMotion: boolean;
  children: ReactNode;
}) {
  // Direction is derived from the dayKey change itself (ISO dates compare
  // lexicographically) rather than tracked only inside the drag handler, so
  // it's correct no matter how `dayKey` changed — a swipe, the arrow
  // buttons, or a dot jump all animate the right way. Plain state updated
  // during render (this codebase's usual "resync when a prop changes"
  // pattern), not a ref: it's read during this same render to pick the
  // `initial` position for the incoming key.
  const [previousKey, setPreviousKey] = useState(dayKey);
  const [direction, setDirection] = useState(0);
  if (dayKey !== previousKey) {
    setDirection(dayKey > previousKey ? 1 : -1);
    setPreviousKey(dayKey);
  }

  function handleDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) {
      onSwipeLeft();
    } else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) {
      onSwipeRight();
    }
  }

  return (
    <div className="relative overflow-hidden">
      <motion.div
        key={dayKey}
        initial={prefersReducedMotion ? { opacity: 0 } : { x: direction > 0 ? 48 : -48, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={
          prefersReducedMotion ? { duration: 0.12 } : { type: "spring", stiffness: 380, damping: 34 }
        }
        drag={prefersReducedMotion ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
      >
        {children}
      </motion.div>
    </div>
  );
}
