"use client";

import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { InstanceStatus } from "@/generated/prisma/enums";
import { playCompletionTick } from "@/lib/completionSound";
import { formatComingUpDate } from "@/lib/dates";
import { formatRollMark } from "@/lib/instanceGrouping";
import { formatScheduledTime, timeBadge, type TimeBadgeState } from "@/lib/reminders";
import { COLORS } from "@/lib/theme";
import { ApprovalPasscodePopover } from "./ApprovalPasscodePopover";
import type { StudentInstance } from "./types";

function strikeWidthFor(status: InstanceStatus): number {
  // pendingReview no longer draws any strike at all (§5 "no strikethrough
  // yet") — it gets a quiet fade instead (isFadedLook below), not a
  // half-drawn line. Only a genuine "done" (or excused) is ever struck.
  if (status === InstanceStatus.done || status === InstanceStatus.excused) return 100;
  return 0;
}

// Only a full "done" (or excused) look mutes the title text to full gray.
function isMutedLook(status: InstanceStatus): boolean {
  return status === InstanceStatus.done || status === InstanceStatus.excused;
}

// pendingReview gets a slight fade instead of the old half-strike — "held,
// waiting" rather than "half finished."
function isFadedLook(status: InstanceStatus): boolean {
  return status === InstanceStatus.pendingReview;
}

// The row's 3px identity bar (BUILD_SPEC.md Part I §1 exact algorithm): a
// done/excused row mutes to the hairline gray, a project task takes the
// student's own accent, a subject-less historical student-authored item
// also takes the student's own accent, and everything else — ordinary
// parent-assigned work — is plain ink. Subject is never a color.
function barColor(instance: StudentInstance, accentColor: string | undefined): string {
  if (isMutedLook(instance.status)) return COLORS.hairline;
  if (instance.project) return accentColor ?? COLORS.text;
  if (!instance.subject) return accentColor ?? COLORS.text;
  return COLORS.text;
}

function statusLabel(instance: StudentInstance): string {
  if (instance.status === InstanceStatus.done) return "Done";
  if (instance.status === InstanceStatus.excused) return "Excused";
  if (instance.status === InstanceStatus.pendingReview) return "Waiting on Mom";
  return instance.rolledCount > 0 ? `Rolled forward ${instance.rolledCount} day(s)` : "Not done yet";
}

