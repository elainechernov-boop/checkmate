"use server";

import { revalidatePath } from "next/cache";
import { getScopedPrisma } from "@/lib/prisma";
import { createProject } from "@/lib/projects";

/**
 * Elaine's revised call (2026-09-08): kids get project *authoring* back —
 * "Start a new project" — but not task authoring. Everything under a
 * project (backlog steps, scheduling, rename, delete, reorder) stays
 * parent-only in /parent/projects (see that route's actions.ts); this is
 * the one deliberately narrow exception, scoped with getScopedPrisma() the
 * same as every other student-route action (toggleInstance etc.) rather
 * than requireParentSession(), since a student is exactly who should be
 * able to call it.
 */
export async function createProjectAction(studentId: string, name: string): Promise<void> {
  const prisma = await getScopedPrisma();
  await createProject(prisma, studentId, name, null);
  revalidatePath(`/student/${studentId}`);
}
