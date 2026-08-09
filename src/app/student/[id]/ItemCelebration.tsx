"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

// Emoji instead of shipped image assets — no external file to source, host,
// or license, and it's already crisp at any size/theme. A fresh random pick
// every completion is the point (§6: "a different fun gif every time").
const CRITTERS = ["🐱", "🚀", "🦄", "🐝", "🦖", "🎈", "🌈", "⭐️", "🐬", "🦋", "🐙", "🍕", "🐸", "🎪"];

function randomFlight() {
  return {
    glyph: CRITTERS[Math.floor(Math.random() * CRITTERS.length)],
    fromLeft: Math.random() < 0.5,
    lane: 25 + Math.random() * 45, // vertical position, vh
    wobble: 6 + Math.random() * 8, // vh
  };
}

/** The per-completion "something REALLY fun" moment: a critter flies clean
 * across the whole screen, different every time. Only fired for a genuine
 * completion (open -> done, not entering pendingReview — §5's "the reward
 * lands only when the work has been shown" still holds), and only when
 * motion is welcome; the caller skips mounting this under
 * prefers-reduced-motion, since the row's own crossfade already covers
 * that case (§6 step 7). */
export function ItemCelebration({ onDone }: { onDone: () => void }) {
  const [{ glyph, fromLeft, lane, wobble }] = useState(randomFlight);

  useEffect(() => {
    const timeout = window.setTimeout(onDone, 1150);
    return () => window.clearTimeout(timeout);
  }, [onDone]);

  // This component only ever mounts client-side, in response to a click
  // (§6's completion sequence) — never during SSR — so there's no
  // hydration-mismatch risk in reaching for `document.body` straight away.
  return createPortal(
    <motion.div
      aria-hidden
      initial={{
        left: fromLeft ? "-12vw" : "108vw",
        top: `${lane}vh`,
        rotate: fromLeft ? -12 : 12,
        opacity: 0,
      }}
      animate={{
        left: fromLeft ? "108vw" : "-12vw",
        top: [`${lane}vh`, `${lane - wobble}vh`, `${lane}vh`, `${lane + wobble}vh`, `${lane}vh`],
        rotate: fromLeft ? 12 : -12,
        opacity: [0, 1, 1, 1, 0],
      }}
      transition={{ duration: 1.05, ease: "easeInOut" }}
      style={{
        position: "fixed",
        fontSize: "3.25rem",
        lineHeight: 1,
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform",
      }}
    >
      {glyph}
    </motion.div>,
    document.body
  );
}
