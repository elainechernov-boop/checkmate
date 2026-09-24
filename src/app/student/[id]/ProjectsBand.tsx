"use client";

import { useState } from "react";
import { ProjectStatus } from "@/generated/prisma/enums";
import { InlineEntry, TextAction } from "@/components/FlatField";
import { formatComingUpDate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { createProjectAction, deleteProjectAction } from "./projectActions";
import type { StudentProject } from "./types";

/**
 * HOMEROOM_UX_MIGRATION.md §5.4 "Student permissions and projects" — Elaine's
 * original decision removed all student authoring of projects. Revised
 * 2026-09-08: kids get project *creation* back ("Start a new project"), and
 * 2026-09-24: deleting a whole project too, but everything under a project (add/edit/delete a step, Plan it, reorder,
 * rename, target date) stays parent-only in /parent/projects — the
 * summary below one project card, and the finished stack, are still
 * read-only. A scheduled project step still shows up, and is still
 * completable, as an ordinary row in the week grid above (see
 * AssignmentRow/DayColumn); this band never duplicates that.
 */
export function ProjectsBand({
  studentId,
  accentColor,
  projects,
}: {
  studentId: string;
  accentColor: string;
  projects: StudentProject[];
}) {
  const inProgress = projects.filter((p) => p.status === ProjectStatus.active);
  const finished = projects.filter((p) => p.status === ProjectStatus.completed);

  return (
    <section className="mt-[22px] pt-[18px]" style={{ borderTop: `2px solid ${COLORS.text}` }}>
      <h2 className="uppercase" style={{ color: COLORS.muted, fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.1em" }}>
        Projects
      </h2>

      {inProgress.length > 0 && (
        <div className="mt-[10px] flex flex-wrap gap-6">
          {inProgress.map((project) => (
            <ProjectSummaryCard key={project.id} studentId={studentId} project={project} accentColor={accentColor} />
          ))}
        </div>
      )}

      <InlineEntry
        placeholder="Start a new project, press Enter"
        onSubmit={(name) => createProjectAction(studentId, name)}
        className="mt-3 max-w-xs"
      />

      {finished.length > 0 && <FinishedStack projects={finished} />}
    </section>
  );
}

function ProjectSummaryCard({
  studentId,
  project,
  accentColor,
}: {
  studentId: string;
  project: StudentProject;
  accentColor: string;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const percent = project.progress.total > 0 ? Math.min(100, Math.round((project.progress.done / project.progress.total) * 100)) : 0;
  const nextSteps = project.backlogTasks.slice(0, 3);

  return (
    <div className="w-[240px] shrink-0 border-l pl-4" style={{ borderColor: COLORS.hairline }}>
      <span
        className="block truncate uppercase"
        style={{ fontFamily: "var(--font-syncopate)", fontWeight: 700, letterSpacing: "0.03em", fontSize: 14, color: COLORS.text }}
      >
        {project.name}
      </span>
      {project.targetDate && (
        <span style={{ fontSize: 11, color: COLORS.muted }}>By {formatComingUpDate(project.targetDate)}</span>
      )}

      {project.progress.total > 0 && (
        <span aria-hidden className="mt-1.5 block h-[3px]" style={{ background: COLORS.hairline }}>
          <span className="block h-full" style={{ width: `${percent}%`, background: accentColor }} />
        </span>
      )}

      {nextSteps.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {nextSteps.map((step) => (
            <li key={step.id} className="truncate text-xs" style={{ color: COLORS.muted }}>
              {step.title}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 text-xs">
        {confirmingDelete ? (
          <span className="flex items-center gap-2">
            <span style={{ color: COLORS.muted }}>Delete project?</span>
            <TextAction onClick={() => deleteProjectAction(studentId, project.id)} style={{ color: COLORS.crimson, fontWeight: 600 }}>
              Delete
            </TextAction>
            <TextAction onClick={() => setConfirmingDelete(false)} style={{ color: COLORS.muted }}>
              Cancel
            </TextAction>
          </span>
        ) : (
          <TextAction onClick={() => setConfirmingDelete(true)} style={{ color: COLORS.mutedFaint }}>
            Delete
          </TextAction>
        )}
      </div>
    </div>
  );
}

/** §7 project completion: "kept, not deleted" — a quiet, collapsed record
 * of things the student taught themselves, off to the side of the active
 * band above. Read-only, same as everything else in this band. */
function FinishedStack({ projects }: { projects: StudentProject[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((current) => !current)} className="text-xs" style={{ color: COLORS.mutedFaint }}>
        {open ? "▾" : "▸"} Finished ({projects.length})
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {projects.map((project) => (
            <li key={project.id} className="text-xs" style={{ color: COLORS.muted, textDecoration: "line-through" }}>
              {project.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
