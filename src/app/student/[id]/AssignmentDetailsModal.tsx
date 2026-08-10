"use client";

import { useState } from "react";
import { CreatedBy, InstanceStatus } from "@/generated/prisma/enums";
import { toISODate, formatComingUpDate } from "@/lib/dates";
import { getSubjectColor } from "@/lib/subjectColors";
import { COLORS } from "@/lib/theme";
import { Modal } from "@/components/Modal";
import { deleteProjectTaskAction, moveProjectTaskAction, unscheduleProjectTaskAction } from "./projectActions";
import type { StudentInstance } from "./types";

function statusLabel(instance: StudentInstance): string {
  if (instance.status === InstanceStatus.done) return "Done";
  if (instance.status === InstanceStatus.excused) return "Excused";
  if (instance.status === InstanceStatus.pendingReview) return "Waiting on Mom";
  return instance.rolledCount > 0 ? `Rolled forward ${instance.rolledCount} day(s)` : "Not done yet";
}

/**
 * Read-only for parent-assigned work — untouchable by students (§2), purely
 * "what is this, and what does it need" (§9's ask: notes, subject,
 * estimated time). A student's own project task (§7) gets real controls
 * here instead: move to another day, back to the backlog, or delete —
 * dragging only covers backlog -> day (see ProjectsBand/DayColumn); moving
 * an already-scheduled task or unscheduling it goes through this modal.
 */
export function AssignmentDetailsModal({
  studentId,
  instance,
  onClose,
  prefersReducedMotion,
}: {
  studentId: string;
  instance: StudentInstance | null;
  onClose: () => void;
  prefersReducedMotion: boolean;
}) {
  const isOwnProjectTask = instance?.createdBy === CreatedBy.student;

  return (
    <Modal open={!!instance} onClose={onClose} title={instance?.title ?? "Assignment"} prefersReducedMotion={prefersReducedMotion}>
      {instance && (
        <div className="flex flex-col gap-3 text-sm">
          {instance.project ? (
            <p style={{ color: COLORS.text }}>{instance.project.name}</p>
          ) : (
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-3 w-0.5"
                style={{ background: getSubjectColor(instance.subject?.name) }}
              />
              <span style={{ color: COLORS.text }}>{instance.subject?.name ?? "No subject"}</span>
            </div>
          )}

          {instance.details && <p style={{ color: COLORS.muted }}>{instance.details}</p>}

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5" style={{ color: COLORS.muted }}>
            {instance.dueDate && (
              <>
                <dt className="font-medium" style={{ color: COLORS.text }}>
                  Due
                </dt>
                <dd>{formatComingUpDate(instance.dueDate)}</dd>
              </>
            )}
            {instance.series?.estimatedMinutes != null && (
              <>
                <dt className="font-medium" style={{ color: COLORS.text }}>
                  Est. time
                </dt>
                <dd>{instance.series.estimatedMinutes} min</dd>
              </>
            )}
            <dt className="font-medium" style={{ color: COLORS.text }}>
              Status
            </dt>
            <dd>{statusLabel(instance)}</dd>
          </dl>

          {isOwnProjectTask && instance.status === InstanceStatus.open && (
            <OwnTaskControls studentId={studentId} instance={instance} onDone={onClose} />
          )}
        </div>
      )}
    </Modal>
  );
}

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
    <div className="mt-1 flex flex-col gap-3 border-t pt-3" style={{ borderColor: COLORS.hairline }}>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={moveDate}
          onChange={(event) => setMoveDate(event.target.value)}
          className="rounded border px-2 py-1.5 text-xs"
          style={{ borderColor: COLORS.hairline }}
        />
        <button type="button" onClick={handleMove} disabled={pending} className="text-xs font-medium" style={{ color: COLORS.text }}>
          Move
        </button>
        {instance.dueDate && (
          <button type="button" onClick={handleUnschedule} disabled={pending} className="text-xs" style={{ color: COLORS.muted }}>
            Move to backlog
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="self-start text-xs font-medium"
        style={{ color: COLORS.amber }}
      >
        Delete
      </button>
    </div>
  );
}
