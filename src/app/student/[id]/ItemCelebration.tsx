"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";

// Emoji instead of shipped image assets — no external file to source, host,
// or license, and it's already crisp at any size/theme. A fresh random pick
// every completion is the point (§6: "a different fun gif every time").
const CRITTERS = ["🐱", "🚀", "🦄", "🐝", "🦖", "🎈", "🌈", "⭐️", "🐬", "🦋", "🐙", "🍕", "🐸", "🎪"];
const SPARKLE = "✨";

const GLYPH_HALF = 26; // half the ~52px (3.25rem) glyph box, to center it on `origin`
const FLIGHT_DURATION = 1.7;
const FLIGHT_TIMES = [0, 0.15, 0.75, 1];
const SPARKLE_COUNT = 8;
const SPARKLE_STAGGER = 0.045; // seconds between each trailing sparkle's start

function randomFlight() {
  return {
    glyph: CRITTERS[Math.floor(Math.random() * CRITTERS.length)],
    drift: (Math.random() - 0.5) * 220, // px, horizontal wander while it rises
    spin: (Math.random() - 0.5) * 50, // deg
    sparkles: Array.from({ length: SPARKLE_COUNT }, () => ({
      dx: (Math.random() - 0.5) * 110, // px, scattered off the critter's own path
      dy: (Math.random() - 0.5) * 90,
      size: 1.3 + Math.random() * 1.3, // rem — each sparkle its own size, not a smooth taper
      spin: (Math.random() - 0.5) * 70, // deg, its own little twirl
    })),
  };
}

/** The per-completion "something REALLY fun" moment: launches from the
 * checked item itself and rises up and off the top of the screen — clear of
 * the day columns, like a released balloon, not a sweep back across the
 * grid the student is still reading, trailing a handful of sparkles behind
 * it. Different critter every time. Only fired for a genuine completion
 * (open -> done, not entering pendingReview — §5's "the reward lands only
 * when the work has been shown" still holds), and only when motion is
 * welcome; the caller skips mounting this under prefers-reduced-motion,
 * since the row's own crossfade already covers that case (§6 step 8). */
export function ItemCelebration({
  origin,
  onDone,
}: {
  origin: { x: number; y: number };
  onDone: () => void;
}) {
  const [{ glyph, drift, spin, sparkles }] = useState(randomFlight);

  useEffect(() => {
    // The last trailing sparkle starts at (SPARKLE_COUNT-1)*stagger and then
    // plays the full flight itself — the real end of the whole moment.
    const totalMs = (SPARKLE_STAGGER * (SPARKLE_COUNT - 1) + FLIGHT_DURATION) * 1000 + 150;
    const timeout = window.setTimeout(onDone, totalMs);
    return () => window.clearTimeout(timeout);
  }, [onDone]);

  // Every animated property is given the same number of keyframes as
  // `times` — mixing single-target props with keyframe-array props under
  // one shared `times` silently breaks the scalar ones (they never move),
  // so left/top/rotate get the full 4-stop treatment too, and the centering
  // offset is baked into left/top directly rather than layered on with a
  // separate x/y percentage transform. The trail reuses this exact path —
  // each sparkle just starts a little later, so it traces where the critter
  // already was, like a comet's tail.
  const left = [
    origin.x - GLYPH_HALF,
    origin.x - GLYPH_HALF,
    origin.x + drift * 0.5 - GLYPH_HALF,
    origin.x + drift - GLYPH_HALF,
  ];
  const top = [origin.y - GLYPH_HALF, origin.y - GLYPH_HALF - 10, -80, -160];

  // This component only ever mounts client-side, in response to a click
  // (§6's completion sequence) — never during SSR — so there's no
  // hydration-mismatch risk in reaching for `document.body` straight away.
  return createPortal(
    <>
      {sparkles.map((s, i) => {
        // i=0 trails closest to the critter (least delay); each step back
        // fades a little more than the last, so the trail reads as fading
        // into the distance — but gently, so the whole trail stays visible,
        // not just the first sparkle. Each sparkle also rides its own
        // scattered offset off the critter's exact path (not the path
        // itself), so the trail reads as a loose scatter of sparkle instead
        // of beads on a string, and pops bigger than its resting size
        // before shrinking and fading — a "twinkle," not a fade.
        const fade = 1 - i * 0.09;
        const sparkleLeft = left.map((v) => v + s.dx);
        const sparkleTop = top.map((v) => v + s.dy);
        return (
          <motion.div
            key={i}
            aria-hidden
            initial={{ left: sparkleLeft[0], top: sparkleTop[0], scale: 0, opacity: 0, rotate: 0 }}
            animate={{
              left: sparkleLeft,
              top: sparkleTop,
              scale: [0, 1.5, 0.6, 0],
              opacity: [0, fade, fade * 0.65, 0],
              rotate: [0, s.spin, s.spin, s.spin],
            }}
            transition={{
              duration: FLIGHT_DURATION,
              times: FLIGHT_TIMES,
              delay: SPARKLE_STAGGER * i,
              ease: "easeOut",
            }}
            style={{
              position: "fixed",
              fontSize: `${s.size}rem`,
              lineHeight: 1,
              pointerEvents: "none",
              zIndex: 9998,
              filter: "drop-shadow(0 0 6px rgba(255,205,60,0.75))",
            }}
          >
            {SPARKLE}
          </motion.div>
        );
      })}

      <motion.div
        aria-hidden
        initial={{ left: left[0], top: top[0], scale: 0.6, rotate: 0, opacity: 0 }}
        animate={{
          left,
          top,
          scale: [0.6, 1.15, 1, 0.9],
          rotate: [0, spin * 0.3, spin * 0.8, spin],
          opacity: [0, 1, 1, 0],
        }}
        transition={{ duration: FLIGHT_DURATION, times: FLIGHT_TIMES, ease: "easeOut" }}
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
      </motion.div>
    </>,
    document.body
  );
}
