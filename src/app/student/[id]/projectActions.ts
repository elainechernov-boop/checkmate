"use server";

import { revalidatePath } from "next/cache";
import { parseISODate, type WeekdayCode } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import {
  addBacklogTask,
  createProject,
  deleteProjectTask,
  editProjectTaskTitle,
  moveProjectTask,
  planProjectTask,
  unscheduleProjectTask,
  type PlanRecurrenceChoice,
} from "@/lib/projects";

export async function createProjectAction(studentId: string, name: string, targetDateISO: string | null) {
  await createProject(prisma, studentId, name, targetDateISO ? parseISODate(targetDateISO) : null);
  revalidatePath(`/student/${studentId}`);
}

export async function addBacklogTaskAction(studentId: string, projectId: string, title: string) {
  await addBacklogTask(prisma, studentId, projectId, title);
  revalidatePath(`/student/${studentId}`);
}

export async function planProjectTaskAction(
  studentId: string,
  taskId: string,
  choice: PlanRecurrenceChoice,
  startDateISO: string,
  daysOfWeek: WeekdayCode[],
  untilDateISO: string | null
) {
  await planProjectTask(prisma, studentId, taskId, {
    choice,
    startDate: parseISODate(startDateISO),
    daysOfWeek,
    untilDate: untilDateISO ? parseISODate(untilDateISO) : null,
  });
  revalidatePath(`/student/${studentId}`);
}

/** Drag-to-day, and dragging an already-scheduled task to a different day. */
export async function moveProjectTaskAction(studentId: string, taskId: string, newDueDateISO: string) {
  await moveProjectTask(prisma, studentId, taskId, parseISODate(newDueDateISO));
  revalidatePath(`/student/${studentId}`);
}

export async function unscheduleProjectTaskAction(studentId: string, taskId: string) {
  await unscheduleProjectTask(prisma, studentId, taskId);
  revalidatePath(`/student/${studentId}`);
}

export async function deleteProjectTaskAction(studentId: string, taskId: string) {
  await deleteProjectTask(prisma, studentId, taskId);
  revalidatePath(`/student/${studentId}`);
}

export async function editProjectTaskTitleAction(studentId: string, taskId: string, title: string) {
  await editProjectTaskTitle(prisma, studentId, taskId, title);
  revalidatePath(`/student/${studentId}`);
}
