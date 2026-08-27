"use client";

import { useState } from "react";
import type { AssignmentInstance, Project, ProjectIdea, Student } from "@/generated/prisma/client";
import { ProjectStatus } from "@/generated/prisma/enums";
import { WEEKDAYS, formatComingUpDate, toISODate, type WeekdayCode } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { SettingsCard } from "@/components/SettingsCard";
import { InlineEntry, TextAction } from "@/components/FlatField";
import type { PlanRecurrenceChoice } from "@/lib/projects";
import {
  addBacklogTaskAction,
  addProjectIdeaAction,
  createProjectAction,
  deleteProjectAction,
  deleteProjectIdeaAction,
  deleteProjectTaskAction,
  editProjectTaskTitleAction,
  moveProjectTaskAction,
  planProjectTaskAction,
  promoteProjectIdeaAction,
  renameProjectAction,
  reorderProjectsAction,
  setProjectArchivedAction,
  setProjectSubjectAction,
  setProjectTargetDateAction,
  unscheduleProjectTaskAction,
} from "./actions";

type BacklogTask = AssignmentInstance & {
  subject: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
};

type ProjectRow = Project & {
  subject: { id: string; name: string } | null;
  backlogTasks: BacklogTask[];
  progress: { done: number; total: number };
};

export function ParentProjectsBoard({
  students,
  subjects,
  projects,
  projectIdeas,
  today,
}: {
  students: Student[];
  subjects: { id: string; name: string }[];
  projects: ProjectRow[];
  projectIdeas: ProjectIdea[];
  today: Date;
}) {
  if (students.length === 0) {
    return (
      <p className="mt-8 text-sm" style={{ color: COLORS.muted }}>
        Add a student first, from Students settings, before planning projects.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {students.map((student) => (
        <StudentProjectsSection
          key={student.id}
          student={student}
          subjects={subjects}
          projects={projects.filter((p) => p.studentId === student.id)}
          ideas={projectIdeas.filter((i) => i.studentId === student.id)}
          today={today}
        />
      ))}
    </div>
  );
}

function StudentProjectsSection({
  student,
  subjects,
  projects,
  ideas,
  today,
}: {
  student: Student;
  subjects: { id: string; name: string }[];
  projects: ProjectRow[];
  ideas: ProjectIdea[];
  today: Date;
}) {
  const active = projects.filter((p) => p.status !== ProjectStatus.archived);
  const archived = projects.filter((p) => p.status === ProjectStatus.archived);
  const [showArchived, setShowArchived] = useState(false);

  async function handleReorder(projectId: string, direction: -1 | 1) {
    const ids = active.map((p) => p.id);
    const index = ids.indexOf(projectId);
    const swapWith = index + direction;
    if (index === -1 || swapWith < 0 || swapWith >= ids.length) return;
    [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
    await reorderProjectsAction(student.id, ids);
  }

  return (
    <SettingsCard>
      <h2
        className="uppercase"
        style={{ color: student.accentColor, fontFamily: "var(--font-syncopate)", fontWeight: 700, fontSize: 16, letterSpacing: "0.03em" }}
      >
        {student.name}
      </h2>

      {active.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: COLORS.mutedFaint }}>
          No active projects.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-4">
        {active.map((project, index) => (
          <ProjectCard
            key={project.id}
            project={project}
            subjects={subjects}
            today={today}
            canMoveUp={index > 0}
            canMoveDown={index < active.length - 1}
            onMove={(direction) => handleReorder(project.id, direction)}
          />
        ))}
      </div>

      <InlineEntry
        placeholder="Start a new project, press Enter"
        onSubmit={(name) => createProjectAction(student.id, name)}
        className="mt-3 max-w-sm"
      />

      {archived.length > 0 && (
        <div className="mt-4">
          <TextAction onClick={() => setShowArchived((current) => !current)} style={{ color: COLORS.mutedFaint, fontSize: 12 }}>
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </TextAction>
          {showArchived && (
            <ul className="mt-2 flex flex-col gap-1">
              {archived.map((project) => (
                <li key={project.id} className="flex items-center gap-2 text-sm" style={{ color: COLORS.muted }}>
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <TextAction onClick={() => setProjectArchivedAction(project.id, false)} style={{ color: COLORS.cobalt, fontSize: 12 }}>
                    Restore
                  </TextAction>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <IdeasSection studentId={student.id} ideas={ideas} />
    </SettingsCard>
  );
}

function ProjectCard({
  project,
  subjects,
  today,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  project: ProjectRow;
  subjects: { id: string; name: string }[];
  today: Date;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(project.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const percent = project.progress.total > 0 ? Math.min(100, Math.round((project.progress.done / project.progress.total) * 100)) : 0;

  function commitName() {
    setEditingName(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) void renameProjectAction(project.id, trimmed);
    else setName(project.name);
  }

  return (
    <div className="border-l pl-4" style={{ borderColor: COLORS.hairline }}>
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 flex-col text-xs" style={{ color: COLORS.mutedFaint }}>
          <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} className="disabled:opacity-30" aria-label="Move up">
            ▲
          </button>
          <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} className="disabled:opacity-30" aria-label="Move down">
            ▼
          </button>
        </div>

        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitName();
                } else if (event.key === "Escape") {
                  setName(project.name);
                  setEditingName(false);
                }
              }}
              className="hr-flat-input"
              style={{
                fontFamily: "var(--font-syncopate)",
                fontWeight: 700,
                letterSpacing: "0.03em",
                textTransform: "uppercase",
                fontSize: 14,
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="text-left uppercase"
              style={{ fontFamily: "var(--font-syncopate)", fontWeight: 700, letterSpacing: "0.03em", fontSize: 14, color: COLORS.text }}
            >
              {project.name}
            </button>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: COLORS.muted }}>
            <label className="flex items-center gap-1">
              Target:
              <input
                type="date"
                defaultValue={project.targetDate ? toISODate(project.targetDate) : ""}
                onBlur={(event) => void setProjectTargetDateAction(project.id, event.target.value || null)}
                className="hr-flat-input"
                style={{ width: "auto" }}
              />
            </label>
            <label className="flex items-center gap-1">
              HST subject:
              <select
                defaultValue={project.subjectId ?? ""}
                onChange={(event) => void setProjectSubjectAction(project.id, event.target.value || null)}
                className="hr-flat-input"
                style={{ width: "auto" }}
              >
                <option value="">Untagged</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            {project.status === ProjectStatus.completed && <span>Finished</span>}
          </div>

          {project.progress.total > 0 && (
            <span aria-hidden className="mt-1.5 block h-[3px] max-w-xs" style={{ background: COLORS.hairline }}>
              <span className="block h-full" style={{ width: `${percent}%`, background: COLORS.cobalt }} />
            </span>
          )}

          <div className="mt-2 flex flex-col">
            {project.backlogTasks.map((task) => (
              <BacklogTaskRow key={task.id} task={task} today={today} untilDate={project.targetDate} />
            ))}
          </div>

          {addingStep ? (
            <InlineEntry
              placeholder="Add a step, press Enter"
              onSubmit={async (title) => {
                await addBacklogTaskAction(project.id, title);
                setAddingStep(false);
              }}
              className="mt-1.5 max-w-xs"
            />
          ) : (
            <TextAction onClick={() => setAddingStep(true)} className="mt-1.5 text-xs" style={{ color: COLORS.mutedFaint }}>
              + Add a step
            </TextAction>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs">
            <TextAction
              onClick={() => setProjectArchivedAction(project.id, true)}
              style={{ color: COLORS.muted }}
            >
              Archive
            </TextAction>
            {confirmingDelete ? (
              <span className="flex items-center gap-2">
                <span style={{ color: COLORS.muted }}>Delete project?</span>
                <TextAction onClick={() => deleteProjectAction(project.id)} style={{ color: COLORS.crimson, fontWeight: 600 }}>
                  Delete
                </TextAction>
                <TextAction onClick={() => setConfirmingDelete(false)} style={{ color: COLORS.muted }}>
                  Cancel
                </TextAction>
              </span>
            ) : (
              <TextAction onClick={() => setConfirmingDelete(true)} style={{ color: COLORS.crimson }}>
                Delete
              </TextAction>
            )}
          </div>
        </div>
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

function BacklogTaskRow({ task, today, untilDate }: { task: BacklogTask; today: Date; untilDate: Date | null }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [planning, setPlanning] = useState(false);
  const isScheduled = !!task.dueDate;

  function commit() {
    setEditing(false);
    const trimmed = title.trim();
    if (trimmed && trimmed !== task.title) void editProjectTaskTitleAction(task.id, trimmed);
    else setTitle(task.title);
  }

  return (
    <div className="group/task flex flex-col border-b py-1 text-xs last:border-b-0" style={{ borderColor: COLORS.hairline }}>
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
            className="hr-flat-input min-w-0 flex-1"
          />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="min-w-0 flex-1 truncate text-left" style={{ color: COLORS.text }}>
            {task.title}
          </button>
        )}
        {isScheduled && (
          <span style={{ color: COLORS.mutedFaint }}>{formatComingUpDate(task.dueDate!)}</span>
        )}
        <TextAction onClick={() => setPlanning((current) => !current)} className="shrink-0 hover:underline" style={{ color: COLORS.cobalt }}>
          {isScheduled ? "Move" : "Plan it"}
        </TextAction>
        {isScheduled && (
          <TextAction onClick={() => unscheduleProjectTaskAction(task.id)} className="hr-hover-action shrink-0" style={{ color: COLORS.muted }}>
            Unschedule
          </TextAction>
        )}
        <TextAction
          onClick={() => deleteProjectTaskAction(task.id)}
          aria-label={`Delete ${task.title}`}
          className="hr-hover-action shrink-0"
          style={{ color: COLORS.mutedFaint }}
        >
          ×
        </TextAction>
      </div>

      {planning && (
        <PlanTaskInline
          task={task}
          today={today}
          defaultUntilDate={untilDate}
          isScheduled={isScheduled}
          onDone={() => setPlanning(false)}
        />
      )}
    </div>
  );
}

/** "Plan it" — kid-sized recurrence, now the parent's own tool (§5.12: the
 * whole scheduling surface moved here). A plain date + Enter covers "just
 * once"; "Repeat…" reveals every-day/every-other-day/pick-days. An
 * already-scheduled step reuses this same inline panel to move it instead. */
function PlanTaskInline({
  task,
  today,
  defaultUntilDate,
  isScheduled,
  onDone,
}: {
  task: BacklogTask;
  today: Date;
  defaultUntilDate: Date | null;
  isScheduled: boolean;
  onDone: () => void;
}) {
  const [choice, setChoice] = useState<PlanRecurrenceChoice>("once");
  const [showRepeat, setShowRepeat] = useState(false);
  const [startDate, setStartDate] = useState(task.dueDate ? toISODate(task.dueDate) : toISODate(today));
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
      if (isScheduled) {
        await moveProjectTaskAction(task.id, startDate);
      } else {
        await planProjectTaskAction(task.id, choice, startDate, Array.from(days), needsUntil ? untilDate || null : null);
      }
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
          className="hr-flat-input"
          style={{ width: "auto" }}
        />
        {!isScheduled && !showRepeat && (
          <TextAction onClick={() => setShowRepeat(true)} style={{ color: COLORS.mutedFaint }}>
            Repeat…
          </TextAction>
        )}
      </div>

      {!isScheduled && showRepeat && (
        <>
          <div className="flex flex-wrap gap-3">
            {PLAN_CHOICES.map((option) => (
              <TextAction
                key={option.value}
                onClick={() => setChoice(option.value)}
                style={{ color: choice === option.value ? COLORS.text : COLORS.mutedFaint, fontWeight: choice === option.value ? 700 : 400 }}
              >
                {option.label}
              </TextAction>
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
                className="hr-flat-input"
                style={{ width: "auto" }}
              />
            </label>
          )}
        </>
      )}

      {error && <p style={{ color: COLORS.crimson }}>{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={saving} className="self-start font-medium" style={{ color: COLORS.text }}>
          {saving ? "Saving…" : isScheduled ? "Move" : "Plan it"}
        </button>
        <TextAction onClick={onDone} style={{ color: COLORS.mutedFaint }}>
          Cancel
        </TextAction>
      </div>
    </div>
  );
}

function IdeasSection({ studentId, ideas }: { studentId: string; ideas: ProjectIdea[] }) {
  return (
    <div className="mt-5 border-t pt-3" style={{ borderColor: COLORS.hairline }}>
      <h3 className="uppercase" style={{ color: COLORS.muted, fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.1em" }}>
        Someday
      </h3>

      {ideas.length > 0 && (
        <ul className="mt-2 flex max-w-sm flex-col">
          {ideas.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} />
          ))}
        </ul>
      )}

      <InlineEntry
        placeholder="Type an idea, press Enter"
        onSubmit={(text) => addProjectIdeaAction(studentId, text)}
        className="mt-1 max-w-sm"
      />
    </div>
  );
}

function IdeaRow({ idea }: { idea: ProjectIdea }) {
  const [promoting, setPromoting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handlePromote() {
    setPromoting(true);
    try {
      await promoteProjectIdeaAction(idea.id);
    } finally {
      setPromoting(false);
    }
  }

  return (
    <li className="group/idea flex items-center gap-2 border-b py-1.5 text-sm last:border-b-0" style={{ borderColor: COLORS.hairline }}>
      <span className="min-w-0 flex-1 truncate" style={{ color: COLORS.text }}>
        {idea.text}
      </span>
      <TextAction onClick={handlePromote} disabled={promoting} className="shrink-0 text-xs hover:underline" style={{ color: COLORS.cobalt }}>
        {promoting ? "Starting…" : "→ Start project"}
      </TextAction>
      {confirmingDelete ? (
        <span className="flex shrink-0 items-center gap-1.5 text-xs">
          <TextAction onClick={() => deleteProjectIdeaAction(idea.id)} style={{ color: COLORS.crimson }}>
            Delete
          </TextAction>
          <TextAction onClick={() => setConfirmingDelete(false)} style={{ color: COLORS.muted }}>
            Cancel
          </TextAction>
        </span>
      ) : (
        <TextAction
          onClick={() => setConfirmingDelete(true)}
          aria-label={`Delete idea: ${idea.text}`}
          className="hr-hover-action shrink-0 text-xs"
          style={{ color: COLORS.mutedFaint }}
        >
          ×
        </TextAction>
      )}
    </li>
  );
}
