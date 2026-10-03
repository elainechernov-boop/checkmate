"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { InstanceStatus } from "@/generated/prisma/enums";
import { playCompletionTick } from "@/lib/completionSound";
import { formatComingUpDate } from "@/lib/dates";
import { formatRollMark } from "@/lib/instanceGrouping";
import { formatScheduledTime, timeBadge, type TimeBadgeState } from "@/lib/reminders";
import { COLORS } from "@/lib/theme";
import { Modal } from "@/components/Modal";
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

function statusLabel(instance: StudentInstance, inProgress: boolean): string {
  if (instance.status === InstanceStatus.done) return "Done";
  if (instance.status === InstanceStatus.excused) return "Excused";
  if (instance.status === InstanceStatus.pendingReview) return "Waiting on Mom";
  if (inProgress) return "In progress";
  return instance.rolledCount > 0 ? `Rolled forward ${instance.rolledCount} day(s)` : "Not done yet";
}

/** §15 time tracking, as one row sees it. Present only when the family has
 * tracking on — its absence means every code path below behaves exactly as it
 * did before the feature existed. */
export interface RowTimeTracking {
  // The play triangle, or a tap on the title: open the timer and start the clock.
  onStart: () => void;
  // Open, with time already logged on it — the quiet "In progress" mark.
  inProgress: boolean;
  // Set by the week view when Finish was pressed on this row's timer: play
  // §6's completion sequence here, now that the timer screen has dismissed.
  finishToken: number | null;
}

