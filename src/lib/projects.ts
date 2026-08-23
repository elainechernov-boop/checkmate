import type { PrismaClient } from "@/generated/prisma/client";
import { CreatedBy, EndCondition, Frequency, InstanceStatus, ProjectStatus } from "@/generated/prisma/enums";
import { rescheduleInstance as rescheduleInstanceLib } from "./assignmentEdits";
import { startOfUTCDay, type WeekdayCode } from "./dates";
import { materializeSeries } from "./materialize";

type ProjectsPrisma = Pick<
  PrismaClient,
  | "project"
  | "assignmentInstance"
  | "assignmentSeries"
  | "recurrenceRule"
  | "schoolDay"
  | "removedOccurrence"
  | "$transaction"
>;

export class ProjectPermissionError extends Error {}

/** Kid-sized "Plan it" menu (§7) — deliberately smaller than the parent's
 * full Repeat control (§4). "everyOtherDay" reuses `daily` + interval 2
 * rather than a dedicated Frequency value (materialize.ts §3). */
export type PlanRecurrenceChoice = "once" | "everyDay" | "everyOtherDay" | "pickDays";

export interface PlanTaskInput {
  choice: PlanRecurrenceChoice;
  startDate: Date;
  daysOfWeek?: WeekdayCode[];
  // Falls back to the project's targetDate when omitted (§7: "running until
  // the target date by default or until a chosen date").
  untilDate?: Date | null;
}

/** Loads an instance and enforces §7's ownership rule: a student may only
 * touch their own project tasks — never a parent-assigned item, and never
 * another student's. */
async function loadOwnProjectTask(prisma: ProjectsPrisma, studentId: string, taskId: string) {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: taskId } });
  if (instance.studentId !== studentId || instance.createdBy !== CreatedBy.student || !instance.projectId) {
    throw new ProjectPermissionError("Students may only modify their own project tasks.");
  }
  return instance;
}

/** §7 project completion: the project settles into "completed" the moment
 * every one of its tasks is resolved, and pops back to "active" the moment
 * that's no longer true (e.g. a new task was just added) — status always
 * reflects the current task list rather than a one-way flag. Archived
 * projects are a parent-only decision (§7 "hands-off" posture) and are left
 * alone here. */
export async function recomputeProjectStatus(prisma: ProjectsPrisma, projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.status === ProjectStatus.archived) return;

  const tasks = await prisma.assignmentInstance.findMany({ where: { projectId }, select: { status: true } });
  const allDone =
    tasks.length > 0 && tasks.every((t) => t.status === InstanceStatus.done || t.status === InstanceStatus.excused);

  if (allDone && project.status !== ProjectStatus.completed) {
    await prisma.project.update({ where: { id: projectId }, data: { status: ProjectStatus.completed } });
  } else if (!allDone && project.status === ProjectStatus.completed) {
    await prisma.project.update({ where: { id: projectId }, data: { status: ProjectStatus.active } });
  }
}

/** "+ New project" (§7) — name and an optional target date, the whole form. */
export async function createProject(
  prisma: ProjectsPrisma,
  studentId: string,
  name: string,
  targetDate: Date | null
) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required.");
  return prisma.project.create({
    data: { studentId, name: trimmed, targetDate, status: ProjectStatus.active },
  });
}

/** §7 "prioritized" — drag-reordering the project cards themselves within
 * the band, the same convention as reorderInstances.ts's day reorders.
 * `orderedIds` is trusted only for this student's own projects; anything
 * else (another student's project, a stale id) is silently dropped. */
export async function reorderProjects(prisma: ProjectsPrisma, studentId: string, orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;

  const projects = await prisma.project.findMany({ where: { id: { in: orderedIds }, studentId } });
  const validIds = new Set(projects.map((p) => p.id));
  const idsToReorder = orderedIds.filter((id) => validIds.has(id));
  if (idsToReorder.length === 0) return;

  await prisma.$transaction(
    idsToReorder.map((id, index) => prisma.project.update({ where: { id }, data: { sortOrder: index } }))
  );
}

/** A student deleting one of their own projects entirely — everything under
 * it (series, whose RecurrenceRule cascades, and instances) goes too, same
 * as Parent Mode's own delete (parent/projects/actions.ts), just
 * ownership-checked instead of unrestricted. */
export async function deleteProject(prisma: ProjectsPrisma, studentId: string, projectId: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.studentId !== studentId) {
    throw new ProjectPermissionError("Students may only delete their own projects.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.assignmentInstance.deleteMany({ where: { projectId } });
    await tx.assignmentSeries.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });
}

/** A plain to-do line, undated until the student schedules it (§7). */
export async function addBacklogTask(prisma: ProjectsPrisma, studentId: string, projectId: string, title: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  if (project.studentId !== studentId) {
    throw new ProjectPermissionError("Students may only add tasks to their own projects.");
  }
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Task title is required.");

  const instance = await prisma.assignmentInstance.create({
    data: {
      title: trimmed,
      studentId,
      projectId,
      createdBy: CreatedBy.student,
      status: InstanceStatus.open,
      dueDate: null,
    },
  });
  await recomputeProjectStatus(prisma, projectId);
  return instance;
}

