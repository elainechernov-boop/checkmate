import type { PrismaClient } from "@/generated/prisma/client";
import { ProjectStatus } from "@/generated/prisma/enums";
import { ProjectPermissionError } from "./projects";

type ProjectIdeasPrisma = Pick<PrismaClient, "projectIdea" | "project">;

/** Loads an idea and enforces the same ownership rule as project tasks
 * (§7): a student may only touch their own ideas, never another student's. */
async function loadOwnIdea(prisma: ProjectIdeasPrisma, studentId: string, ideaId: string) {
  const idea = await prisma.projectIdea.findUniqueOrThrow({ where: { id: ideaId } });
  if (idea.studentId !== studentId) {
    throw new ProjectPermissionError("Students may only touch their own project ideas.");
  }
  return idea;
}

/** A bare line of text (§7's "someday" scratch list, one level lighter than
 * a Project) — no target date, no subject, nothing to schedule. */
export async function addProjectIdea(prisma: ProjectIdeasPrisma, studentId: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Idea text is required.");
  return prisma.projectIdea.create({ data: { studentId, text: trimmed } });
}

/** Full delete rights over their own ideas (§7) — no "are you sure" needed
 * at the data layer; the UI's own confirm (matching the sibling backlog-task
 * delete) is what actually gates this. */
export async function deleteProjectIdea(prisma: ProjectIdeasPrisma, studentId: string, ideaId: string): Promise<void> {
  await loadOwnIdea(prisma, studentId, ideaId);
  await prisma.projectIdea.delete({ where: { id: ideaId } });
}

/** "Move into projects" — turns an idea into a real, working Project (its
 * text becomes the project's name) and removes it from the ideas list. No
 * target date: promoting is a one-click "I'm doing this now," same as the
 * plain "+ New project" flow's own minimum (name only). */
export async function promoteProjectIdea(prisma: ProjectIdeasPrisma, studentId: string, ideaId: string) {
  const idea = await loadOwnIdea(prisma, studentId, ideaId);
  const project = await prisma.project.create({
    data: { studentId, name: idea.text, targetDate: null, status: ProjectStatus.active },
  });
  await prisma.projectIdea.delete({ where: { id: ideaId } });
  return project;
}
