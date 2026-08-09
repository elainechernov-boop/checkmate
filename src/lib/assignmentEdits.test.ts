import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { EndCondition, Frequency } from "@/generated/prisma/enums";
import { editAllInSeries, editInstanceOnly, editSeriesThisAndFollowing } from "./assignmentEdits";
import { parseISODate, toISODate } from "./dates";
import { materializeSeries } from "./materialize";
import { makeStudent, makeSubject } from "./test/fixtures";
import { createTestClient, resetDb } from "./test/testDb";

let prisma: PrismaClient;

beforeEach(async () => {
  prisma = createTestClient();
  await resetDb(prisma);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

async function makeWeekdaysSeries(prisma: PrismaClient, title = "Math worksheet") {
  const student = await makeStudent(prisma);
  const subject = await makeSubject(prisma);
  const series = await prisma.assignmentSeries.create({
    data: {
      title,
      studentId: student.id,
      subjectId: subject.id,
      createdBy: "parent",
      startDate: parseISODate("2026-08-03"), // Monday
      endCondition: EndCondition.never,
      recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
    },
  });
  await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));
  return { series, student, subject };
}

describe("editInstanceOnly (§4 'this assignment only')", () => {
  it("detaches a single instance so it survives a later series-wide edit", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });

    await editInstanceOnly(prisma, wednesday.id, { title: "Math worksheet (extra credit)" });

    const updated = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: wednesday.id } });
    expect(updated.title).toBe("Math worksheet (extra credit)");
    expect(updated.isOverride).toBe(true);

    // A subsequent "all in series" rename must not touch it.
    await editAllInSeries(prisma, series.id, { title: "Math packet" }, parseISODate("2026-08-03"));

    const afterRegen = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: wednesday.id } });
    expect(afterRegen.title).toBe("Math worksheet (extra credit)");

    const others = await prisma.assignmentInstance.findMany({
      where: { seriesId: series.id, id: { not: wednesday.id } },
    });
    expect(others.every((i) => i.title === "Math packet")).toBe(true);
  });

  it("updates originalDueDate when the edit reschedules the instance", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const monday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-03") },
    });

    await editInstanceOnly(prisma, monday.id, { dueDate: parseISODate("2026-08-04") });

    const updated = await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: monday.id } });
    expect(toISODate(updated.dueDate!)).toBe("2026-08-04");
    expect(toISODate(updated.originalDueDate!)).toBe("2026-08-04");
  });
});

describe("editAllInSeries (§4 'all in series')", () => {
  it("propagates a title change to every future non-protected instance", async () => {
    const { series } = await makeWeekdaysSeries(prisma);

    await editAllInSeries(prisma, series.id, { title: "Math packet" }, parseISODate("2026-08-03"));

    const instances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(instances.length).toBeGreaterThan(0);
    expect(instances.every((i) => i.title === "Math packet")).toBe(true);
  });

  it("changing the recurrence rule regenerates matching instances", async () => {
    const { series } = await makeWeekdaysSeries(prisma);

    await editAllInSeries(
      prisma,
      series.id,
      { recurrence: { frequency: Frequency.weekly, daysOfWeek: "mon" } },
      parseISODate("2026-08-03")
    );

    const instances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(instances.every((i) => i.dueDate!.getUTCDay() === 1)).toBe(true);
  });
});

describe("editSeriesThisAndFollowing (§4 'this and following')", () => {
  it("splits the series: old series stops before the split date, new series carries the edit from it on", async () => {
    const { series } = await makeWeekdaysSeries(prisma);
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });

    const result = await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Math packet v2" });
    expect("newSeriesId" in result).toBe(true);
    const newSeriesId = (result as { newSeriesId: string }).newSeriesId;

    const oldSeries = await prisma.assignmentSeries.findUniqueOrThrow({ where: { id: series.id } });
    expect(oldSeries.endCondition).toBe(EndCondition.onDate);
    expect(toISODate(oldSeries.endDate!)).toBe("2026-08-04"); // day before the split

    const oldInstances = await prisma.assignmentInstance.findMany({ where: { seriesId: series.id } });
    expect(oldInstances.map((i) => toISODate(i.dueDate!)).sort()).toEqual(["2026-08-03", "2026-08-04"]);
    expect(oldInstances.every((i) => i.title === "Math worksheet")).toBe(true);

    const newInstances = await prisma.assignmentInstance.findMany({
      where: { seriesId: newSeriesId },
      orderBy: { dueDate: "asc" },
    });
    expect(newInstances[0] && toISODate(newInstances[0].dueDate!)).toBe("2026-08-05");
    expect(newInstances.every((i) => i.title === "Math packet v2")).toBe(true);
  });

  it("carries over the remaining afterNCount budget to the new series", async () => {
    const student = await makeStudent(prisma);
    const subject = await makeSubject(prisma);
    const series = await prisma.assignmentSeries.create({
      data: {
        title: "Spelling test",
        studentId: student.id,
        subjectId: subject.id,
        createdBy: "parent",
        startDate: parseISODate("2026-08-03"),
        endCondition: EndCondition.afterNCount,
        endCount: 5,
        recurrence: { create: { frequency: Frequency.weekdays, interval: 1 } },
      },
    });
    await materializeSeries(prisma, series.id, parseISODate("2026-08-03"));

    // 5 occurrences: Mon 8/3 .. Fri 8/7. Split at Wed 8/5 (2 already used).
    const wednesday = await prisma.assignmentInstance.findFirstOrThrow({
      where: { seriesId: series.id, dueDate: parseISODate("2026-08-05") },
    });
    const result = await editSeriesThisAndFollowing(prisma, wednesday.id, { title: "Spelling test v2" });
    const newSeriesId = (result as { newSeriesId: string }).newSeriesId;

    const newSeries = await prisma.assignmentSeries.findUniqueOrThrow({ where: { id: newSeriesId } });
    expect(newSeries.endCondition).toBe(EndCondition.afterNCount);
    expect(newSeries.endCount).toBe(3); // 5 - 2 already generated before the split

    const newInstances = await prisma.assignmentInstance.findMany({ where: { seriesId: newSeriesId } });
    expect(newInstances).toHaveLength(3);
  });
});
