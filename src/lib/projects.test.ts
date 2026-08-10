import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { parseISODate, toISODate } from "./dates";
import {
  ProjectPermissionError,
  addBacklogTask,
  createProject,
  deleteProjectTask,
  editProjectTaskTitle,
  moveProjectTask,
  planProjectTask,
} from "./projects";
import { rollOverdueInstances } from "./rollForward";
import { makeStudent, markSchoolDay } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe("planProjectTask (§7 Plan-it)", () => {
  it("generates an every-other-day plan until the project's target date", async () => {
    const student = await makeStudent(prisma);
    const project = await createProject(prisma, student.id, "Learn Clair de Lune", parseISODate("2026-08-21"));
    const task = await addBacklogTask(prisma, student.id, project.id, "Practice 20 minutes");

    await planProjectTask(prisma, student.id, task.id, {
      choice: "everyOtherDay",
      startDate: parseISODate("2026-08-08"), // a Saturday
    });

    const instances = await prisma.assignmentInstance.findMany({
      where: { projectId: project.id },
      orderBy: { dueDate: "asc" },
    });

    // Every other calendar day from Aug 8 through Aug 21 (the target date),
    // inclusive: 8, 10, 12, 14, then 16 is a Sunday (never a candidate day —
    // the week view has no column for it) so it shifts to 17, then 19, 21.
    expect(instances.map((i) => toISODate(i.dueDate!))).toEqual([
      "2026-08-08",
      "2026-08-10",
      "2026-08-12",
      "2026-08-14",
      "2026-08-17",
      "2026-08-19",
      "2026-08-21",
    ]);
    // The original backlog placeholder is gone — replaced by the series' own instances.
    expect(instances.every((i) => i.seriesId)).toBe(true);
    // Project-series instances never carry a subject (§3).
    expect(instances.every((i) => i.subjectId === null)).toBe(true);
  });

  it("skips a blocked day the same way a parent series does, then keeps its cadence from there", async () => {
    const student = await makeStudent(prisma);
    const project = await createProject(prisma, student.id, "Learn Clair de Lune", parseISODate("2026-08-14"));
    const task = await addBacklogTask(prisma, student.id, project.id, "Practice");
    await markSchoolDay(prisma, student.id, parseISODate("2026-08-10"), "sick"); // would've been the 2nd occurrence

    await planProjectTask(prisma, student.id, task.id, {
      choice: "everyOtherDay",
      startDate: parseISODate("2026-08-08"),
    });

    const instances = await prisma.assignmentInstance.findMany({
      where: { projectId: project.id },
      orderBy: { dueDate: "asc" },
    });
    expect(instances.map((i) => toISODate(i.dueDate!))).not.toContain("2026-08-10");
    expect(toISODate(instances[0].dueDate!)).toBe("2026-08-08");
  });

  it("'Every day' never schedules onto a Sunday — the week view has no column for it", async () => {
    const student = await makeStudent(prisma);
    const project = await createProject(prisma, student.id, "Read every day", parseISODate("2026-08-16"));
    const task = await addBacklogTask(prisma, student.id, project.id, "Read 15 minutes");

    await planProjectTask(prisma, student.id, task.id, { choice: "everyDay", startDate: parseISODate("2026-08-10") });

    const instances = await prisma.assignmentInstance.findMany({ where: { projectId: project.id } });
    expect(instances.some((i) => i.dueDate!.getUTCDay() === 0)).toBe(false);
  });

  it("'Just once' sets a due date directly with no series", async () => {
    const student = await makeStudent(prisma);
    const project = await createProject(prisma, student.id, "Bake bread", null);
    const task = await addBacklogTask(prisma, student.id, project.id, "Bake it");

    await planProjectTask(prisma, student.id, task.id, { choice: "once", startDate: parseISODate("2026-08-12") });

    const updated = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: task.id } });
    expect(updated.seriesId).toBeNull();
    expect(toISODate(updated.dueDate!)).toBe("2026-08-12");
  });

  it("throws when there's no target date and no chosen end date", async () => {
    const student = await makeStudent(prisma);
    const project = await createProject(prisma, student.id, "Untargeted", null);
    const task = await addBacklogTask(prisma, student.id, project.id, "Practice");

    await expect(
      planProjectTask(prisma, student.id, task.id, { choice: "everyDay", startDate: parseISODate("2026-08-08") })
    ).rejects.toThrow();
  });
});

describe("a scheduled backlog task rolls forward like any other open item", () => {
  it("moves a backlog task onto a day, then rolls it when it goes overdue", async () => {
    const student = await makeStudent(prisma);
    const project = await createProject(prisma, student.id, "Piano", null);
    const task = await addBacklogTask(prisma, student.id, project.id, "Scales");

    await moveProjectTask(prisma, student.id, task.id, parseISODate("2026-08-07")); // a Friday

    const scheduled = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: task.id } });
    expect(toISODate(scheduled.dueDate!)).toBe("2026-08-07");

    await markSchoolDay(prisma, student.id, parseISODate("2026-08-08"), "offDay");
    await markSchoolDay(prisma, student.id, parseISODate("2026-08-09"), "offDay");
    const result = await rollOverdueInstances(prisma, student.id, parseISODate("2026-08-10"));

    expect(result.rolledCount).toBe(1);
    const rolled = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: task.id } });
    expect(toISODate(rolled.dueDate!)).toBe("2026-08-10");
    expect(rolled.rolledCount).toBe(1);
  });
});

describe("permission checks (§2/§7): students cannot touch parent-assigned items", () => {
  async function makeParentInstance(studentId: string) {
    return prisma.assignmentInstance.create({
      data: {
        title: "Math worksheet",
        studentId,
        createdBy: "parent",
        dueDate: parseISODate("2026-08-10"),
        originalDueDate: parseISODate("2026-08-10"),
        status: "open",
      },
    });
  }

  it("rejects moving a parent-assigned instance", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeParentInstance(student.id);
    await expect(moveProjectTask(prisma, student.id, instance.id, parseISODate("2026-08-11"))).rejects.toThrow(
      ProjectPermissionError
    );
  });

  it("rejects editing a parent-assigned instance's title", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeParentInstance(student.id);
    await expect(editProjectTaskTitle(prisma, student.id, instance.id, "Hacked")).rejects.toThrow(
      ProjectPermissionError
    );
  });

  it("rejects deleting a parent-assigned instance", async () => {
    const student = await makeStudent(prisma);
    const instance = await makeParentInstance(student.id);
    await expect(deleteProjectTask(prisma, student.id, instance.id)).rejects.toThrow(ProjectPermissionError);
    const stillThere = await prisma.assignmentInstance.findUnique({ where: { id: instance.id } });
    expect(stillThere).not.toBeNull();
  });

  it("rejects a student touching another student's project task", async () => {
    const owner = await makeStudent(prisma, { name: "Miles" });
    const intruder = await makeStudent(prisma, { name: "Nora" });
    const project = await createProject(prisma, owner.id, "Owner's project", null);
    const task = await addBacklogTask(prisma, owner.id, project.id, "Owner's task");

    await expect(editProjectTaskTitle(prisma, intruder.id, task.id, "Not yours")).rejects.toThrow(
      ProjectPermissionError
    );
  });
});
