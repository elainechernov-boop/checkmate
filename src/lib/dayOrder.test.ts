import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { InstanceStatus } from "@/generated/prisma/enums";
import { compareDayRows, healTiedDayOrder, orderDayRows, planTieRepairs, type RepairableRow } from "./dayOrder";
import { splitBySeparators } from "./daySeparators";
import { parseISODate } from "./dates";
import { bucketDayInstances } from "./instanceGrouping";
import { extendAllMaterializationHorizons } from "./materialize";
import { rollOverdueInstances } from "./rollForward";
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

const at = (n: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, n));

describe("compareDayRows — the one tie-break (§14)", () => {
  it("orders by position first", () => {
    expect(compareDayRows({ id: "a", sortOrder: 2 }, { id: "b", sortOrder: 1 })).toBeGreaterThan(0);
  });

  it("on a tie: an assignment before a divider, then the one created first, then by id", () => {
    const instance = { id: "z", sortOrder: 1, kind: "instance" as const, createdAt: at(9) };
    const separator = { id: "a", sortOrder: 1, kind: "separator" as const };
    expect(compareDayRows(instance, separator)).toBeLessThan(0);

    expect(compareDayRows({ id: "b", sortOrder: 1, createdAt: at(1) }, { id: "a", sortOrder: 1, createdAt: at(2) })).toBeLessThan(0);
    expect(compareDayRows({ id: "a", sortOrder: 1, createdAt: at(1) }, { id: "b", sortOrder: 1, createdAt: at(1) })).toBeLessThan(0);
  });

  it("gives the same result however the rows arrive", () => {
    const rows = [
      { id: "c", sortOrder: 0, createdAt: at(3) },
      { id: "a", sortOrder: 0, createdAt: at(1) },
      { id: "b", sortOrder: 0, createdAt: at(2) },
    ];
    expect(orderDayRows(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(orderDayRows([...rows].reverse()).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("planTieRepairs", () => {
  const row = (id: string, sortOrder: number, dayKey = "s1:2026-09-08", kind: "instance" | "separator" = "instance", n = 0): RepairableRow => ({
    id, sortOrder, dayKey, kind, createdAt: kind === "instance" ? at(n) : null,
  });

  it("renumbers a tied day 0..n-1 in the order the board already shows it", () => {
    const plan = planTieRepairs([row("late", 0, undefined, "instance", 5), row("early", 0, undefined, "instance", 1), row("other", 3, undefined, "instance", 2)]);
    // Order: early(0, created first), late(0), other(3) → 0, 1, 2.
    expect(plan).toEqual([
      { id: "late", kind: "instance", sortOrder: 1 },
      { id: "other", kind: "instance", sortOrder: 2 },
    ]);
  });

  it("leaves a day that has no ties alone — even with gaps in its numbers", () => {
    expect(planTieRepairs([row("a", 0), row("b", 4), row("c", 9)])).toEqual([]);
  });

  it("counts a divider as part of the same numbering space", () => {
    const plan = planTieRepairs([row("task", 2, undefined, "instance", 1), row("divider", 2, undefined, "separator")]);
    // Tied at 2, so both are renumbered: the task first, the divider after it.
    expect(plan).toEqual([
      { id: "task", kind: "instance", sortOrder: 0 },
      { id: "divider", kind: "separator", sortOrder: 1 },
    ]);
  });

  it("treats each student's day separately", () => {
    // Same numbers on different students' days are not a tie.
    expect(planTieRepairs([row("a", 0, "s1:2026-09-08"), row("b", 0, "s2:2026-09-08"), row("c", 0, "s1:2026-09-09")])).toEqual([]);
  });
});

describe("healTiedDayOrder", () => {
  async function make(studentId: string, title: string, dateISO: string, sortOrder: number) {
    return prisma.assignmentInstance.create({
      data: { title, studentId, createdBy: "parent", dueDate: parseISODate(dateISO), originalDueDate: parseISODate(dateISO), sortOrder },
    });
  }

  it("removes ties without changing what order the day shows, and a second pass finds nothing to do", async () => {
    const student = await makeStudent(prisma);
    // Created in this order, all tied at 0, plus a divider also at 0.
    await make(student.id, "First", "2026-09-08", 0);
    await make(student.id, "Second", "2026-09-08", 0);
    await prisma.daySeparator.create({ data: { studentId: student.id, date: parseISODate("2026-09-08"), label: "Afternoon", sortOrder: 0 } });
    await make(student.id, "Third", "2026-09-08", 0);

    const changed = await healTiedDayOrder(prisma, parseISODate("2026-09-07"), parseISODate("2026-09-20"));
    expect(changed).toBeGreaterThan(0);

    const instances = await prisma.assignmentInstance.findMany({ orderBy: { sortOrder: "asc" } });
    const separators = await prisma.daySeparator.findMany();
    const numbers = [...instances.map((i) => i.sortOrder), ...separators.map((s) => s.sortOrder)];
    expect(new Set(numbers).size).toBe(numbers.length); // no ties left
    expect(instances.map((i) => i.title)).toEqual(["First", "Second", "Third"]); // same relative order as before

    expect(await healTiedDayOrder(prisma, parseISODate("2026-09-07"), parseISODate("2026-09-20"))).toBe(0);
  });

  it("only touches days inside the window, and each student's days on their own", async () => {
    const miles = await makeStudent(prisma, { name: "Miles" });
    const violet = await makeStudent(prisma, { name: "Violet" });
    const farFirst = await make(miles.id, "Far A", "2026-12-01", 0);
    const farSecond = await make(miles.id, "Far B", "2026-12-01", 0);
    await make(miles.id, "Miles 0", "2026-09-08", 0);
    await make(violet.id, "Violet 0", "2026-09-08", 0); // same number, different student: not a tie

    expect(await healTiedDayOrder(prisma, parseISODate("2026-09-07"), parseISODate("2026-09-20"))).toBe(0);
    expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: farFirst.id } })).sortOrder).toBe(0);
    expect((await prisma.assignmentInstance.findUniqueOrThrow({ where: { id: farSecond.id } })).sortOrder).toBe(0);
  });
});

describe("the page-load pass repairs tied days", () => {
  it("extendAllMaterializationHorizons — what runs on every page load — leaves no day with a tie", async () => {
    const student = await makeStudent(prisma);
    const asOf = parseISODate("2026-09-08");
    for (const title of ["One", "Two", "Three"]) {
      await prisma.assignmentInstance.create({
        data: { title, studentId: student.id, createdBy: "parent", dueDate: parseISODate("2026-09-10"), originalDueDate: parseISODate("2026-09-10"), sortOrder: 0 },
      });
    }

    await extendAllMaterializationHorizons(prisma, asOf);

    const rows = await prisma.assignmentInstance.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => [r.title, r.sortOrder])).toEqual([["One", 0], ["Two", 1], ["Three", 2]]);
  });
});

