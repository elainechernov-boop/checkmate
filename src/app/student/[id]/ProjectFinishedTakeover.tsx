"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { COLORS } from "@/lib/theme";
import { CRITTERS, SPARKLE } from "@/lib/critters";

// A real "1000 critters" would be an easy way to make an old Mac chug for a
// project celebration that should feel effortless — 70 already reads as a
// flood filling the screen edge-to-edge, launched in a staggered wave
// rather than all at once so it keeps building instead of dumping in a
// single frame. One trailing sparkle each (not ItemCelebration's 8 — that's
// tuned for a single critter, this is tuned for dozens at once).
const SWARM_SIZE = 70;
const LAUNCH_WINDOW = 2.2; // seconds over which the swarm keeps launching
const FLIGHT_DURATION = 2;
const FLIGHT_TIMES = [0, 0.12, 0.7, 1];

function generateSwarm() {
  return Array.from({ length: SWARM_SIZE }, (_, i) => {
    const left = Math.random() * 100; // vw, launch position along the bottom
    const drift = (Math.random() - 0.5) * 30; // vw, horizontal wander while rising
    const spin = (Math.random() - 0.5) * 70; // deg
    const size = 2 + Math.random() * 1.7; // rem — varied so it doesn't read as a grid
    const sparkleDx = (Math.random() - 0.5) * 8; // vw, off the critter's own path
    const sparkleDy = (Math.random() - 0.5) * 8; // vh
    return {
      id: i,
      glyph: CRITTERS[Math.floor(Math.random() * CRITTERS.length)],
      left,
      drift,
      spin,
      size,
      sparkleDx,
      sparkleDy,
      // Spread across the launch window, not just randomized — keeps a
      // steady stream of new arrivals instead of clumping by chance.
      delay: (i / SWARM_SIZE) * LAUNCH_WINDOW + Math.random() * 0.15,
    };
  });
}

/** §7's project-completion moment, given real weight instead of a quiet
 * strike-and-settle: a full-screen flood of critters, triggered by the
 * student's own "Project finished!" button in ProjectDetailsModal (not
 * fired automatically the instant the last task is checked — the button is
 * the "I'm ready to celebrate" beat). Mirrors DayCompleteTakeover's
 * structure (dim, portal, prefers-reduced-motion fallback) but with a
 * rising swarm in place of falling confetti rectangles. */
export function ProjectFinishedTakeover({
  projectName,
  reducedMotion,
  onDone,
}: {
  projectName: string;
  reducedMotion: boolean;
  onDone: () => void;
}) {
  const [swarm] = useState(generateSwarm);

  useEffect(() => {
    const totalMs = reducedMotion ? 1200 : (LAUNCH_WINDOW + FLIGHT_DURATION) * 1000 + 300;
    const timeout = window.setTimeout(onDone, totalMs);
    return () => window.clearTimeout(timeout);
  }, [onDone, reducedMotion]);

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
        <span style={{ fontSize: "1.5rem", fontWeight: 600, color: COLORS.text, textAlign: "center" }}>
          {projectName} finished! 🎉
        </span>
      </motion.div>,
      document.body
    );
  }

  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0.9, 0] }}
        transition={{ duration: LAUNCH_WINDOW + FLIGHT_DURATION, times: [0, 0.1, 0.85, 1], ease: "easeInOut" }}
        style={{ position: "absolute", inset: 0, background: COLORS.background }}
      />

      {swarm.map((c) => {
        const left = [`${c.left}vw`, `${c.left}vw`, `${c.left + c.drift * 0.5}vw`, `${c.left + c.drift}vw`];
        const top = ["108vh", "108vh", "35vh", "-20vh"];
        const sparkleLeft = left.map((v) => `calc(${v} + ${c.sparkleDx}vw)`);
        const sparkleTop = top.map((v) => `calc(${v} + ${c.sparkleDy}vh)`);

        return (
          <span key={c.id}>
            <motion.span
              initial={{ left: sparkleLeft[0], top: sparkleTop[0], scale: 0, opacity: 0 }}
              animate={{ left: sparkleLeft, top: sparkleTop, scale: [0, 1.4, 0.5, 0], opacity: [0, 0.9, 0.6, 0] }}
              transition={{ duration: FLIGHT_DURATION, times: FLIGHT_TIMES, delay: c.delay, ease: "easeOut" }}
              style={{
                position: "fixed",
                fontSize: "1.1rem",
                lineHeight: 1,
                zIndex: 9998,
                filter: "drop-shadow(0 0 6px rgba(255,205,60,0.75))",
              }}
            >
              {SPARKLE}
            </motion.span>
            <motion.span
              initial={{ left: left[0], top: top[0], opacity: 0, rotate: 0, scale: 0.7 }}
              animate={{
                left,
                top,
                opacity: [0, 1, 1, 0],
                rotate: [0, c.spin * 0.3, c.spin * 0.7, c.spin],
                scale: [0.7, 1, 1, 0.85],
              }}
              transition={{ duration: FLIGHT_DURATION, times: FLIGHT_TIMES, delay: c.delay, ease: "easeOut" }}
              style={{
                position: "fixed",
                fontSize: `${c.size}rem`,
                lineHeight: 1,
                zIndex: 9999,
              }}
            >
              {c.glyph}
            </motion.span>
          </span>
        );
      })}

      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: [0.4, 1.15, 1, 1, 0.9], opacity: [0, 1, 1, 1, 0] }}
        transition={{
          duration: LAUNCH_WINDOW + FLIGHT_DURATION,
          times: [0, 0.1, 0.18, 0.85, 1],
          ease: "easeOut",
        }}
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
        }}
      >
        <div>
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
            {projectName} finished!
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
