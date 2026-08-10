"use client";

import { useState } from "react";
import { ProjectStatus } from "@/generated/prisma/enums";
import { formatComingUpDate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { Modal } from "@/components/Modal";
import { deleteProjectAction } from "./projectActions";
import type { StudentProject } from "./types";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Finished",
  archived: "Archived",
};

/** A project's own details popup (§7) — the band's cards otherwise show
 * only the backlog task list, with nowhere to see the project as a whole or
 * to get rid of one the student no longer wants. Once every task is done
 * (recomputeProjectStatus already flipped `status` to completed) but the
 * student hasn't celebrated yet, this is also where that happens — a big
 * button rather than an automatic reward, so the moment lands when the
 * student is ready to press it, not the instant the last checkbox ticks. */
export function ProjectDetailsModal({
  project,
  studentId,
  accentColor,
  readyToCelebrate,
  onFinish,
  onClose,
  prefersReducedMotion,
}: {
  project: StudentProject | null;
  studentId: string;
  accentColor: string;
  readyToCelebrate: boolean;
  onFinish: (project: StudentProject) => void;
  onClose: () => void;
  prefersReducedMotion: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!project) return;
    if (!window.confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    setPending(true);
    try {
      await deleteProjectAction(studentId, project.id);
      onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open={!!project} onClose={onClose} title={project?.name ?? "Project"} prefersReducedMotion={prefersReducedMotion}>
      {project && (
        <div className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5" style={{ color: COLORS.muted }}>
            <dt className="font-medium" style={{ color: COLORS.text }}>
              Status
            </dt>
            <dd>{STATUS_LABEL[project.status]}</dd>

            {project.targetDate && (
              <>
                <dt className="font-medium" style={{ color: COLORS.text }}>
                  Target date
                </dt>
                <dd>{formatComingUpDate(project.targetDate)}</dd>
              </>
            )}

            <dt className="font-medium" style={{ color: COLORS.text }}>
              Backlog
            </dt>
            <dd>
              {project.backlogTasks.length} task{project.backlogTasks.length === 1 ? "" : "s"} not yet scheduled
            </dd>
          </dl>

          {readyToCelebrate && (
            <button
              type="button"
              onClick={() => onFinish(project)}
              className="rounded px-4 py-3 text-base font-semibold text-white"
              style={{ background: accentColor }}
            >
              🎉 Project finished!
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="self-start text-xs font-medium"
            style={{ color: COLORS.amber }}
          >
            Delete project
          </button>
        </div>
      )}
    </Modal>
  );
}
