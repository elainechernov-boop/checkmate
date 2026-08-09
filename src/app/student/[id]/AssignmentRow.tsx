"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { AssignmentInstance } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { playCompletionTick } from "@/lib/completionSound";
import { formatRollMark } from "@/lib/instanceGrouping";
import { getSubjectColor } from "@/lib/subjectColors";
import { COLORS } from "@/lib/theme";

type InstanceWithSubject = AssignmentInstance & { subject: { id: string; name: string } | null };

function strikeWidthFor(status: InstanceStatus): number {
  if (status === InstanceStatus.done || status === InstanceStatus.excused) return 100;
  if (status === InstanceStatus.pendingReview) return 30;
  return 0;
}

// Only a full "done" (or excused) look mutes the title text — pendingReview
// shows its half-strike but stays normal-colored: §5 "no strikethrough yet."
function isMutedLook(status: InstanceStatus): boolean {
  return status === InstanceStatus.done || status === InstanceStatus.excused;
}

export function AssignmentRow({
  instance,
  interactive,
  prefersReducedMotion,
  onToggle,
}: {
  instance: InstanceWithSubject;
  interactive: boolean;
  prefersReducedMotion: boolean;
  onToggle: () => void;
}) {
  const [animating, setAnimating] = useState(false);

  const isForward = instance.status === InstanceStatus.open; // a click moves it forward
  const resultingStatus = isForward
    ? instance.requiresReview
      ? InstanceStatus.pendingReview
      : InstanceStatus.done
    : InstanceStatus.open;

  const currentWidth = strikeWidthFor(instance.status);
  const targetWidth = strikeWidthFor(resultingStatus);
  const currentMuted = isMutedLook(instance.status);
  const targetMuted = isMutedLook(resultingStatus);
  const duration = isForward && instance.requiresReview ? 0.15 : 0.28;

  const rollMark = formatRollMark(instance.rolledCount);
  const subjectColor = getSubjectColor(instance.subject?.name);
  const isPendingReview = instance.status === InstanceStatus.pendingReview;

  function handleClick() {
    if (!interactive || animating) return;
    if (isForward) playCompletionTick();
    setAnimating(true);

    const delay = prefersReducedMotion ? 150 : duration * 1000;
    // The real status flip (and the list reorder it triggers) happens once
    // the strike/half-strike finishes drawing — steps 1-3 first, step 4 after.
    window.setTimeout(() => {
      setAnimating(false);
      onToggle();
    }, delay);
  }

  const showMuted = animating ? targetMuted : currentMuted;
  const showWidth = animating ? targetWidth : currentWidth;

  return (
    <motion.div
      layout
      onClick={handleClick}
      className="relative flex items-baseline gap-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-black/[0.03]"
      style={{ cursor: interactive ? "pointer" : "default" }}
      initial={false}
      animate={
        prefersReducedMotion
          ? { opacity: animating ? [1, 0.4, 1] : 1 }
          : { scale: animating ? [1, 0.97, 1] : 1 }
      }
      transition={{ duration: prefersReducedMotion ? 0.15 : duration, ease: "easeOut" }}
    >
      <span
        aria-hidden
        className="mt-0.5 inline-block self-stretch"
        style={{ width: 2, background: subjectColor, flexShrink: 0 }}
      />

      <span className="relative inline-block">
        <motion.span
          initial={false}
          animate={{ color: showMuted ? COLORS.muted : COLORS.text }}
          transition={{ duration: prefersReducedMotion ? 0.15 : duration }}
        >
          {instance.title}
        </motion.span>

        {(currentWidth > 0 || targetWidth > 0) && (
          <motion.span
            aria-hidden
            initial={false}
            animate={{ width: `${showWidth}%` }}
            transition={{ duration: prefersReducedMotion ? 0 : duration, ease: "easeOut" }}
            style={{ position: "absolute", left: 0, top: "50%", height: 1, background: COLORS.text }}
          />
        )}
      </span>

      {rollMark && (
        <span style={{ color: COLORS.amber, fontSize: "0.7rem" }} title={`Rolled ${instance.rolledCount} day(s)`}>
          {rollMark}
        </span>
      )}

      {isPendingReview && <span style={{ color: COLORS.amber, fontSize: "0.75rem" }}>✋ Show Mom</span>}
    </motion.div>
  );
}
