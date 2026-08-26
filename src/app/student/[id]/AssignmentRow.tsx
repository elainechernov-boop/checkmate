"use client";

import { useState, type MouseEvent } from "react";
import { motion } from "framer-motion";
import { CreatedBy, InstanceStatus } from "@/generated/prisma/enums";
import { playCompletionTick } from "@/lib/completionSound";
import { formatComingUpDate, toISODate } from "@/lib/dates";
import { formatRollMark } from "@/lib/instanceGrouping";
import { formatScheduledTime, timeBadge, type TimeBadgeState } from "@/lib/reminders";
import { getSubjectColor } from "@/lib/subjectColors";
import { COLORS } from "@/lib/theme";
import { deleteProjectTaskAction, moveProjectTaskAction, unscheduleProjectTaskAction } from "./projectActions";
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

// The row's 3px identity bar (design tokens §"Spacing/shape") — a done row
// mutes to the hairline gray, a project task or self-typed item (no
// subject, since a project series never carries one — §3) takes the
// student's own accent, and everything else takes its subject's color.
function barColor(instance: StudentInstance, accentColor: string | undefined): string {
  if (isMutedLook(instance.status)) return COLORS.hairline;
  if (instance.project) return accentColor ?? COLORS.text;
  if (instance.subject) return getSubjectColor(instance.subject.name);
  return accentColor ?? COLORS.text;
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
  studentId,
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
  // second visual system").
  accentColor?: string;
  // Needed only for a student's own project task's inline controls (move /
  // unschedule / delete) inside the expand panel below.
  studentId: string;
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
  const isOwnProjectTask = instance.createdBy === CreatedBy.student;

  const estMinutes = instance.estimatedMinutes ?? instance.series?.estimatedMinutes ?? null;
  const badge: TimeBadgeState | null =
    instance.isTimeSensitive && instance.scheduledTime ? timeBadge(instance.scheduledTime, estMinutes, now) : null;
  const isCallout = badge === "live" || badge === "soon";
  const calloutColor = badge === "live" ? COLORS.crimson : COLORS.cobalt;

  // A time-sensitive item that isn't live/starting-soon right now (badge is
  // "later" or "past") still carries its clock time, folded into the same
  // meta text rather than a separate line (matches Canvas.dc.html's "· 30
  // min · Today at 3:30" rows) — but only while still open.
  const laterTimeChip =
    !isDone && (badge === "later" || badge === "past") && instance.scheduledTime
      ? `Today at ${formatScheduledTime(instance.scheduledTime)}`
      : null;

  // Subject + estimated time, small and quiet right after the title on the
  // same line (design tokens: "title + meta line" reads as one row) — more
  // useful to a kid than a color they'd have to memorize (the 3px bar above
  // now carries that signal instead). A project task shows its project's
  // name here instead, in the student's own accent color (§7) — never
  // both at once, since a project series never carries a subject (§3).
  const metaText = instance.project
    ? instance.project.name
    : [instance.subject?.name, estMinutes != null ? `${estMinutes} min` : null, laterTimeChip]
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
  const showFaded = animating ? targetFaded : currentFaded;
  const showWidth = animating ? targetWidth : currentWidth;

  // Live gets a slightly stronger tint than soon (10% vs 8% alpha in the
  // mockup) — the two states share a border treatment but not a fill.
  const calloutBackgroundAlpha = badge === "live" ? "1a" : "14";

  return (
    <div
      className="relative flex flex-col gap-1 rounded-sm py-1.5"
      style={{
        fontSize: "0.8125rem",
        borderBottom: isLast && !expanded ? undefined : `1px solid ${COLORS.hairline}`,
        // Design tokens: "1.5px top+bottom rule (not a rounded card) for
        // time-sensitive callouts" — crimson while live, cobalt while
        // starting soon; negative margins bleed the highlight to the day
        // column's own edges instead of just insetting within the row.
        ...(isCallout
          ? {
              background: `${calloutColor}${calloutBackgroundAlpha}`,
              borderTop: `1.5px solid ${calloutColor}`,
              borderBottom: `1.5px solid ${calloutColor}`,
              marginLeft: "-0.5rem",
              marginRight: "-0.5rem",
              marginTop: "0.25rem",
              marginBottom: "0.25rem",
              paddingLeft: "0.5rem",
              paddingRight: "0.5rem",
            }
          : undefined),
      }}
    >
      <div className="flex items-start gap-2">
        {/* The row's 3px identity bar (design tokens) — subject color, or
            the student's own accent for a project task / self-typed item. */}
        <span aria-hidden className="mt-0.5 shrink-0 self-stretch" style={{ width: 3, minHeight: "1.25rem", background: barColor(instance, accentColor) }} />

        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          {isCallout && (
            <span className="flex items-center gap-1.5">
              {badge === "live" && (
                <motion.span
                  aria-hidden
                  className="inline-block rounded-full"
                  style={{ width: 6, height: 6, background: calloutColor }}
                  animate={prefersReducedMotion ? undefined : { opacity: [1, 0.35, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
              <span
                className="font-bold uppercase"
                style={{ color: calloutColor, fontSize: "0.6rem", letterSpacing: "0.03em" }}
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
                  style={{ color: COLORS.crimson, fontSize: "0.7rem", fontWeight: 700 }}
                  title={`Rolled ${instance.rolledCount} day(s)`}
                >
                  {rollMark}
                </span>
              )}
            </button>

            {/* The meta line — click to expand a read-only (or, for a
                student's own project task, editable) details panel directly
                beneath the row. Never the title, which is the completion
                control. Always has *something* to click, even for a bare
                self-typed task with no subject/project. Hidden once a row is
                done, or while pending review (the "✋ Mom" flag takes its
                place) — the mockup's own completed rows show nothing but the
                struck-through title. */}
            {!isDone && !isPendingReview && (
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
                {metaText || "···"}
              </button>
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

      {expanded && (
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

          {isOwnProjectTask && instance.status === InstanceStatus.open && (
            <OwnTaskControls studentId={studentId} instance={instance} onDone={() => setExpanded(false)} />
          )}
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

/** The inline replacement for AssignmentDetailsModal's OwnTaskControls —
 * same three verbs (move / back to backlog / delete), same actions, just
 * rendered directly in the expand panel instead of a modal. */
function OwnTaskControls({
  studentId,
  instance,
  onDone,
}: {
  studentId: string;
  instance: StudentInstance;
  onDone: () => void;
}) {
  const [moveDate, setMoveDate] = useState(instance.dueDate ? toISODate(instance.dueDate) : "");
  const [pending, setPending] = useState(false);

  async function handleMove() {
    if (!moveDate) return;
    setPending(true);
    try {
      await moveProjectTaskAction(studentId, instance.id, moveDate);
      onDone();
    } finally {
      setPending(false);
    }
  }

  async function handleUnschedule() {
    setPending(true);
    try {
      await unscheduleProjectTaskAction(studentId, instance.id);
      onDone();
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${instance.title}"? This can't be undone.`)) return;
    setPending(true);
    try {
      await deleteProjectTaskAction(studentId, instance.id);
      onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-2">
      <input
        type="date"
        value={moveDate}
        onChange={(event) => setMoveDate(event.target.value)}
        className="border-b bg-transparent py-0.5 text-xs outline-none"
        style={{ borderColor: COLORS.hairline, color: COLORS.text }}
      />
      <button type="button" onClick={handleMove} disabled={pending} className="font-medium" style={{ color: COLORS.text }}>
        Move
      </button>
      {instance.dueDate && (
        <button type="button" onClick={handleUnschedule} disabled={pending} style={{ color: COLORS.muted }}>
          Move to backlog
        </button>
      )}
      <button type="button" onClick={handleDelete} disabled={pending} className="font-medium" style={{ color: COLORS.crimson }}>
        Delete
      </button>
    </div>
  );
}
