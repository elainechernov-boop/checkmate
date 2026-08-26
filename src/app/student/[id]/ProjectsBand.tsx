"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { useDraggable } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PlanRecurrenceChoice } from "@/lib/projects";
import { ProjectStatus } from "@/generated/prisma/enums";
import { WEEKDAYS, formatComingUpDate, toISODate, type WeekdayCode } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import {
  addBacklogTaskAction,
  createProjectAction,
  deleteProjectAction,
  deleteProjectTaskAction,
  editProjectTargetDateAction,
  editProjectTaskTitleAction,
  planProjectTaskAction,
} from "./projectActions";
import { ProjectFinishedTakeover } from "./ProjectFinishedTakeover";
import type { StudentInstance, StudentProject } from "./types";

const STATUS_LABEL: Record<ProjectStatus, string> = {
  active: "Active",
  completed: "Finished",
  archived: "Archived",
};

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
 * else here (add/plan/delete) goes through plain server actions, and every
 * popup from the old design (new project, project details, plan a task) is
 * now inline per the redesign — no modals anywhere in this band.
 */
export function ProjectsBand({
  studentId,
  accentColor,
  projects,
  today,
  prefersReducedMotion,
}: {
  studentId: string;
  accentColor: string;
  projects: StudentProject[];
  today: Date;
  prefersReducedMotion: boolean;
}) {
  const [celebratedIds, setCelebratedIds] = useState<Set<string>>(new Set());
  const [celebratingProject, setCelebratingProject] = useState<StudentProject | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

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
    setCelebratingProject(project);
  }

  function submitNewProject() {
    const trimmed = newProjectName.trim();
    setNewProjectName("");
    if (trimmed) void createProjectAction(studentId, trimmed, null);
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium uppercase tracking-wide" style={{ color: COLORS.muted }}>
        Projects
      </h2>

      {active.length === 0 && finished.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: COLORS.mutedFaint }}>
          No projects yet.
        </p>
      )}

      {active.length > 0 && (
        // §7 "prioritized" — reorderable within the same band-level
        // DndContext StudentWeekView already owns (see its handleWeekDragEnd
        // for the reorder branch); this only adds the sortable *strategy*,
        // not a second drag root, so it can't collide with the backlog
        // tasks' own draggables nested inside each card below.
        <SortableContext items={active.map((project) => project.id)} strategy={horizontalListSortingStrategy}>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-2">
            {active.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                studentId={studentId}
                accentColor={accentColor}
                today={today}
                awaitingCelebration={project.status === ProjectStatus.completed}
                onFinish={() => handleFinish(project)}
              />
            ))}
          </div>
        </SortableContext>
      )}

      {finished.length > 0 && <FinishedStack projects={finished} studentId={studentId} />}

      {/* "Was '+ New project' → now a blank line" (README §"Popups →
          inline") — the target date, if any, is set afterward via the
          card's own inline-edit panel instead of upfront here. */}
      <input
        value={newProjectName}
        onChange={(event) => setNewProjectName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitNewProject();
          } else if (event.key === "Escape") {
            setNewProjectName("");
          }
        }}
        placeholder="Start a new project, press Enter…"
        className="mt-3 w-full max-w-xs border-b bg-transparent py-1.5 text-sm outline-none"
        style={{ borderColor: COLORS.hairline, color: COLORS.text, borderBottomStyle: "dashed" }}
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
  today,
  awaitingCelebration,
  onFinish,
}: {
  project: StudentProject;
  studentId: string;
  accentColor: string;
  today: Date;
  awaitingCelebration: boolean;
  onFinish: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id });

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
    <div
      ref={setNodeRef}
      className="group shrink-0 border-l pl-4"
      style={{
        width: 240,
        borderColor: COLORS.hairline,
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: "relative",
      }}
    >
      <div className="flex items-start gap-1">
        {/* The card's own drag handle (§7 "prioritized") — a dedicated
            target, not the whole card, so it never competes with the
            backlog tasks' own drag-to-day gesture nested inside it. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${project.name}`}
          title="Drag to reorder"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-xs leading-none"
          style={{ color: COLORS.mutedFaint, touchAction: "none" }}
        >
          ⠿
        </button>
        <span className="min-w-0 flex-1 truncate">
          <span style={{ fontFamily: "var(--font-syncopate)", fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase", fontSize: 14, color: COLORS.text }}>
            {project.name}
          </span>
          {project.targetDate && !awaitingCelebration && (
            <span style={{ fontSize: 11, color: COLORS.muted }}> by {formatComingUpDate(project.targetDate)}</span>
          )}
        </span>
      </div>
      {awaitingCelebration && (
        <button type="button" onClick={onFinish} className="text-xs hover:underline" style={{ color: accentColor }}>
          🎉 All done — open to finish!
        </button>
      )}

      {project.progress.total > 0 && (
        <span aria-hidden className="mt-1.5 block h-[3px]" style={{ background: COLORS.hairline }}>
          <span
            className="block h-full"
            style={{ width: `${Math.min(100, Math.round((project.progress.done / project.progress.total) * 100))}%`, background: accentColor }}
          />
        </span>
      )}

      <div className="mt-2 flex flex-col">
        {project.backlogTasks.length === 0 && (
          <p className="py-1 text-xs" style={{ color: COLORS.mutedFaint }}>
            Nothing here yet.
          </p>
        )}
        {project.backlogTasks.map((task) => (
          <BacklogTaskRow key={task.id} task={task} studentId={studentId} accentColor={accentColor} today={today} untilDate={project.targetDate} />
        ))}
      </div>

      {adding ? (
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={submit}
          onKeyDown={handleKeyDown}
          placeholder="Add a step"
          className="mt-2 w-full border-b bg-transparent py-1 text-xs outline-none"
          style={{ borderColor: COLORS.hairline, borderBottomStyle: "dashed" }}
        />
      ) : (
        <input
          onFocus={() => setAdding(true)}
          placeholder="Add a step"
          readOnly
          className="mt-2 w-full border-b bg-transparent py-1 text-xs outline-none"
          style={{ borderColor: COLORS.hairline, color: COLORS.mutedFaint, borderBottomStyle: "dashed" }}
        />
      )}

      {/* Meta line's own click-to-expand, same convention as a day row's
          meta line — status, target date (click-to-edit), backlog count,
          delete. */}
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="mt-2 text-xs"
        style={{ color: COLORS.mutedFaint, textDecoration: "underline dotted" }}
      >
        Details
      </button>
      {expanded && (
        <ProjectExpandPanel studentId={studentId} project={project} onClose={() => setExpanded(false)} />
      )}
    </div>
  );
}

