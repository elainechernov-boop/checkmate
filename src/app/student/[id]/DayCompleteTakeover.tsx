"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { COLORS } from "@/lib/theme";

// A candy palette just for this moment — the app is near-monochrome
// everywhere else (§9), but the whole point here is a full-screen "you did
// it" spectacle, so this one screen is allowed to be loud.
const CONFETTI_COLORS = ["#E85D5D", "#F2B84B", "#5CA9E8", "#6EC17A", "#B77FE0", "#F27DAE", "#4FC3C0"];

function generateBurst(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100, // vw
    drift: (Math.random() - 0.5) * 30, // vw, horizontal wander while falling
    delay: Math.random() * 0.6,
    duration: 2.2 + Math.random() * 1.3,
    rotate: (Math.random() - 0.5) * 900,
    width: 5 + Math.random() * 7,
    height: 8 + Math.random() * 10,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
}

/** §6 step 5, rebuilt as a full-screen takeover instead of a corner burst:
 * confetti rains across the entire viewport and a big "you did it" message
 * pops in the middle. Once per day, today only (DayColumn still owns that
 * gating) — this component just plays the moment and calls onDone.
 * prefers-reduced-motion gets a single soft flash + static message, no
 * particles, per §6 step 7. */
export function DayCompleteTakeover({
  studentName,
  reducedMotion,
  onDone,
}: {
  studentName: string;
  reducedMotion: boolean;
  onDone: () => void;
}) {
  const [particles] = useState(() => generateBurst(120));

  useEffect(() => {
    const timeout = window.setTimeout(onDone, reducedMotion ? 1200 : 3700);
    return () => window.clearTimeout(timeout);
  }, [onDone, reducedMotion]);

  // Only ever mounted client-side in response to the last item being
  // checked off — never during SSR — so `document.body` is safe to use
  // directly with no hydration-mismatch risk.
  if (reducedMotion) {
    return createPortal(
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.1, times: [0, 0.15, 0.75, 1] }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: COLORS.background,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span style={{ fontSize: "1.5rem", fontWeight: 600, color: COLORS.text }}>
          {studentName} finished the day! 🎉
        </span>
      </motion.div>,
      document.body
    );
  }

  return createPortal(
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 9998, pointerEvents: "none", overflow: "hidden" }}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 0.5 }}
        style={{ position: "absolute", inset: 0, background: "white" }}
      />

      {particles.map((p) => (
        <motion.span
          key={p.id}
          initial={{ left: `${p.left}vw`, top: "-8vh", rotate: 0, opacity: 1 }}
          animate={{ left: `${p.left + p.drift}vw`, top: "108vh", rotate: p.rotate, opacity: [1, 1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
          style={{
            position: "absolute",
            width: p.width,
            height: p.height,
            background: p.color,
            borderRadius: 1,
          }}
        />
      ))}

      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.15, 1, 1, 0.9], opacity: [0, 1, 1, 1, 0] }}
        transition={{ duration: 3.4, times: [0, 0.13, 0.22, 0.85, 1], ease: "easeOut" }}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "3.5rem" }}>🎉</div>
        <div
          className="mt-1"
          style={{
            fontSize: "1.85rem",
            fontWeight: 700,
            color: COLORS.text,
            textShadow: "0 2px 12px rgba(255,255,255,0.9)",
          }}
        >
          {studentName} finished the day!
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
