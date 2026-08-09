"use client";

import { InstanceStatus } from "@/generated/prisma/enums";
import { formatComingUpDate } from "@/lib/dates";
import { getSubjectColor } from "@/lib/subjectColors";
import { COLORS } from "@/lib/theme";
import { Modal } from "@/components/Modal";
import type { StudentInstance } from "./types";

function statusLabel(instance: StudentInstance): string {
  if (instance.status === InstanceStatus.done) return "Done";
  if (instance.status === InstanceStatus.excused) return "Excused";
  if (instance.status === InstanceStatus.pendingReview) return "Waiting on Mom";
  return instance.rolledCount > 0 ? `Rolled forward ${instance.rolledCount} day(s)` : "Not done yet";
}

/** Read-only — parent-assigned work stays untouchable by students (§2). This
 * is purely "what is this, and what does it need" (§9's ask: notes, subject,
 * estimated time). */
export function AssignmentDetailsModal({
  instance,
  onClose,
  prefersReducedMotion,
}: {
  instance: StudentInstance | null;
  onClose: () => void;
  prefersReducedMotion: boolean;
}) {
  return (
    <Modal open={!!instance} onClose={onClose} title={instance?.title ?? "Assignment"} prefersReducedMotion={prefersReducedMotion}>
      {instance && (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-3 w-0.5"
              style={{ background: getSubjectColor(instance.subject?.name) }}
            />
            <span style={{ color: COLORS.text }}>{instance.subject?.name ?? "No subject"}</span>
          </div>

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
        </div>
      )}
    </Modal>
  );
}
