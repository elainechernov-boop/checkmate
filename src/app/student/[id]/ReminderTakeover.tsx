"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { formatScheduledTime } from "@/lib/reminders";
import { COLORS } from "@/lib/theme";

/**
 * §12's reminder popup: a full-screen, un-auto-dismissing takeover that
 * interrupts whatever the student is doing ahead of a time-sensitive
 * assignment. Unlike DayCompleteTakeover (decorative, times itself out),
 * this one is actionable — it stays until the student taps the
 * acknowledgment button, matching the spec's "disrupts them" ask.
 */
export function ReminderTakeover({
  title,
  scheduledTime,
  reducedMotion,
  onDismiss,
}: {
  title: string;
  scheduledTime: string;
  reducedMotion: boolean;
  onDismiss: () => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Time-sensitive assignment reminder"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reducedMotion ? 0.15 : 0.3 }}
        style={{ position: "absolute", inset: 0, background: COLORS.background, opacity: 0.97 }}
      />

      <motion.div
        initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
        animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
        transition={{ duration: reducedMotion ? 0.15 : 0.35, ease: "easeOut" }}
        style={{ position: "relative", textAlign: "center", maxWidth: 420, padding: 24 }}
      >
        <div style={{ fontSize: "3rem" }}>🕐</div>
        <div className="mt-2" style={{ fontSize: "1.5rem", fontWeight: 700, color: COLORS.text }}>
          {title}
        </div>
        <div className="mt-1" style={{ fontSize: "1.05rem", color: COLORS.amber, fontWeight: 600 }}>
          starts at {formatScheduledTime(scheduledTime)}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          autoFocus
          className="mt-6 rounded px-5 py-2.5 text-sm font-medium text-white"
          style={{ background: COLORS.text }}
        >
          Got it — I&rsquo;m getting ready
        </button>
      </motion.div>
    </div>,
    document.body
  );
}