export function AssignmentRow({
  instance,
  interactive,
  prefersReducedMotion,
  isLast,
  accentColor,
  now,
  timeTracking,
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
  timeTracking?: RowTimeTracking;
  onToggle: (origin: { x: number; y: number }) => void;
  onApproveViaPasscode?: (passcode: string, origin: { x: number; y: number }) => Promise<void>;
}) {
  const [animating, setAnimating] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [passcodeOpen, setPasscodeOpen] = useState(false);
  const [passcodeOrigin, setPasscodeOrigin] = useState<{ x: number; y: number } | null>(null);
  const [expanded, setExpanded] = useState(false);
  // The direction of the completion sequence now playing, latched when it
  // starts. A timer's Finish completes the item server-side while the strike is
  // still drawing; if a refresh lands that status mid-animation, deriving the
  // direction from instance.status would flip it and make the strike run
  // backwards. Latching keeps the sequence we started.
  const [latchedForward, setLatchedForward] = useState<boolean | null>(null);
  const titleButtonRef = useRef<HTMLButtonElement>(null);

  const tracked = timeTracking !== undefined;
  // Only an open row in today's column can be timed.
  const canTime = tracked && interactive && instance.status === InstanceStatus.open;
  const inProgress = Boolean(timeTracking?.inProgress);

  const statusIsForward = instance.status === InstanceStatus.open; // a click moves it forward
  const isForward = animating && latchedForward !== null ? latchedForward : statusIsForward;
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
  // §15: with tracking on, the line beneath the title carries "In progress"
  // too, and a tap on it opens the details popup (subject, estimate, notes,
  // due date, status).
  const trackedMetaLabel = [metaText, inProgress ? "In progress" : null].filter(Boolean).join(" · ");

  // The §6 completion sequence — tick, strike drawing left-to-right, the
  // scale pulse — ending in onToggle (which does the real status flip, the
  // critter, and the day-complete check). A title tap runs it directly; with
  // time tracking on, Finish on the timer screen runs it here once the screen
  // has dismissed.
  function runCompletionSequence(origin: { x: number; y: number }) {
    if (animating) return;
    if (statusIsForward) playCompletionTick();
    setLatchedForward(statusIsForward);
    setAnimating(true);
    setPulsing(true);
    window.setTimeout(() => setPulsing(false), prefersReducedMotion ? 150 : 220);

    const delay = prefersReducedMotion ? 150 : duration * 1000;
    // The real status flip (and the list reorder it triggers) happens once
    // the strike/half-strike finishes drawing — steps 1-3 first, step 4 after.
    window.setTimeout(() => {
      setAnimating(false);
      setLatchedForward(null);
      onToggle(origin);
    }, delay);
  }

  function handleTitleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!interactive || animating) return;
    // §15: with tracking on, tapping an open item's title opens the timer
    // (and starts the clock) instead of completing it — Finish completes it.
    // Done / pendingReview rows keep their one-tap undo / withdraw.
    if (canTime) {
      timeTracking?.onStart();
      return;
    }

    // Captured now, before the row reflows/reorders — the celebration (if
    // any) launches from where this row actually was, not wherever it ends
    // up after the list settles.
    const rect = event.currentTarget.getBoundingClientRect();
    runCompletionSequence({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }

  // Finish pressed on this row's timer screen. A token already present when
  // the row mounts isn't a new Finish — only a change is.
  const finishToken = timeTracking?.finishToken ?? null;
  const handledFinishTokenRef = useRef(finishToken);
  useEffect(() => {
    if (finishToken === null || finishToken === handledFinishTokenRef.current) return;
    handledFinishTokenRef.current = finishToken;
    // The week view renders every day twice — the desktop grid and the mobile
    // pager, one of them CSS-hidden — so the same task has two rows mounted at
    // once. Only the one actually on screen plays the sequence; a hidden copy
    // running it too would complete the task twice (the second call would
    // toggle it straight back to open).
    const title = titleButtonRef.current;
    if (!title || title.getClientRects().length === 0) return;
    const rect = title.getBoundingClientRect();
    runCompletionSequence({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    // runCompletionSequence reads the render's own state; only a new token should fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishToken]);

  const showMuted = animating ? targetMuted : currentMuted;
  const showFaded = animating ? targetFaded : currentFaded;
  const showWidth = animating ? targetWidth : currentWidth;

  // Live gets a slightly stronger tint than soon (10% vs 8% alpha in the
  // mockup) — the two states share a border treatment but not a fill.
  const calloutBackgroundAlpha = badge === "live" ? "1a" : "14";

  return (
    <div
      className={`relative flex flex-col gap-1 py-1.5${canTime ? " hr-timer-row" : ""}`}
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
        // §15: with tracking on the row runs edge to edge — the hover wash,
        // the hairline, and the right-hand gutter that keeps a long title
        // clear of the play triangle (reserved on open rows so nothing
        // reflows when it appears). Text stays aligned with the weekday
        // label above: the negative margin and the matching padding cancel.
        ...(tracked && !isCallout
          ? {
              marginLeft: "-0.75rem",
              marginRight: "-0.75rem",
              paddingLeft: "0.75rem",
              paddingRight: canTime ? "1.5rem" : "0.75rem",
            }
          : undefined),
        ...(tracked && isCallout && canTime ? { paddingRight: "1.5rem" } : undefined),
      }}
    >
      <div className="flex items-start" style={{ gap: 7 }}>
        {/* The row's 3px identity bar — never shown inside a live/soon
            callout band (Canvas.dc.html has no tick there at all; the band
            itself is the whole row's identity). Subject color, or the
            student's own accent for a project task / self-typed item. */}
        {/* §15: dropped while time tracking is on — finished rows are already
            muted and struck, and project tasks name their project in the
            student's accent on the line below. */}
        {!isCallout && !tracked && (
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
          <div
            className={
              tracked
                ? "flex w-full flex-col items-start gap-0.5"
                : "flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
            }
          >
            {/* No checkbox, no dot — the word itself is the completion
                control (TeuxDeux's model, §6 north star). Order is parent-set
                and locked (§14): no drag handle here at all. */}
            <button
              ref={titleButtonRef}
              type="button"
              onClick={handleTitleClick}
              disabled={!interactive}
              aria-label={
                isDone
                  ? "Mark as not done"
                  : isPendingReview
                    ? "Withdraw from Show Mom"
                    : canTime
                      ? "Start the timer"
                      : "Mark as done"
              }
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

            {/* Everything that sits beside the title in the classic layout —
                the clock time, the meta line, the Show Mom controls — moves
                to its own line beneath it when time tracking is on (§15:
                "the line beneath the title"). `contents` keeps the classic
                single wrapping line byte-for-byte otherwise. */}
            <div className={tracked ? "flex w-full flex-wrap items-center gap-x-1.5" : "contents"}>
            {laterTimeLabel && (
              <span
                className="shrink-0"
                style={{ color: COLORS.muted, fontWeight: 700, fontSize: "0.65625rem" }}
              >
                {laterTimeLabel}
              </span>
            )}

            {/* §15: the line beneath the title — subject and estimate (or the
                project's name), plus a quiet "In progress" once time is
                logged. A tap anywhere along it opens the details popup. */}
            {tracked && !isDone && !isPendingReview && (trackedMetaLabel || hasExpandableDetails) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setExpanded((current) => !current);
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                style={{
                  color: instance.project ? (accentColor ?? COLORS.mutedFaint) : COLORS.mutedFaint,
                  fontSize: "0.66rem",
                  paddingTop: 2,
                  paddingBottom: 3,
                }}
              >
                {inProgress && (
                  <span
                    aria-hidden
                    className="inline-block shrink-0 rounded-full"
                    style={{ width: 6, height: 6, background: accentColor ?? COLORS.cobalt }}
                  />
                )}
                <span style={{ textDecoration: "underline dotted", textUnderlineOffset: "2px" }}>
                  {trackedMetaLabel || "Details"}
                </span>
              </button>
            )}

            {/* The meta line — click to expand a read-only details panel
                directly beneath the row. Never the title, which is the
                completion control. Only clickable when expanding would
                actually reveal something new (details/due date) beyond what
                the meta line already shows inline — otherwise it's plain,
                non-interactive text (§5.4: a bare row with nothing to show
                must not look clickable). Hidden once a row is done, or while
                pending review (the "✋ Mom" flag takes its place). */}
            {!tracked && !isDone && !isPendingReview && hasExpandableDetails && (
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

            {!tracked && !isDone && !isPendingReview && !hasExpandableDetails && metaText && (
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

      {/* §15: the play triangle — no label, ~10px inside a ~28px tap target,
          vertically centered on the row in the gutter reserved above. Hidden
          until the row is hovered or focused on desktop (.hr-hover-action),
          always visible on touch. */}
      {canTime && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            timeTracking?.onStart();
          }}
          aria-label={`Start the timer for ${instance.title}`}
          className="hr-hover-action absolute flex items-center justify-center"
          style={{ right: -2, top: "50%", width: 28, height: 28, marginTop: -14 }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden>
            <polygon points="2,0 16,8 2,16" fill={COLORS.text} />
          </svg>
        </button>
      )}

      <Modal open={expanded && hasExpandableDetails} onClose={() => setExpanded(false)} title="Details">
        <div className="flex flex-col gap-1.5" style={{ fontSize: 12 }}>
          <p style={{ color: COLORS.text, fontWeight: 600 }}>{instance.title}</p>
          {instance.details && <p style={{ color: COLORS.muted }}>{instance.details}</p>}
          {tracked && instance.project && (
            <p style={{ color: COLORS.muted }}>
              Project: <span style={{ color: COLORS.text }}>{instance.project.name}</span>
            </p>
          )}
          {tracked && instance.subject && (
            <p style={{ color: COLORS.muted }}>
              Subject: <span style={{ color: COLORS.text }}>{instance.subject.name}</span>
            </p>
          )}
          {tracked && estMinutes != null && (
            <p style={{ color: COLORS.muted }}>
              Estimated: <span style={{ color: COLORS.text }}>{estMinutes} min</span>
            </p>
          )}
          {instance.dueDate && (
            <p style={{ color: COLORS.muted }}>
              Due: <span style={{ color: COLORS.text }}>{formatComingUpDate(instance.dueDate)}</span>
            </p>
          )}
          <p style={{ color: COLORS.muted }}>
            Status: <span style={{ color: COLORS.text }}>{statusLabel(instance, inProgress)}</span>
          </p>
        </div>
      </Modal>
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

