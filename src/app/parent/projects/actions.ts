"use server";

import { revalidatePath } from "next/cache";
import { ProjectStatus } from "@/generated/prisma/enums";
import { parseISODate, type WeekdayCode } from "@/lib/dates";
import { getScopedPrisma } from "@/lib/prisma";
import { addProjectIdea, deleteProjectIdea, promoteProjectIdea } from "@/lib/projectIdeas";
import {
  addBacklogTask,
  createProject,
  deleteProject,
  deleteProjectTask,
  editProjectName,
  editProjectTargetDate,
  editProjectTaskTitle,
  moveProjectTask,
  planProjectTask,
  reorderProjects,
  unscheduleProjectTask,
  type PlanRecurrenceChoice,
} from "@/lib/projects";
import { requireParentSession } from "@/lib/session";

/**
 * HOMEROOM_UX_MIGRATION.md §5.12/§11 — Parent Projects is now the sole
 * complete authoring surface for projects, ideas, and backlog steps
 * (Elaine's decision: students cannot create tasks). Every mutation here
 * calls `requireParentSession()` first — the `/parent/**` middleware guard
 * already blocks a plain page visit without a parent session, but "UI
 * removal alone is not an authorization boundary": these are the actual
 * server actions students' own project tools used to call directly, so
 * each one re-checks for itself rather than trusting that only an
 * authorized page could have reached it.
 *
 * The underlying lib/projects.ts and lib/projectIdeas.ts functions still
 * take a `studentId` and throw ProjectPermissionError on a mismatch — that
 * ownership check stays meaningful even called from here (it's what stops
 * a stale/tampered project id from one student's board silently acting on
 * another's), so each action below looks up the project/task/idea's real
 * owning student first and passes that through unchanged.
 */

type ScopedPrisma = Awaited<ReturnType<typeof getScopedPrisma>>;

async function studentIdForProject(prisma: ScopedPrisma, projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { studentId: true } });
  return project.studentId;
}

async function studentIdForTask(prisma: ScopedPrisma, taskId: string): Promise<string> {
  const instance = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: taskId }, select: { studentId: true } });
  return instance.studentId;
}

async function studentIdForIdea(prisma: ScopedPrisma, ideaId: string): Promise<string> {
  const idea = await prisma.projectIdea.findUniqueOrThrow({ where: { id: ideaId }, select: { studentId: true } });
  return idea.studentId;
}

export async function createProjectAction(studentId: string, name: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  await createProject(prisma, studentId, name, null);
  revalidatePath("/parent/projects");
}

export async function renameProjectAction(projectId: string, name: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForProject(prisma, projectId);
  await editProjectName(prisma, studentId, projectId, name);
  revalidatePath("/parent/projects");
}

export async function setProjectTargetDateAction(projectId: string, targetDateISO: string | null) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForProject(prisma, projectId);
  await editProjectTargetDate(prisma, studentId, projectId, targetDateISO ? parseISODate(targetDateISO) : null);
  revalidatePath("/parent/projects");
}

/** §7 "Optionally, the parent can assign a subject to a project" — feeds
 * the project's completed work into the HST report under that subject;
 * untagged projects stay out of compliance reporting entirely. */
export async function setProjectSubjectAction(projectId: string, subjectId: string | null) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  await prisma.project.update({ where: { id: projectId }, data: { subjectId } });
  revalidatePath("/parent/projects");
}

/** "Mark/restore project status" (§5.12) — archiving sets it aside without
 * deleting it; restoring returns it to the active band. Recomputing status
 * off task completion (recomputeProjectStatus) is untouched by this — that
 * still owns the active/completed transition; this is the parent's own
 * archived/active toggle on top of it. */
export async function setProjectArchivedAction(projectId: string, archived: boolean) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  await prisma.project.update({
    where: { id: projectId },
    data: { status: archived ? ProjectStatus.archived : ProjectStatus.active },
  });
  revalidatePath("/parent/projects");
}

export async function deleteProjectAction(projectId: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForProject(prisma, projectId);
  await deleteProject(prisma, studentId, projectId);
  revalidatePath("/parent/projects");
  revalidatePath("/parent");
}

export async function reorderProjectsAction(studentId: string, orderedIds: string[]) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  await reorderProjects(prisma, studentId, orderedIds);
  revalidatePath("/parent/projects");
}

export async function addBacklogTaskAction(projectId: string, title: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForProject(prisma, projectId);
  await addBacklogTask(prisma, studentId, projectId, title);
  revalidatePath("/parent/projects");
}

export async function editProjectTaskTitleAction(taskId: string, title: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForTask(prisma, taskId);
  await editProjectTaskTitle(prisma, studentId, taskId, title);
  revalidatePath("/parent/projects");
}

export async function deleteProjectTaskAction(taskId: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForTask(prisma, taskId);
  await deleteProjectTask(prisma, studentId, taskId);
  revalidatePath("/parent/projects");
}

export async function planProjectTaskAction(
  taskId: string,
  choice: PlanRecurrenceChoice,
  startDateISO: string,
  daysOfWeek: WeekdayCode[],
  untilDateISO: string | null
) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForTask(prisma, taskId);
  await planProjectTask(prisma, studentId, taskId, {
    choice,
    startDate: parseISODate(startDateISO),
    daysOfWeek,
    untilDate: untilDateISO ? parseISODate(untilDateISO) : null,
  });
  revalidatePath("/parent/projects");
  revalidatePath("/parent");
}

export async function moveProjectTaskAction(taskId: string, newDueDateISO: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForTask(prisma, taskId);
  await moveProjectTask(prisma, studentId, taskId, parseISODate(newDueDateISO));
  revalidatePath("/parent/projects");
  revalidatePath("/parent");
}

export async function unscheduleProjectTaskAction(taskId: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForTask(prisma, taskId);
  await unscheduleProjectTask(prisma, studentId, taskId);
  revalidatePath("/parent/projects");
  revalidatePath("/parent");
}

export async function addProjectIdeaAction(studentId: string, text: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  await addProjectIdea(prisma, studentId, text);
  revalidatePath("/parent/projects");
}

export async function deleteProjectIdeaAction(ideaId: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForIdea(prisma, ideaId);
  await deleteProjectIdea(prisma, studentId, ideaId);
  revalidatePath("/parent/projects");
}

export async function promoteProjectIdeaAction(ideaId: string) {
  await requireParentSession();
  const prisma = await getScopedPrisma();
  const studentId = await studentIdForIdea(prisma, ideaId);
  await promoteProjectIdea(prisma, studentId, ideaId);
  revalidatePath("/parent/projects");
}