function ProjectExpandPanel({
  studentId,
  project,
  onClose,
}: {
  studentId: string;
  project: StudentProject;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [targetDate, setTargetDate] = useState(project.targetDate ? toISODate(project.targetDate) : "");

  async function handleDelete() {
    if (!window.confirm(`Delete "${project.name}"? This can't be undone.`)) return;
    setPending(true);
    try {
      await deleteProjectAction(studentId, project.id);
    } finally {
      setPending(false);
    }
  }

  function commitTargetDate() {
    void editProjectTargetDateAction(studentId, project.id, targetDate || null);
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t pt-2 text-xs" style={{ borderColor: COLORS.hairline }}>
      <p style={{ color: COLORS.muted }}>
        Status: <span style={{ color: COLORS.text }}>{STATUS_LABEL[project.status]}</span>
      </p>
      <p className="flex items-center gap-1" style={{ color: COLORS.muted }}>
        By:
        <input
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          onBlur={commitTargetDate}
          className="border-b bg-transparent py-0.5 outline-none"
          style={{ borderColor: COLORS.hairline, color: COLORS.text }}
        />
      </p>
      <p style={{ color: COLORS.muted }}>
        Backlog:{" "}
        <span style={{ color: COLORS.text }}>
          {project.backlogTasks.length} task{project.backlogTasks.length === 1 ? "" : "s"} not yet scheduled
        </span>
      </p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleDelete} disabled={pending} className="self-start font-medium" style={{ color: COLORS.crimson }}>
          Delete project
        </button>
        <button type="button" onClick={onClose} style={{ color: COLORS.mutedFaint }}>
          Close
        </button>
      </div>
    </div>
  );
}

const PLAN_WEEKDAYS = WEEKDAYS.filter((day) => day.code !== "sun");
const PLAN_CHOICES: { value: PlanRecurrenceChoice; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "everyDay", label: "Every day" },
  { value: "everyOtherDay", label: "Every other" },
  { value: "pickDays", label: "Pick days" },
];