function recurrenceForChoice(choice: PlanRecurrenceChoice, daysOfWeek: WeekdayCode[] | undefined) {
  if (choice === "everyDay") return { frequency: Frequency.daily, interval: 1, daysOfWeek: null as string | null };
  if (choice === "everyOtherDay") return { frequency: Frequency.daily, interval: 2, daysOfWeek: null as string | null };
  if (choice === "pickDays") {
    if (!daysOfWeek || daysOfWeek.length === 0) throw new Error("Pick at least one day.");
    return { frequency: Frequency.weekly, interval: 1, daysOfWeek: daysOfWeek.join(",") };
  }
  throw new Error("Unknown recurrence choice.");
}

/**
 * §7's "Plan it" control. "Just once" schedules the existing backlog
 * instance directly onto a day (no series, matching drag-to-day). Every
 * repeating choice promotes it into a fresh AssignmentSeries — mirroring
 * assignmentEdits.ts's promoteInstanceToSeries, but scoped to a project task
 * (subject stays nil per §3, createdBy stays 'student') and driven by the
 * kid-sized choices above instead of the parent's full Repeat menu.
 */
export async function planProjectTask(
  prisma: ProjectsPrisma,
  studentId: string,
  taskId: string,
  input: PlanTaskInput
): Promise<void> {
  const instance = await loadOwnProjectTask(prisma, studentId, taskId);
  if (instance.seriesId) throw new Error("This task is already scheduled on a repeating plan.");

  const startDate = startOfUTCDay(input.startDate);

  if (input.choice === "once") {
    await prisma.assignmentInstance.update({
      where: { id: taskId },
      data: { dueDate: startDate, originalDueDate: startDate },
    });
    await recomputeProjectStatus(prisma, instance.projectId!);
    return;
  }

  const project = await prisma.project.findUniqueOrThrow({ where: { id: instance.projectId! } });
  const untilDate = input.untilDate ?? project.targetDate;
  if (!untilDate) {
    throw new Error("Pick an end date, or set a target date on the project first.");
  }

  const recurrence = recurrenceForChoice(input.choice, input.daysOfWeek);

  const series = await prisma.assignmentSeries.create({
    data: {
      title: instance.title,
      details: instance.details,
      studentId,
      subjectId: null,
      projectId: instance.projectId,
      createdBy: CreatedBy.student,
      startDate,
      endCondition: EndCondition.onDate,
      endDate: startOfUTCDay(untilDate),
      requiresReview: false,
      recurrence: { create: recurrence },
    },
  });

  await prisma.assignmentInstance.delete({ where: { id: taskId } });
  await materializeSeries(prisma, series.id, startDate);
  await recomputeProjectStatus(prisma, instance.projectId!);
}

/** Drag-to-day (§7) and cross-day moves — a thin, ownership-checked wrapper
 * around assignmentEdits' rescheduleInstance, which already does the right
 * thing whether the task is standalone or series-linked (detaches just this
 * occurrence, same as a parent drag, §5). Also covers scheduling a backlog
 * task straight onto a day (dueDate was null; rescheduleInstance just sets it). */
export async function moveProjectTask(
  prisma: ProjectsPrisma,
  studentId: string,
  taskId: string,
  newDueDate: Date
): Promise<void> {
  const instance = await loadOwnProjectTask(prisma, studentId, taskId);
  await rescheduleInstanceLib(prisma, taskId, startOfUTCDay(newDueDate));
  await recomputeProjectStatus(prisma, instance.projectId!);
}

/** "Unschedule back to the backlog" (§7) — open tasks only; a task already
 * shown/done is a real record, not a plan to undo. If this occurrence came
 * from a repeating plan, the plan may regenerate a fresh instance for that
 * same date the next time it's re-materialized (an edit, or a day-type
 * change) — an accepted, rare edge case, consistent with how a single
 * series-linked occurrence delete already behaves elsewhere in the app. */
export async function unscheduleProjectTask(prisma: ProjectsPrisma, studentId: string, taskId: string): Promise<void> {
  const instance = await loadOwnProjectTask(prisma, studentId, taskId);
  if (instance.status !== InstanceStatus.open) {
    throw new Error("Only open tasks can be unscheduled.");
  }
  await prisma.assignmentInstance.update({
    where: { id: taskId },
    data: { dueDate: null, originalDueDate: null, rolledCount: 0, isOverride: true },
  });
  await recomputeProjectStatus(prisma, instance.projectId!);
}

/** Full delete rights over their own project tasks (§7). */
export async function deleteProjectTask(prisma: ProjectsPrisma, studentId: string, taskId: string): Promise<void> {
  const instance = await loadOwnProjectTask(prisma, studentId, taskId);
  await prisma.assignmentInstance.delete({ where: { id: taskId } });
  await recomputeProjectStatus(prisma, instance.projectId!);
}

/** Editing a plain to-do line (§7) — title only; a project task carries no
 * subject/details/estimate the way parent-assigned work does. */
export async function editProjectTaskTitle(
  prisma: ProjectsPrisma,
  studentId: string,
  taskId: string,
  title: string
): Promise<void> {
  const instance = await loadOwnProjectTask(prisma, studentId, taskId);
  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title is required.");
  await prisma.assignmentInstance.update({
    where: { id: taskId },
    data: { title: trimmed, isOverride: instance.seriesId ? true : instance.isOverride },
  });
}
