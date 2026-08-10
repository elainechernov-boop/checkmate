"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ProjectStatus } from "@/generated/prisma/enums";
import { formatComingUpDate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { addBacklogTaskAction, deleteProjectTaskAction, editProjectTaskTitleAction } from "./projectActions";
import { ProjectDetailsModal } from "./ProjectDetailsModal";
import { ProjectFinishedTakeover } from "./ProjectFinishedTakeover";
import type { StudentInstance, StudentProject } from "./types";

// §7's completion is auto-detected server-side the moment every task is
// done (recomputeProjectStatus), but the celebration itself is a deliberate
// button-press, not an ambush the instant a checkbox ticks — so "has this
// already been celebrated" is tracked locally, the same way day-complete's
// once-per-day guard is (StudentWeekView's celebratedToday), just keyed by
// project instead of by date.
function celebratedStorageKey(studentId: string): string {
  return `checkmate:projects-celebrated:${studentId}`;
}

function loadCelebratedIds(studentId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(celebratedStorageKey(studentId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * §7's Projects band — "TeuxDeux's undated 'someday' area, turned into a
 * planning sandbox." Visually quieter than the week above it: smaller text,
 * a muted border, no color beyond the student's own accent (§9). Backlog
 * rows are drag sources for the outer, band-level DndContext that
 * StudentWeekView owns (see DayColumn's matching droppable) — everything
 * else here (add/plan/delete) goes through plain server actions.
 */
export function ProjectsBand({
  studentId,
  accentColor,
  projects,
  onPlanTask,
  onNewProject,
  prefersReducedMotion,
}: {
  studentId: string;
  accentColor: string;
  projects: StudentProject[];
  onPlanTask: (task: StudentInstance) => void;
  onNewProject: () => void;
  prefersReducedMotion: boolean;
}) {
  const [celebratedIds, setCelebratedIds] = useState<Set<string>>(new Set());
  const [celebratingProject, setCelebratingProject] = useState<StudentProject | null>(null);
  const [detailsProjectId, setDetailsProjectId] = useState<string | null>(null);
  const detailsProject = projects.find((p) => p.id === detailsProjectId) ?? null;

  useEffect(() => {
    // Browser-only read, deferred past hydration (same reasoning as
    // StudentWeekView's celebratedToday effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCelebratedIds(loadCelebratedIds(studentId));
  }, [studentId]);

  // A project sitting at status "completed" but not yet celebrated stays in
  // the active row — it's the "Project finished!" button's job to move it
  // into the Finished stack, not a silent status flip.
  const active = projects.filter(
    (p) => p.status === ProjectStatus.active || (p.status === ProjectStatus.completed && !celebratedIds.has(p.id))
  );
  const finished = projects.filter((p) => p.status === ProjectStatus.completed && celebratedIds.has(p.id));

  function handleFinish(project: StudentProject) {
    setCelebratedIds((current) => {
      const next = new Set(current);
      next.add(project.id);
      try {
        window.localStorage.setItem(celebratedStorageKey(studentId), JSON.stringify(Array.from(next)));
      } catch {
        // localStorage unavailable (private browsing, etc.) — the
        // celebration still plays for this session, it just won't stick.
      }
      return next;
    });
    setDetailsProjectId(null);
    setCelebratingProject(project);
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: COLORS.muted }}>
          Projects
        </h2>
        <button type="button" onClick={onNewProject} className="text-xs hover:underline" style={{ color: accentColor }}>
          + New project
        </button>
      </div>

      {active.length === 0 && finished.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: COLORS.mutedFaint }}>
          No projects yet.
        </p>
      )}

      {active.length > 0 && (
        <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
          {active.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              studentId={studentId}
              accentColor={accentColor}
              onPlanTask={onPlanTask}
              onOpenDetails={() => setDetailsProjectId(project.id)}
              awaitingCelebration={project.status === ProjectStatus.completed}
            />
          ))}
        </div>
      )}

      {finished.length > 0 && <FinishedStack projects={finished} onOpenDetails={setDetailsProjectId} />}

      <ProjectDetailsModal
        project={detailsProject}
        studentId={studentId}
        accentColor={accentColor}
        readyToCelebrate={!!detailsProject && detailsProject.status === ProjectStatus.completed && !celebratedIds.has(detailsProject.id)}
        onFinish={handleFinish}
        onClose={() => setDetailsProjectId(null)}
        prefersReducedMotion={prefersReducedMotion}
      />

      {celebratingProject && (
        <ProjectFinishedTakeover
          projectName={celebratingProject.name}
          reducedMotion={prefersReducedMotion}
          onDone={() => setCelebratingProject(null)}
        />
      )}
    </section>
  );
}

