"use client";

import { useState, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ProjectStatus } from "@/generated/prisma/enums";
import { formatComingUpDate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { addBacklogTaskAction, deleteProjectTaskAction, editProjectTaskTitleAction } from "./projectActions";
import type { StudentInstance, StudentProject } from "./types";

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
}: {
  studentId: string;
  accentColor: string;
  projects: StudentProject[];
  onPlanTask: (task: StudentInstance) => void;
  onNewProject: () => void;
}) {
  const active = projects.filter((p) => p.status === ProjectStatus.active);
  const finished = projects.filter((p) => p.status === ProjectStatus.completed);

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
            />
          ))}
        </div>
      )}

      {finished.length > 0 && <FinishedStack projects={finished} />}
    </section>
  );
}

function ProjectCard({
  project,
  studentId,
  accentColor,
  onPlanTask,
}: {
  project: StudentProject;
  studentId: string;
  accentColor: string;
  onPlanTask: (task: StudentInstance) => void;
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
      <h3 className="truncate text-sm font-medium" style={{ color: COLORS.text }}>
        {project.name}
      </h3>
      {project.targetDate && (
        <p className="text-xs" style={{ color: COLORS.mutedFaint }}>
          by {formatComingUpDate(project.targetDate)}
        </p>
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