describe("rolling forward keeps tied rows in the order the board shows them", () => {
  it("doesn't reshuffle a tied day when something rolls onto it", async () => {
    const student = await makeStudent(prisma);
    const day = parseISODate("2026-09-09"); // Wednesday
    for (const title of ["Tied one", "Tied two", "Tied three"]) {
      await prisma.assignmentInstance.create({
        data: { title, studentId: student.id, createdBy: "parent", dueDate: day, originalDueDate: day, sortOrder: 0 },
      });
    }
    await prisma.assignmentInstance.create({
      data: { title: "Overdue", studentId: student.id, createdBy: "parent", dueDate: parseISODate("2026-09-08"), originalDueDate: parseISODate("2026-09-08") },
    });

    await rollOverdueInstances(prisma, student.id, day);

    const rows = await prisma.assignmentInstance.findMany({ where: { studentId: student.id, dueDate: day }, orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => r.title)).toEqual(["Overdue", "Tied one", "Tied two", "Tied three"]);
  });
});

// The reason this module exists: Parent Mode's board and the student's view are
// two renderings of the same rows, and a day must read the same on both. This is
// the board's ordering (every row — assignments and dividers — by orderDayRows)
// against the student's (open and time-sensitive rows merged by splitBySeparators,
// dividers interleaved), over many deliberately messy days: tied positions,
// time-sensitive tasks, dividers. Only open rows are compared — finished and
// "waiting on Mom" rows sink below the open ones for the student by design (§6).
describe("Parent Mode and the student's view order a day identically (§14)", () => {
  function rng(seed: number) {
    let state = seed;
    return () => (state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296;
  }

  it("agree on every randomized day, ties and time-sensitive tasks included", () => {
    const disagreements: string[] = [];
    for (let seed = 1; seed <= 500; seed++) {
      const random = rng(seed);
      const count = 2 + Math.floor(random() * 8);
      const rows = Array.from({ length: count }, (_, i) => ({
        id: `i${i}`,
        title: `T${i}`,
        status: InstanceStatus.open,
        rolledCount: 0,
        requiresReview: false,
        originalDueDate: null,
        createdAt: at(i),
        sortOrder: Math.floor(random() * 4), // small range on purpose: lots of ties
        subject: null,
        projectId: null,
        isTimeSensitive: random() < 0.35,
        scheduledTime: random() < 0.5 ? "09:00" : "08:00",
      }));
      const separators = Array.from({ length: Math.floor(random() * 3) }, (_, i) => ({ id: `s${i}`, sortOrder: Math.floor(random() * 4) }));

      const board = orderDayRows([
        ...rows.map((row) => ({ id: row.id, sortOrder: row.sortOrder, createdAt: row.createdAt, kind: "instance" as const })),
        ...separators.map((sep) => ({ id: sep.id, sortOrder: sep.sortOrder, kind: "separator" as const })),
      ]).map((row) => row.id);

      const { open, timeSensitive } = bucketDayInstances(rows);
      const { segments, separatorsInOrder } = splitBySeparators([...open, ...timeSensitive], separators);
      const student: string[] = [];
      segments.forEach((segment, index) => {
        segment.forEach((row) => student.push(row.id));
        if (separatorsInOrder[index]) student.push(separatorsInOrder[index].id);
      });

      if (board.join() !== student.join()) disagreements.push(`seed ${seed}: board=${board.join(",")} student=${student.join(",")}`);
    }
    expect(disagreements).toEqual([]);
  });
});
