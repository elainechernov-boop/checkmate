"use client";

import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { InstanceStatus } from "@/generated/prisma/enums";
import { playCompletionTick } from "@/lib/completionSound";
import { formatRollMark } from "@/lib/instanceGrouping";
import { getSubjectColor } from "@/lib/subjectColors";
import { COLORS } from "@/lib/theme";
import type { StudentInstance } from "./types";

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

// Drag listeners for the handle glyph — kept loose (not dnd-kit's exact
// types) so this file doesn't need to import dnd-kit just for a prop shape.
interface DragHandleProps {
  attributes: object;
  listeners: object | undefined;
}

export function AssignmentRow({
  instance,
  interactive,
  prefersReducedMotion,
  dragHandleProps,
  onToggle,
  onOpenDetails,
}: {
  instance: StudentInstance;
  interactive: boolean;
  prefersReducedMotion: boolean;
  dragHandleProps?: DragHandleProps;
  onToggle: () => void;
  onOpenDetails: () => void;
}) {
  const [animating, setAnimating] = useState(false);
  const [pulsing, setPulsing] = useState(false);

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
  const isDone = instance.status === InstanceStatus.done || instance.status === InstanceStatus.excused;

  function handleTitleClick(event: MouseEvent) {
    event.stopPropagation();
    if (!interactive || animating) return;
    if (isForward) playCompletionTick();
    setAnimating(true);
    setPulsing(true);
    window.setTimeout(() => setPulsing(false), prefersReducedMotion ? 150 : 220);

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
    <div className="relative flex items-center gap-2 rounded px-1 py-1.5 text-sm">
      {dragHandleProps ? (
        <span
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
          aria-label="Drag to reorder"
          className="shrink-0 cursor-grab select-none touch-none active:cursor-grabbing"
          style={{ color: COLORS.mutedFaint, fontSize: "0.9rem", lineHeight: 1 }}
        >
          ⠿
        </span>
      ) : (
        <span className="w-3 shrink-0" aria-hidden />
      )}

      {/* No checkbox — the word itself is the completion control (TeuxDeux's
          model, §6 north star). A small subject-colored tick sits in front
          for a quiet at-a-glance read; the arrow is the only other target,
          opening read-only details. */}
      <button
        type="button"
        onClick={handleTitleClick}
        disabled={!interactive}
        aria-label={isDone ? "Mark as not done" : isPendingReview ? "Withdraw from Show Mom" : "Mark as done"}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        style={{ cursor: interactive ? "pointer" : "default" }}
      >
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: isPendingReview ? COLORS.amber : subjectColor }}
        />

        <motion.span
          className="relative inline-block"
          animate={
            pulsing
              ? prefersReducedMotion
                ? { opacity: [1, 0.6, 1] }
                : { scale: [1, 1.03, 1] }
              : { scale: 1, opacity: 1 }
          }
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.22, ease: "easeOut" }}
          style={{ transformOrigin: "left center" }}
        >
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
        </motion.span>

        {rollMark && (
          <span style={{ color: COLORS.amber, fontSize: "0.7rem" }} title={`Rolled ${instance.rolledCount} day(s)`}>
            {rollMark}
          </span>
        )}

        {isPendingReview && <span style={{ color: COLORS.amber, fontSize: "0.75rem" }}>✋ Show Mom</span>}
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetails();
        }}
        aria-label="View assignment details"
        className="shrink-0 rounded px-1.5 py-0.5 text-base leading-none"
        style={{ color: COLORS.mutedFaint }}
      >
        ›
      </button>
    </div>
  );
}

export type { DragHandleProps };
