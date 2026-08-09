"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { COLORS } from "@/lib/theme";

/**
 * The app's first real dialog (everything before this was ComingUpPanel's
 * bespoke slide-over). Portals to document.body, traps Escape, restores
 * focus on close. `document` doesn't exist during SSR, so this renders
 * nothing server-side — safe since every modal in the app starts closed.
 *
 * Exit timing is handled manually (a delayed unmount, with an explicit
 * timeout ref so a rapid re-toggle can't leave a stale timer running)
 * rather than via AnimatePresence — in this app/framer-motion combination,
 * AnimatePresence's unmount-after-exit never actually fired in testing:
 * the exit animation completed, opacity settled at 0, but the node was
 * never removed.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  prefersReducedMotion = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  prefersReducedMotion?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [rendered, setRendered] = useState(open);

  const duration = prefersReducedMotion ? 0.15 : 0.2;

  useEffect(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (open) {
      // This is the open-side of the same timer-coordinated concern as the
      // close path below (keeping `rendered` in sync so a rapid re-toggle
      // can't race a pending close timeout), not a plain prop mirror.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRendered(true);
      return;
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setRendered(false);
      closeTimeoutRef.current = null;
    }, duration * 1000);
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, [open, duration]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined" || !rendered) return null;

  const transition = { duration, ease: "easeOut" as const };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-6"
      onClick={onClose}
      initial={false}
      animate={{ opacity: open ? 1 : 0 }}
      transition={transition}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative w-full max-w-md rounded-lg p-6 shadow-lg outline-none"
        style={{ background: COLORS.background, border: `1px solid ${COLORS.hairline}` }}
        initial={false}
        animate={
          prefersReducedMotion
            ? { opacity: open ? 1 : 0 }
            : { opacity: open ? 1 : 0, scale: open ? 1 : 0.97, y: open ? 0 : 6 }
        }
        transition={transition}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium" style={{ color: COLORS.text }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-sm hover:underline"
            style={{ color: COLORS.muted }}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
