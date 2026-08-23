"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { addProjectIdea, deleteProjectIdea, promoteProjectIdea } from "@/lib/projectIdeas";

export async function addProjectIdeaAction(studentId: string, text: string) {
  await addProjectIdea(prisma, studentId, text);
  revalidatePath(`/student/${studentId}`);
}

export async function deleteProjectIdeaAction(studentId: string, ideaId: string) {
  await deleteProjectIdea(prisma, studentId, ideaId);
  revalidatePath(`/student/${studentId}`);
}

/** "Move into projects" (§7) — promotes the idea into a real Project. */
export async function promoteProjectIdeaAction(studentId: string, ideaId: string) {
  await promoteProjectIdea(prisma, studentId, ideaId);
  revalidatePath(`/student/${studentId}`);
}