function ProjectCard({
  project,
  studentId,
  accentColor,
  onPlanTask,
  onOpenDetails,
  awaitingCelebration,
}: {
  project: StudentProject;
  studentId: string;
  accentColor: string;
  onPlanTask: (task: StudentInstance) => void;
  onOpenDetails: () => void;
  awaitingCelebration: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    setAdding(false);
    setText("");
    if (trimmed) void addBacklogTaskAction(studentId, project.id, trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      setAdding(false);
      setText("");
    }
  }

  return (
    <div className="w-56 shrink-0 rounded border p-3" style={{ borderColor: COLORS.hairline, background: "rgba(255,255,255,0.4)" }}>
      <button type="button" onClick={onOpenDetails} className="block w-full truncate text-left text-sm font-medium hover:underline" style={{ color: COLORS.text }}>
        {project.name}
      </button>
      {awaitingCelebration ? (
        <button type="button" onClick={onOpenDetails} className="text-xs hover:underline" style={{ color: accentColor }}>
          🎉 All done — open to finish!
        </button>
      ) : (
        project.targetDate && (
          <p className="text-xs" style={{ color: COLORS.mutedFaint }}>
            by {formatComingUpDate(project.targetDate)}
          </p>
        )
      )}

      <div className="mt-2 flex flex-col">
        {project.backlogTasks.length === 0 && (
          <p className="py-1 text-xs" style={{ color: COLORS.mutedFaint }}>
            Nothing here yet.
          </p>
        )}
        {project.backlogTasks.map((task) => (
          <BacklogTaskRow key={task.id} task={task} studentId={studentId} accentColor={accentColor} onPlan={() => onPlanTask(task)} />
        ))}
      </div>

      {adding ? (
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={submit}
          onKeyDown={handleKeyDown}
          placeholder="Task"
          className="mt-2 w-full rounded border px-2 py-1 text-xs outline-none"
          style={{ borderColor: COLORS.hairline }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-2 text-xs" style={{ color: COLORS.mutedFaint }}>
          + Add task
        </button>
      )}
    </div>
  );
}

function BacklogTaskRow({
  task,
  studentId,
  accentColor,
  onPlan,
}: {
  task: StudentInstance;
  studentId: string;
  accentColor: string;
  onPlan: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);

  function commit() {
    setEditing(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) {
      void editProjectTaskTitleAction(studentId, task.id, trimmed);
    } else {
      setTitle(task.title);
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "grab",
      }}
      className="flex items-center gap-1.5 border-b py-1 text-xs last:border-b-0"
    >
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
          }}
          className="min-w-0 flex-1 rounded border px-1 py-0.5 outline-none"
          style={{ borderColor: COLORS.hairline }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-w-0 flex-1 truncate text-left"
          style={{ color: COLORS.text }}
        >
          {task.title}
        </button>
      )}
      <button type="button" onClick={onPlan} className="shrink-0 hover:underline" style={{ color: accentColor }}>
        Plan it
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm(`Delete "${task.title}"?`)) void deleteProjectTaskAction(studentId, task.id);
        }}
        aria-label={`Delete ${task.title}`}
        className="shrink-0"
        style={{ color: COLORS.mutedFaint }}
      >
        ×
      </button>
    </div>
  );
}

/** §7 project completion: "kept, not deleted" — a quiet, collapsed record
 * of things the student taught themselves, off to the side of the active
 * band above. */
function FinishedStack({
  projects,
  onOpenDetails,
}: {
  projects: StudentProject[];
  onOpenDetails: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((current) => !current)} className="text-xs" style={{ color: COLORS.mutedFaint }}>
        {open ? "▾" : "▸"} Finished ({projects.length})
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => onOpenDetails(project.id)}
                className="text-xs hover:underline"
                style={{ color: COLORS.muted, textDecoration: "line-through" }}
              >
                {project.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
