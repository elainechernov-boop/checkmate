"use client";

import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { InstanceStatus } from "@/generated/prisma/enums";
import { playCompletionTick } from "@/lib/completionSound";
import { formatRollMark } from "@/lib/instanceGrouping";
import { COLORS } from "@/lib/theme";
import { ApprovalPasscodePopover } from "./ApprovalPasscodePopover";
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

export function AssignmentRow({
  instance,
  interactive,
  prefersReducedMotion,
  onToggle,
  onOpenDetails,
  onApproveViaPasscode,
}: {
  instance: StudentInstance;
  interactive: boolean;
  prefersReducedMotion: boolean;
  onToggle: (origin: { x: number; y: number }) => void;
  onOpenDetails: () => void;
  onApproveViaPasscode?: (passcode: string, origin: { x: number; y: number }) => Promise<void>;
}) {
  const [animating, setAnimating] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeOrigin, setPasscodeOrigin] = useState<{ x: number; y: number } | null>(null);

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
  const isPendingReview = instance.status === InstanceStatus.pendingReview;
  const isDone = instance.status === InstanceStatus.done || instance.status === InstanceStatus.excused;

  // Subject + estimated time, small and quiet underneath the title — more
  // useful to a kid than a color they'd have to memorize (§9 tried a
  // subject-colored tick; a name reads instantly, a color doesn't).
  const estMinutes = instance.series?.estimatedMinutes ?? null;
  const metaText = [instance.subject?.name, estMinutes != null ? `${estMinutes} min` : null]
    .filter(Boolean)
    .join(" · ");

  function handleTitleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!interactive || animating) return;
    if (isForward) playCompletionTick();
    setAnimating(true);
    setPulsing(true);
    window.setTimeout(() => setPulsing(false), prefersReducedMotion ? 150 : 220);

    // Captured now, before the row reflows/reorders — the celebration (if
    // any) launches from where this row actually was, not wherever it ends
    // up after the list settles.
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };

    const delay = prefersReducedMotion ? 150 : duration * 1000;
    // The real status flip (and the list reorder it triggers) happens once
    // the strike/half-strike finishes drawing — steps 1-3 first, step 4 after.
    window.setTimeout(() => {
      setAnimating(false);
      onToggle(origin);
    }, delay);
  }

  const showMuted = animating ? targetMuted : currentMuted;
  const showWidth = animating ? targetWidth : currentWidth;

  return (
    <div className="relative flex items-center gap-2 rounded py-1.5 text-sm">
      {/* No checkbox, no dot, no drag handle — the word itself is the
          completion control (TeuxDeux's model, §6 north star), and the
          whole row is now the drag target (dnd-kit listeners live on
          DayColumn's SortableRow wrapper). Rows line up flush with the day
          label above them. */}
      <button
        type="button"
        onClick={handleTitleClick}
        disabled={!interactive}
        aria-label={isDone ? "Mark as not done" : isPendingReview ? "Withdraw from Show Mom" : "Mark as done"}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
        style={{ cursor: interactive ? "pointer" : "default" }}
      >
        <span className="flex items-center gap-2">
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
        </span>

        {metaText && (
          <span className="whitespace-nowrap" style={{ color: COLORS.mutedFaint, fontSize: "0.7rem" }}>
            {metaText}
          </span>
        )}

        {isPendingReview && (
          <span className="whitespace-nowrap" style={{ color: COLORS.amber, fontSize: "0.7rem" }}>
            ✋ Show Mom
          </span>
        )}

        {/* §5 step 4: a returned item's note lives beneath the title until
            the student completes it again. */}
        {instance.returnNote && (
          <span className="whitespace-nowrap" style={{ color: COLORS.muted, fontSize: "0.7rem" }}>
            {instance.returnNote}
          </span>
        )}
      </button>

      {isPendingReview && onApproveViaPasscode && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            setPasscodeOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            setPasscodeOpen(true);
          }}
          aria-label="Approve with parent passcode"
          className="shrink-0 text-xs"
          style={{ color: COLORS.muted }}
        >
          🔑
        </button>
      )}

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenDetails();
        }}
        aria-label="View assignment details"
        className="flex shrink-0 items-center rounded px-2 py-1 text-lg leading-none"
        style={{ color: COLORS.muted }}
      >
        →
      </button>

      {isPendingReview && onApproveViaPasscode && (
        <ApprovalPasscodePopover
          open={passcodeOpen}
          onClose={() => setPasscodeOpen(false)}
          prefersReducedMotion={prefersReducedMotion}
          onSubmit={(passcode) => onApproveViaPasscode(passcode, passcodeOrigin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 })}
        />
      )}
    </div>
  );
}
