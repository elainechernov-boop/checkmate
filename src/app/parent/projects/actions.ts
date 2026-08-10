"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseISODate } from "@/lib/dates";
import { createProject } from "@/lib/projects";

/** §7 lets students build their own projects; this gives the parent a way
 * to start one on a student's behalf — title (and optional target date)
 * only, same as the student's own "+ New project" form — so the student
 * finds it waiting in their own Projects band and fills in the tasks. */
export async function createProjectForStudentAction(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const targetDateISO = String(formData.get("targetDate") ?? "");
  if (!studentId || !name) return;

  await createProject(prisma, studentId, name, targetDateISO ? parseISODate(targetDateISO) : null);
  revalidatePath("/parent/projects");
}

/** §7 "Optionally, the parent can assign a subject to a project" — the
 * project's completed tasks then feed into the HST report's activity log
 * under that subject; untagged projects stay out of all compliance
 * reporting (§7, §8). */
export async function setProjectSubjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const subjectId = String(formData.get("subjectId") ?? "") || null;
  if (!projectId) return;

  await prisma.project.update({ where: { id: projectId }, data: { subjectId } });
  revalidatePath("/parent/projects");
}

/** §7 "can edit or delete anything inappropriate" — removes the project and
 * everything under it (its series, whose RecurrenceRule cascades, and its
 * instances) rather than leaving orphaned rows with a nulled projectId. */
export async function deleteProjectAction(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  if (!projectId) return;

  await prisma.$transaction(async (tx) => {
    await tx.assignmentInstance.deleteMany({ where: { projectId } });
    await tx.assignmentSeries.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });

  revalidatePath("/parent/projects");
  revalidatePath("/parent");
}
