"use server";

import { redirect } from "next/navigation";
import { getScopedPrisma } from "@/lib/prisma";
import { getToday, mondayOf, parseISODate, toISODate, type WeekdayCode } from "@/lib/dates";
import { EndCondition, Frequency } from "@/generated/prisma/enums";
import { materializeSeries } from "@/lib/materialize";
import {
  transcribeAgendaImage,
  parseAssignmentsFromText,
  type ImageMediaType,
  type ParsedAssignmentDraft,
} from "@/lib/agendaImport";

// Comfortably under Claude's per-image request limits — a phone photo of a
// single page rarely approaches this; it's here to fail fast with a clear
// message rather than a confusing API error.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function mediaTypeFor(file: File): ImageMediaType {
  if (file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif") return file.type;
  return "image/jpeg";
}

export async function transcribeImage(file: File): Promise<string> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("That photo is too large — try a smaller image or crop it closer to the checklist.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return transcribeAgendaImage(buffer.toString("base64"), mediaTypeFor(file));
}

export async function parseAssignments(text: string, instruction: string): Promise<ParsedAssignmentDraft[]> {
  if (!text.trim()) {
    throw new Error("Nothing to parse yet.");
  }
  const prisma = await getScopedPrisma();
  const [students, subjects] = await Promise.all([
    prisma.student.findMany({ orderBy: { name: "asc" } }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
  ]);
  return parseAssignmentsFromText(text, instruction, {
    students: students.map((s) => ({ id: s.id, name: s.name })),
    subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
    today: toISODate(getToday()),
  });
}

export type ConfirmedRow = {
  title: string;
  studentId: string;
  subjectId: string | null;
  dueDate: string | null;
  recurrence: { daysOfWeek: WeekdayCode[]; startDate: string; endDate: string | null } | null;
};

// The same creation path as manual entry (createAssignment in
// ../new/actions.ts) — one AssignmentSeries + materialization per confirmed
// row, so a photo-imported assignment is indistinguishable from a
// hand-typed one the moment it's committed (§13's "no new data model").
export async function commitAssignments(rows: ConfirmedRow[]): Promise<void> {
  const valid = rows.filter((row) => row.title.trim() && row.studentId && (row.dueDate || row.recurrence));
  if (valid.length === 0) {
    throw new Error("Nothing to add — every row needs a title, a student, and a date.");
  }

  const prisma = await getScopedPrisma();
  const today = getToday();
  let earliestStart: Date | null = null;

  for (const row of valid) {
    const startDate = parseISODate(row.dueDate ?? row.recurrence!.startDate);
    if (!earliestStart || startDate < earliestStart) earliestStart = startDate;
    const materializeFrom = startDate < today ? startDate : today;

    const series = await prisma.assignmentSeries.create({
      data: {
        title: row.title.trim(),
        studentId: row.studentId,
        subjectId: row.subjectId,
        createdBy: "parent",
        startDate,
        endCondition: row.recurrence?.endDate ? EndCondition.onDate : EndCondition.never,
        endDate: row.recurrence?.endDate ? parseISODate(row.recurrence.endDate) : null,
        recurrence: row.recurrence
          ? {
              create: {
                frequency: Frequency.weekly,
                daysOfWeek: row.recurrence.daysOfWeek.join(","),
                interval: 1,
              },
            }
          : undefined,
      },
    });
    await materializeSeries(prisma, series.id, materializeFrom);
  }

  redirect(`/parent?week=${toISODate(mondayOf(earliestStart ?? today))}`);
}
