"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function generateParticles() {
  const count = 12 + Math.floor(Math.random() * 5);
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
    const distance = 16 + Math.random() * 16;
    return {
      id: i,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 8,
      rotate: (Math.random() - 0.5) * 200,
      size: 3 + Math.random() * 3,
    };
  });
}

/** §6 step 5: 12-16 particles, ~700ms, once. Step 7: reduced motion gets a
 * simple crossfade instead. */
export function ConfettiBurst({
  color,
  reducedMotion,
  onDone,
}: {
  color: string;
  reducedMotion: boolean;
  onDone: () => void;
}) {
  // A lazy useState initializer (not useMemo) is the sanctioned place for
  // one-time non-deterministic setup — it runs exactly once, unlike a
  // memoized render-time computation.
  const [particles] = useState(generateParticles);

  useEffect(() => {
    const timeout = window.setTimeout(onDone, reducedMotion ? 200 : 700);
    return () => window.clearTimeout(timeout);
  }, [onDone, reducedMotion]);

  if (reducedMotion) {
    return (
      <motion.span
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.2 }}
        style={{ position: "absolute", inset: -4, background: color, opacity: 0.15, borderRadius: 4 }}
      />
    );
  }

  return (
    <span aria-hidden style={{ position: "absolute", right: 2, top: "50%", width: 0, height: 0 }}>
      {particles.map((particle) => (
        <motion.span
          key={particle.id}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: particle.dx, y: particle.dy, opacity: 0, rotate: particle.rotate }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{
            position: "absolute",
            width: particle.size,
            height: particle.size,
            background: color,
            borderRadius: 1,
          }}
        />
      ))}
    </span>
  );
}
