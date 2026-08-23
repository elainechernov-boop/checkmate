import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { addProjectIdea, deleteProjectIdea, promoteProjectIdea } from "./projectIdeas";
import { ProjectPermissionError } from "./projects";
import { makeStudent } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("addProjectIdea", () => {
  it("creates a plain text idea for the student", async () => {
    const student = await makeStudent(prisma);
    const idea = await addProjectIdea(prisma, student.id, "  Learn to juggle  ");
    expect(idea.text).toBe("Learn to juggle");
    expect(idea.studentId).toBe(student.id);
  });

  it("rejects blank text", async () => {
    const student = await makeStudent(prisma);
    await expect(addProjectIdea(prisma, student.id, "   ")).rejects.toThrow();
  });
});

describe("deleteProjectIdea", () => {
  it("removes the idea", async () => {
    const student = await makeStudent(prisma);
    const idea = await addProjectIdea(prisma, student.id, "Build a birdhouse");
    await deleteProjectIdea(prisma, student.id, idea.id);
    const found = await prisma.projectIdea.findUnique({ where: { id: idea.id } });
    expect(found).toBeNull();
  });

  it("rejects deleting another student's idea", async () => {
    const owner = await makeStudent(prisma, { name: "Miles" });
    const intruder = await makeStudent(prisma, { name: "Nora" });
    const idea = await addProjectIdea(prisma, owner.id, "Owner's idea");
    await expect(deleteProjectIdea(prisma, intruder.id, idea.id)).rejects.toThrow(ProjectPermissionError);
    const stillThere = await prisma.projectIdea.findUnique({ where: { id: idea.id } });
    expect(stillThere).not.toBeNull();
  });
});

describe("promoteProjectIdea", () => {
  it("turns the idea into a real project and removes it from the list", async () => {
    const student = await makeStudent(prisma);
    const idea = await addProjectIdea(prisma, student.id, "Learn Clair de Lune");

    const project = await promoteProjectIdea(prisma, student.id, idea.id);

    expect(project.name).toBe("Learn Clair de Lune");
    expect(project.studentId).toBe(student.id);
    expect(project.status).toBe("active");
    expect(project.targetDate).toBeNull();

    const ideaGone = await prisma.projectIdea.findUnique({ where: { id: idea.id } });
    expect(ideaGone).toBeNull();
  });

  it("rejects promoting another student's idea", async () => {
    const owner = await makeStudent(prisma, { name: "Miles" });
    const intruder = await makeStudent(prisma, { name: "Nora" });
    const idea = await addProjectIdea(prisma, owner.id, "Owner's idea");
    await expect(promoteProjectIdea(prisma, intruder.id, idea.id)).rejects.toThrow(ProjectPermissionError);
  });
});
