"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { Student } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { addDays, toISODate } from "@/lib/dates";
import { COLORS } from "@/lib/theme";
import { isSoundMuted, playCompletionTick, setSoundMuted } from "@/lib/completionSound";
import { approveReviewViaPasscode, reorderOpenItems, toggleInstance } from "./actions";
import { moveProjectTaskAction } from "./projectActions";
import { DayColumn } from "./DayColumn";
import { ComingUpPanel } from "./ComingUpPanel";
import { AssignmentDetailsModal } from "./AssignmentDetailsModal";
import { ItemCelebration } from "./ItemCelebration";
import { NewProjectModal } from "./NewProjectModal";
import { PlanTaskModal } from "./PlanTaskModal";
import { ProjectsBand } from "./ProjectsBand";
import type { StudentInstance, StudentProject } from "./types";

const REFRESH_INTERVAL_MS = 60_000;

export function StudentWeekView({
  student,
  monday,
  today,
  instances,
  comingUp,
  projects,
  skipCelebratedGuard,
}: {
  student: Student;
  monday: Date;
  today: Date;
  instances: StudentInstance[];
  comingUp: StudentInstance[];
  projects: StudentProject[];
  skipCelebratedGuard: boolean;
}) {
  const router = useRouter();
  const prefersReducedMotion = !!useReducedMotion();
  const bandSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [localInstances, setLocalInstances] = useState(instances);
  const [syncedInstances, setSyncedInstances] = useState(instances);
  const [localProjects, setLocalProjects] = useState(projects);
  const [syncedProjects, setSyncedProjects] = useState(projects);
  const [comingUpOpen, setComingUpOpen] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [planTaskId, setPlanTaskId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [celebratedToday, setCelebratedToday] = useState(true); // avoid a flash before the effect below settles
  const [itemCelebration, setItemCelebration] = useState<{ key: number; origin: { x: number; y: number } } | null>(
    null
  );

  const todayISO = toISODate(today);
  const celebratedKey = `checkmate:celebrated:${student.id}:${todayISO}`;

  // Reset local (optimistic) state when the server hands us a fresh
  // `instances` prop (a week change or the 60s refresh) — done during
  // render, per React's guidance, rather than in an effect.
  if (instances !== syncedInstances) {
    setSyncedInstances(instances);
    setLocalInstances(instances);
  }
  if (projects !== syncedProjects) {
    setSyncedProjects(projects);
    setLocalProjects(projects);
  }

  // §5 step 3: "the full completion sequence... plays on the student's
  // screen at next refresh." A student's own toggle (actions.ts) never
  // produces a pendingReview -> done transition — only an external approval
  // (Parent Mode, or someone else's passcode popover) does — so spotting one
  // here is an unambiguous signal to play the reward now. This needs the
  // real previous props (not the render-time state above, which may have
  // already been overwritten this same render), so it runs as an effect —
  // playing a sound and reading window dimensions are side effects anyway.
  const previousInstancesRef = useRef(instances);
  useEffect(() => {
    const previous = previousInstancesRef.current;
    if (previous !== instances) {
      const previousStatusById = new Map(previous.map((i) => [i.id, i.status]));
      const approvedElsewhere = instances.find(
        (i) => previousStatusById.get(i.id) === InstanceStatus.pendingReview && i.status === InstanceStatus.done
      );
      if (approvedElsewhere) {
        playCompletionTick();
        if (!prefersReducedMotion) {
          // A genuine "external system changed, react to it" case (§5 step
          // 3) — there's no user gesture to hang this off, so the effect
          // itself is the right place, matching the isSoundMuted() read below.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItemCelebration({ key: Date.now(), origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
        }
      }
      previousInstancesRef.current = instances;
    }
  }, [instances, prefersReducedMotion]);

  useEffect(() => {
    // Browser-only reads (localStorage), deferred past hydration so the
    // server-rendered markup and the first client render still match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(isSoundMuted());
    // With DEBUG_TODAY pinned, "today" never actually advances, so this
    // flag would never naturally clear — always start uncelebrated so the
    // day-complete moment can be re-tested as many times as needed.
    setCelebratedToday(skipCelebratedGuard ? false : window.localStorage.getItem(celebratedKey) === "1");
  }, [celebratedKey, skipCelebratedGuard]);

  // §1: a light 60-second background refresh, so a morning edit appears
  // without the student touching anything.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [router]);

  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => addDays(monday, i)), [monday]);
  const weekHasAnyItems = localInstances.length > 0;
  // A backlog task needs somewhere to be dropped, even on an otherwise
  // silent week (§9's "an empty week shows nothing at all" is about there
  // being nothing to plan, not about hiding valid drop targets).
  const hasBacklogTasks = localProjects.some((p) => p.backlogTasks.length > 0);
  const planTask = localProjects.flatMap((p) => p.backlogTasks).find((t) => t.id === planTaskId) ?? null;
  const planTaskProject = planTask ? localProjects.find((p) => p.id === planTask.projectId) ?? null : null;
  // The week view is Mon-Sat (§6) — on a Sunday there's no column that
  // equals "today" at all, so nothing is interactive. Say so plainly
  // (this is a fact about the real today, not about whichever week is
  // currently being browsed) instead of leaving a silent grid that reads
  // as broken.
  const todayIsSunday = today.getUTCDay() === 0;

  function handleCelebrate() {
    if (skipCelebratedGuard) return; // stay re-testable while pinned to a fixed debug date
    setCelebratedToday(true);
    window.localStorage.setItem(celebratedKey, "1");
  }

  async function handleToggle(instance: StudentInstance, origin: { x: number; y: number }) {
    const goingToOpen = instance.status !== InstanceStatus.open;
    const nextStatus = goingToOpen
      ? InstanceStatus.open
      : instance.requiresReview
        ? InstanceStatus.pendingReview
        : InstanceStatus.done;

    // The per-item "something REALLY fun" moment (§6) — a genuine, no-review
    // completion only. Entering pendingReview or undoing stays quiet: §5's
    // "the reward lands only when the work has been shown" still holds.
    if (!goingToOpen && nextStatus === InstanceStatus.done && !prefersReducedMotion) {
      setItemCelebration({ key: Date.now(), origin });
    }

    setLocalInstances((current) =>
      current.map((i) => (i.id === instance.id ? { ...i, status: nextStatus } : i))
    );

    try {
      await toggleInstance(instance.id);
    } catch {
      // Server rejected it (e.g. no longer "today") — revert.
      setLocalInstances((current) =>
        current.map((i) => (i.id === instance.id ? { ...i, status: instance.status } : i))
      );
    }
  }

  async function handleReorderOpen(orderedIds: string[]) {
    const previous = localInstances;
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    setLocalInstances((current) =>
      current.map((i) => (order.has(i.id) ? { ...i, sortOrder: order.get(i.id)! } : i))
    );
    try {
      await reorderOpenItems(student.id, orderedIds);
    } catch {
      setLocalInstances(previous);
    }
  }

  // §5 step 2's passcode popover — approval happens right here on the
  // student's own screen, so (unlike the refresh-detected approval path
  // below) the full completion sequence fires immediately rather than
  // waiting for the next poll.
  async function handleApproveViaPasscode(
    instance: StudentInstance,
    passcode: string,
    origin: { x: number; y: number }
  ) {
    await approveReviewViaPasscode(instance.id, passcode); // throws on a wrong passcode; caller shows the error

    playCompletionTick();
    if (!prefersReducedMotion) setItemCelebration({ key: Date.now(), origin });
    setLocalInstances((current) =>
      current.map((i) => (i.id === instance.id ? { ...i, status: InstanceStatus.done, reviewedAt: new Date() } : i))
    );
  }

  /**
   * §7 drag-to-day, covering both ends of a project task's life: a
   * Projects-band backlog task dropped on a day column for the first time,
   * and an *already-scheduled* project task dragged onto a different day to
   * move it — DayColumn's own draggable-project-row (for non-today cells;
   * today's own reorder DndContext handles today's rows separately, so the
   * two never register the same draggable/droppable). Parent-assigned rows
   * never register as draggables here at all, so there's nothing to guard
   * against a student moving those.
   */
  async function handleWeekDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const taskId = String(active.id);
    const dateISO = String(over.id);
    const targetDay = days.find((day) => toISODate(day) === dateISO);
    if (!targetDay) return;

    let backlogTask: StudentInstance | null = null;
    for (const project of localProjects) {
      const found = project.backlogTasks.find((t) => t.id === taskId);
      if (found) {
        backlogTask = found;
        break;
      }
    }

    if (backlogTask) {
      const scheduledTask = backlogTask;
      setLocalProjects((current) =>
        current.map((p) =>
          p.id === scheduledTask.projectId ? { ...p, backlogTasks: p.backlogTasks.filter((t) => t.id !== taskId) } : p
        )
      );
      setLocalInstances((current) => [
        ...current,
        { ...scheduledTask, dueDate: targetDay, originalDueDate: targetDay },
      ]);

      try {
        await moveProjectTaskAction(student.id, taskId, dateISO);
      } catch {
        setLocalProjects((current) =>
          current.map((p) =>
            p.id === scheduledTask.projectId ? { ...p, backlogTasks: [...p.backlogTasks, scheduledTask] } : p
          )
        );
        setLocalInstances((current) => current.filter((i) => i.id !== taskId));
      }
      return;
    }

    // Not in any backlog — an already-scheduled project task being moved to
    // a different day instead.
    const scheduled = localInstances.find((i) => i.id === taskId);
    if (!scheduled || !scheduled.dueDate || toISODate(scheduled.dueDate) === dateISO) return;
    const previousDueDate = scheduled.dueDate;
    const previousOriginalDueDate = scheduled.originalDueDate;

    setLocalInstances((current) =>
      current.map((i) => (i.id === taskId ? { ...i, dueDate: targetDay, originalDueDate: targetDay } : i))
    );

    try {
      await moveProjectTaskAction(student.id, taskId, dateISO);
    } catch {
      setLocalInstances((current) =>
        current.map((i) =>
          i.id === taskId ? { ...i, dueDate: previousDueDate, originalDueDate: previousOriginalDueDate } : i
        )
      );
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  }

  const selectedInstance = localInstances.find((i) => i.id === selectedInstanceId) ?? null;

  return (
    <main style={{ background: COLORS.background, color: COLORS.text }} className="min-h-screen px-10 py-10">
      <header className="flex items-start justify-between">
        <h1 className="text-2xl font-medium" style={{ color: student.accentColor }}>
          {student.name}&rsquo;s week
        </h1>
        <div className="flex items-center gap-6 text-sm">
          <button onClick={() => setComingUpOpen(true)} className="hover:underline" style={{ color: COLORS.muted }}>
            Coming Up
          </button>
          <button
            onClick={toggleMute}
            aria-label={muted ? "Turn completion sound on" : "Turn completion sound off"}
            className="text-base"
            style={{ color: COLORS.muted }}
          >
            {muted ? "🔈" : "🔊"}
          </button>
          <StudentMenu />
        </div>
      </header>

      <div className="mt-8 flex items-center justify-between text-sm">
        <Link
          href={`/student/${student.id}?week=${toISODate(addDays(monday, -7))}`}
          className="px-1 hover:underline"
          style={{ color: COLORS.muted }}
        >
          ← Prev week
        </Link>
        <Link
          href={`/student/${student.id}?week=${toISODate(addDays(monday, 7))}`}
          className="px-1 hover:underline"
          style={{ color: COLORS.muted }}
        >
          Next week →
        </Link>
      </div>

      {todayIsSunday && (
        <p className="mt-3 text-sm" style={{ color: COLORS.mutedFaint }}>
          No school today — nothing here is checkable until Monday.
        </p>
      )}

      <DndContext sensors={bandSensors} onDragEnd={handleWeekDragEnd}>
        {(weekHasAnyItems || hasBacklogTasks) && (
          <div className="mt-8 grid grid-cols-6 gap-6">
            {days.map((day) => {
              const dayISO = toISODate(day);
              const dayInstances = localInstances.filter((i) => i.dueDate && toISODate(i.dueDate) === dayISO);
              const isToday = dayISO === todayISO;
              return (
                <DayColumn
                  key={dayISO}
                  day={day}
                  isToday={isToday}
                  interactive={isToday}
                  instances={dayInstances}
                  studentName={student.name}
                  accentColor={student.accentColor}
                  prefersReducedMotion={prefersReducedMotion}
                  celebrated={celebratedToday}
                  onCelebrate={handleCelebrate}
                  onToggle={handleToggle}
                  onOpenDetails={(instance) => setSelectedInstanceId(instance.id)}
                  onReorderOpen={handleReorderOpen}
                  onApproveViaPasscode={handleApproveViaPasscode}
                />
              );
            })}
          </div>
        )}

        <ProjectsBand
          studentId={student.id}
          accentColor={student.accentColor}
          projects={localProjects}
          onPlanTask={(task) => setPlanTaskId(task.id)}
          onNewProject={() => setNewProjectOpen(true)}
          prefersReducedMotion={prefersReducedMotion}
        />
      </DndContext>

      <ComingUpPanel
        open={comingUpOpen}
        onClose={() => setComingUpOpen(false)}
        items={comingUp}
        prefersReducedMotion={prefersReducedMotion}
      />

      <AssignmentDetailsModal
        studentId={student.id}
        instance={selectedInstance}
        onClose={() => setSelectedInstanceId(null)}
        prefersReducedMotion={prefersReducedMotion}
      />

      <PlanTaskModal
        task={planTask}
        studentId={student.id}
        defaultUntilDate={planTaskProject?.targetDate ?? null}
        today={today}
        onClose={() => setPlanTaskId(null)}
        prefersReducedMotion={prefersReducedMotion}
      />

      <NewProjectModal
        studentId={student.id}
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        prefersReducedMotion={prefersReducedMotion}
      />

      {itemCelebration && (
        <ItemCelebration
          key={itemCelebration.key}
          origin={itemCelebration.origin}
          onDone={() => setItemCelebration(null)}
        />
      )}
    </main>
  );
}

/** "Switch student" tucked behind a small "⋯" menu rather than sitting
 * next to the student's name — it's used rarely, so it shouldn't visually
 * compete with the week itself. */
function StudentMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen((current) => !current)}
        aria-label="Menu"
        aria-expanded={open}
        className="text-base leading-none"
        style={{ color: COLORS.mutedFaint }}
      >
        ⋯
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded border py-1 shadow-sm"
          style={{ borderColor: COLORS.hairline, background: COLORS.background }}
        >
          <Link
            href="/"
            className="block px-3 py-1.5 text-sm hover:underline"
            style={{ color: COLORS.muted }}
          >
            ← Switch student
          </Link>
          <Link
            href="/parent"
            className="block px-3 py-1.5 text-sm hover:underline"
            style={{ color: COLORS.muted }}
          >
            Parent Mode
          </Link>
        </div>
      )}
    </div>
  );
}