export function AssignmentRow({
  instance,
  interactive,
  prefersReducedMotion,
  isLast,
  accentColor,
  now,
  onToggle,
  onApproveViaPasscode,
}: {
  instance: StudentInstance;
  interactive: boolean;
  prefersReducedMotion: boolean;
  isLast: boolean;
  // The owning student's accent color — used for a project task's name line
  // in place of the subject/time line (§7: "theirs at a glance, without a
  // second visual system"), and for the "starts soon" callout (§5.4: soon
  // uses the student's own accent, not a fixed color; live stays crimson).
  accentColor?: string;
  // Wall-clock time for the live/soon/later/past callout below — passed
  // down from StudentWeekView's own 20s-refreshed `now` state rather than
  // read directly, so every row in the column recomputes together.
  now: Date;
  onToggle: (origin: { x: number; y: number }) => void;
  onApproveViaPasscode?: (passcode: string, origin: { x: number; y: number }) => Promise<void>;
}) {
  const [animating, setAnimating] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeOrigin, setPasscodeOrigin] = useState<{ x: number; y: number } | null>(null);
  const [expanded, setExpanded] = useState(false);

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
  const currentFaded = isFadedLook(instance.status);
  const targetFaded = isFadedLook(resultingStatus);
  const duration = isForward && instance.requiresReview ? 0.15 : 0.28;

  const rollMark = formatRollMark(instance.rolledCount);
  const isPendingReview = instance.status === InstanceStatus.pendingReview;
  const isDone = instance.status === InstanceStatus.done || instance.status === InstanceStatus.excused;

  const estMinutes = instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? null;
  const badge: TimeBadgeState | null =
    instance.isTimeSensitive && instance.scheduledTime ? timeBadge(instance.scheduledTime, estMinutes, now) : null;
  const isCallout = badge === "live" || badge === "soon";
  // §5.4: live is always crimson (the one fixed, semantic attention color);
  // "starts soon" takes the student's own accent instead of a fixed cobalt.
  const calloutColor = badge === "live" ? COLORS.crimson : (accentColor ?? COLORS.cobalt);

  // A time-sensitive item that isn't live/starting-soon right now (badge is
  // "later" or "past") still carries its clock time, shown quietly right
  // next to the title — §5.4: "a later scheduled time is quiet metadata,
  // not a crimson alert," and a past time that's still open stays ordinary
  // too, never a stale alert color. Only shown while still open.
  const laterTimeLabel =
    !isDone && (badge === "later" || badge === "past") && instance.scheduledTime
      ? formatScheduledTime(instance.scheduledTime)
      : null;

  // Subject + estimated time, small and quiet right after the title on the
  // same line (design tokens: "title + meta line" reads as one row) — more
  // useful to a kid than a color they'd have to memorize (the 3px bar above
  // now carries that signal instead). A project task shows its project's
  // name here instead, in the student's own accent color (§7) — never
  // both at once, since a project series never carries a subject (§3).
  const metaText = instance.project
    ? instance.project.name
    : [instance.subject?.name, estMinutes != null ? `${estMinutes} min` : null].filter(Boolean).join(" · ");

  // §5.4: "Do not render a meaningless `Status: Not done yet` block as the
  // only content for a bare row; if there is no useful detail, metadata
  // should not appear clickable." Details/due date are the only two facts
  // the expand panel adds beyond what the meta line already shows inline.
  const hasExpandableDetails = Boolean(instance.details) || Boolean(instance.dueDate);

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
  const showFaded = animating ? targetFaded : currentFaded;
  const showWidth = animating ? targetWidth : currentWidth;

  // Live gets a slightly stronger tint than soon (10% vs 8% alpha in the
  // mockup) — the two states share a border treatment but not a fill.
  const calloutBackgroundAlpha = badge === "live" ? "1a" : "14";

  return (
    <div
      className="relative flex flex-col gap-1 py-1.5"
      style={{
        fontSize: "0.8125rem",
        lineHeight: 1.35,
        borderBottom: isLast && !expanded ? undefined : `1px solid ${COLORS.hairline}`,
        // Canvas.dc.html ground truth for the live/soon callout band: a
        // square, edge-to-edge 1.5px top+bottom rule (crimson while live,
        // cobalt while starting soon) — never a rounded card. The negative
        // margins bleed the tint out to the day column's own 12px padding
        // (DayColumn.tsx) so the band spans the same width the column's
        // hairline does, and the matching positive padding keeps the text
        // aligned with every ordinary row above/below it.
        ...(isCallout
          ? {
              background: `${calloutColor}${calloutBackgroundAlpha}`,
              borderTop: `1.5px solid ${calloutColor}`,
              borderBottom: `1.5px solid ${calloutColor}`,
              marginLeft: "-0.75rem",
              marginRight: "-0.75rem",
              marginTop: "6px",
              marginBottom: "6px",
              paddingLeft: "0.75rem",
              paddingRight: "0.75rem",
              paddingTop: "7px",
              paddingBottom: "7px",
            }
          : undefined),
      }}
    >
      <div className="flex items-start" style={{ gap: 7 }}>
        {/* The row's 3px identity bar — never shown inside a live/soon
            callout band (Canvas.dc.html has no tick there at all; the band
            itself is the whole row's identity). Subject color, or the
            student's own accent for a project task / self-typed item. */}
        {!isCallout && (
          <span aria-hidden className="mt-0.5 shrink-0 self-stretch" style={{ width: 3, minHeight: 22, background: barColor(instance, accentColor) }} />
        )}

        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          {isCallout && (
            <span className="flex items-center gap-2">
              {badge === "live" && (
                <motion.span
                  aria-hidden
                  className="inline-block shrink-0 rounded-full"
                  style={{ width: 6, height: 6, background: calloutColor }}
                  animate={prefersReducedMotion ? undefined : { opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <span
                className="font-bold uppercase"
                style={{ color: calloutColor, fontSize: "10px", letterSpacing: "0.03em" }}
              >
                {badge === "live" ? "Live now" : `Starts in ${minutesUntil(instance.scheduledTime!, now)} min`}
              </span>
            </span>
          )}

          {/* Title + meta read as one line (design tokens: "title · Subject
              · Nmin" inline, not stacked) — two separate buttons (title
              completes, meta expands) laid out in a wrapping flex row so
              they sit on the same visual line whenever there's room, same
              as Canvas.dc.html's rows. */}
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            {/* No checkbox, no dot, no drag handle — the word itself is the
                completion control (TeuxDeux's model, §6 north star), and the
                whole row is now the drag target (dnd-kit listeners live on
                DayColumn's SortableRow wrapper). */}
            <button
              type="button"
              onClick={handleTitleClick}
              disabled={!interactive}
              aria-label={isDone ? "Mark as not done" : isPendingReview ? "Withdraw from Show Mom" : "Mark as done"}
              className="inline-flex min-w-0 items-start gap-1.5 text-left"
              style={{ cursor: interactive ? "pointer" : "default" }}
            >
              <motion.span
                className="relative min-w-0 break-words"
                animate={
                  pulsing
                    ? prefersReducedMotion
                      ? { opacity: [1, 0.6, 1] }
                      : { scale: [1, 1.03, 1] }
                    : { scale: 1, opacity: showFaded ? 0.6 : 1 }
                }
                transition={{ duration: prefersReducedMotion ? 0.15 : 0.22, ease: "easeOut" }}
                style={{ transformOrigin: "left center" }}
              >
                {/* The strike used to be a single width-animated line pinned
                    to mid-height, which only read correctly on one line;
                    it's now a transparent duplicate of the title with a
                    native line-through decoration (so it wraps and
                    underlines identically, line for line) revealed
                    left-to-right via an animated clip-path instead. */}
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
                    animate={{ clipPath: `inset(0 ${100 - showWidth}% 0 0)` }}
                    transition={{ duration: prefersReducedMotion ? 0 : duration, ease: "easeOut" }}
                    className="absolute inset-0"
                    style={{
                      color: "transparent",
                      textDecorationLine: "line-through",
                      textDecorationColor: COLORS.text,
                      textDecorationThickness: "1.5px",
                    }}
                  >
                    {instance.title}
                  </motion.span>
                )}
              </motion.span>

              {rollMark && (
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: COLORS.crimson, fontSize: "0.65625rem", fontWeight: 700 }}
                  title={`Rolled ${instance.rolledCount} day(s)`}
                >
                  {rollMark}
                </span>
              )}
            </button>

            {laterTimeLabel && (
              <span
                className="shrink-0"
                style={{ color: COLORS.muted, fontWeight: 700, fontSize: "0.65625rem" }}
              >
                {laterTimeLabel}
              </span>
            )}

            {/* The meta line — click to expand a read-only details panel
                directly beneath the row. Never the title, which is the
                completion control. Only clickable when expanding would
                actually reveal something new (details/due date) beyond what
                the meta line already shows inline — otherwise it's plain,
                non-interactive text (§5.4: a bare row with nothing to show
                must not look clickable). Hidden once a row is done, or while
                pending review (the "✋ Mom" flag takes its place). */}
            {!isDone && !isPendingReview && hasExpandableDetails && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((current) => !current);
                }}
                className="shrink-0 whitespace-nowrap"
                style={{
                  color: instance.project ? (accentColor ?? COLORS.mutedFaint) : COLORS.mutedFaint,
                  fontSize: "0.66rem",
                  textDecoration: "underline dotted",
                  textUnderlineOffset: "2px",
                }}
              >
                {metaText || "Details"}
              </button>
            )}

            {!isDone && !isPendingReview && !hasExpandableDetails && metaText && (
              <span
                className="shrink-0 whitespace-nowrap"
                style={{ color: instance.project ? (accentColor ?? COLORS.mutedFaint) : COLORS.mutedFaint, fontSize: "0.66rem" }}
              >
                {metaText}
              </span>
            )}

            {isPendingReview && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((current) => !current);
                }}
                className="shrink-0 whitespace-nowrap"
                style={{ color: COLORS.crimson, fontSize: "0.66rem", fontWeight: 700 }}
              >
                ✋ Mom
              </button>
            )}

            {isPendingReview && onApproveViaPasscode && (
              <span className="relative shrink-0">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    const rect = event.currentTarget.getBoundingClientRect();
                    setPasscodeOrigin({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
                    setPasscodeOpen((current) => !current);
                  }}
                  aria-label="Approve with parent passcode"
                  style={{ color: COLORS.crimson, fontSize: "0.66rem", fontWeight: 700 }}
                >
                  🔑
                </button>
                {passcodeOpen && (
                  <ApprovalPasscodePopover
                    onClose={() => setPasscodeOpen(false)}
                    prefersReducedMotion={prefersReducedMotion}
                    onSubmit={(passcode) =>
                      onApproveViaPasscode(passcode, passcodeOrigin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 })
                    }
                  />
                )}
              </span>
            )}
          </div>

          {/* §5 step 4: a returned item's note lives beneath the title until
              the student completes it again. */}
          {instance.returnNote && (
            <span className="whitespace-nowrap" style={{ color: COLORS.muted, fontSize: "0.7rem" }}>
              {instance.returnNote}
            </span>
          )}
        </div>
      </div>

      {expanded && hasExpandableDetails && (
        <div className="ml-[11px] flex flex-col gap-1.5 border-t pt-1.5 text-xs" style={{ borderColor: COLORS.hairline }}>
          {instance.details && <p style={{ color: COLORS.muted }}>{instance.details}</p>}
          {instance.dueDate && (
            <p style={{ color: COLORS.muted }}>
              Due: <span style={{ color: COLORS.text }}>{formatComingUpDate(instance.dueDate)}</span>
            </p>
          )}
          <p style={{ color: COLORS.muted }}>
            Status: <span style={{ color: COLORS.text }}>{statusLabel(instance)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// "Starts in N min" — whole minutes remaining until scheduledTime, floored
// so the label never rounds up past when the live-now state actually kicks
// in (a badge of "soon" already guarantees this is >= 0 and <= 60).
function minutesUntil(scheduledTime: string, now: Date): number {
  const match = /^(\d{2}):(\d{2})$/.exec(scheduledTime);
  if (!match) return 0;
  const scheduled = new Date(now);
  scheduled.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return Math.max(0, Math.round((scheduled.getTime() - now.getTime()) / 60_000));
}