function BacklogTaskRow({
  task,
  studentId,
  accentColor,
  today,
  untilDate,
}: {
  task: StudentInstance;
  studentId: string;
  accentColor: string;
  today: Date;
  untilDate: Date | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [planning, setPlanning] = useState(false);

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
        borderColor: COLORS.hairline,
      }}
      className="group/task flex flex-col border-b py-1 text-xs last:border-b-0"
    >
      <div className="flex items-center gap-1.5">
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
            className="min-w-0 flex-1 border-b bg-transparent outline-none"
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
        <button
          type="button"
          onClick={() => setPlanning((current) => !current)}
          className="shrink-0 hover:underline"
          style={{ color: accentColor }}
        >
          Plan it
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Delete "${task.title}"?`)) void deleteProjectTaskAction(studentId, task.id);
          }}
          aria-label={`Delete ${task.title}`}
          className="shrink-0 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/task:opacity-100"
          style={{ color: COLORS.mutedFaint }}
        >
          ×
        </button>
      </div>

      {planning && (
        <PlanTaskInline
          task={task}
          studentId={studentId}
          today={today}
          defaultUntilDate={untilDate}
          onDone={() => setPlanning(false)}
        />
      )}
    </div>
  );
}

/** "Plan it" turns the row into an inline recurrence picker (README §7's
 * "kid-sized" menu) — never a sheet. A plain date + Enter covers the common
 * "just once" case; "Repeat" reveals the same every-day / every-other-day /
 * pick-days options the old PlanTaskModal had, still entirely in place. */
function PlanTaskInline({
  task,
  studentId,
  today,
  defaultUntilDate,
  onDone,
}: {
  task: StudentInstance;
  studentId: string;
  today: Date;
  defaultUntilDate: Date | null;
  onDone: () => void;
}) {
  const [choice, setChoice] = useState<PlanRecurrenceChoice>("once");
  const [showRepeat, setShowRepeat] = useState(false);
  const [startDate, setStartDate] = useState(toISODate(today));
  const [untilDate, setUntilDate] = useState(defaultUntilDate ? toISODate(defaultUntilDate) : "");
  const [days, setDays] = useState<Set<WeekdayCode>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsUntil = choice !== "once";
  const needsDays = choice === "pickDays";

  function toggleDay(code: WeekdayCode) {
    setDays((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function submit() {
    if (!startDate) return;
    setSaving(true);
    setError(null);
    try {
      await planProjectTaskAction(studentId, task.id, choice, startDate, Array.from(days), needsUntil ? untilDate || null : null);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1.5 border-t pt-1.5" style={{ borderColor: COLORS.hairline }}>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          autoFocus
          required
          value={startDate}
          onChange={(event) => setStartDate(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              onDone();
            }
          }}
          className="border-b bg-transparent py-0.5 outline-none"
          style={{ borderColor: COLORS.hairline, color: COLORS.text }}
        />
        {!showRepeat && (
          <button type="button" onClick={() => setShowRepeat(true)} style={{ color: COLORS.mutedFaint }}>
            Repeat…
          </button>
        )}
      </div>

      {showRepeat && (
        <>
          <div className="flex flex-wrap gap-1">
            {PLAN_CHOICES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setChoice(option.value)}
                className="border px-1.5 py-0.5"
                style={
                  choice === option.value
                    ? { borderColor: COLORS.text, background: COLORS.text, color: "white" }
                    : { borderColor: COLORS.hairline, color: COLORS.text }
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          {needsDays && (
            <div className="flex gap-2">
              {PLAN_WEEKDAYS.map((day) => (
                <label key={day.code} className="flex items-center gap-1 capitalize" style={{ color: COLORS.text }}>
                  <input type="checkbox" checked={days.has(day.code)} onChange={() => toggleDay(day.code)} />
                  {day.code}
                </label>
              ))}
            </div>
          )}

          {needsUntil && (
            <label className="flex items-center gap-1" style={{ color: COLORS.muted }}>
              Until
              <input
                type="date"
                value={untilDate}
                onChange={(event) => setUntilDate(event.target.value)}
                className="border-b bg-transparent py-0.5 outline-none"
                style={{ borderColor: COLORS.hairline, color: COLORS.text }}
              />
            </label>
          )}
        </>
      )}

      {error && (
        <p style={{ color: COLORS.crimson }}>{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={saving} className="self-start font-medium" style={{ color: COLORS.text }}>
          {saving ? "Planning…" : "Plan it"}
        </button>
        <button type="button" onClick={onDone} style={{ color: COLORS.mutedFaint }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** §7 project completion: "kept, not deleted" — a quiet, collapsed record
 * of things the student taught themselves, off to the side of the active
 * band above. */
function FinishedStack({ projects, studentId }: { projects: StudentProject[]; studentId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button type="button" onClick={() => setOpen((current) => !current)} className="text-xs" style={{ color: COLORS.mutedFaint }}>
        {open ? "▾" : "▸"} Finished ({projects.length})
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {projects.map((project) => (
            <li key={project.id} className="group/finished flex items-center gap-2">
              <span className="text-xs" style={{ color: COLORS.muted, textDecoration: "line-through" }}>
                {project.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete "${project.name}"?`)) void deleteProjectAction(studentId, project.id);
                }}
                aria-label={`Delete ${project.name}`}
                className="text-xs opacity-100 transition-opacity sm:opacity-0 sm:group-hover/finished:opacity-100"
                style={{ color: COLORS.mutedFaint }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
