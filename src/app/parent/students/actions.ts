"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { nextAccentColor } from "@/lib/theme";

export async function createStudentAction(name: string, gradeLevel: string) {
  const trimmedName = name.trim();
  const trimmedGrade = gradeLevel.trim();
  if (!trimmedName || !trimmedGrade) {
    throw new Error("Name and grade level are required.");
  }

  await prisma.student.create({ data: { name: trimmedName, gradeLevel: trimmedGrade, accentColor: "#1657FF" } });
  revalidatePath("/parent/students");
  revalidatePath("/parent");
}

export async function updateStudentNameAction(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  await prisma.student.update({ where: { id }, data: { name: trimmed } });
  revalidatePath("/parent/students");
  revalidatePath("/parent");
}

export async function updateStudentGradeAction(id: string, gradeLevel: string) {
  const trimmed = gradeLevel.trim();
  if (!trimmed) throw new Error("Grade level is required.");
  await prisma.student.update({ where: { id }, data: { gradeLevel: trimmed } });
  revalidatePath("/parent/students");
  revalidatePath("/parent");
}

/** HOMEROOM_UX_MIGRATION.md §5.7 — "Replace the arbitrary color picker
 * with `Change color` that cycles the fixed palette, matching Student
 * Mode." Same rotation and same underlying write StudentWeekView's own
 * accent-cycle button already uses (cycleAccentColorAction) — this is the
 * parent-side equivalent, on any student's row rather than just their own. */
export async function cycleStudentAccentAction(id: string): Promise<{ accentColor: string }> {
  const student = await prisma.student.findUniqueOrThrow({ where: { id } });
  const accentColor = nextAccentColor(student.accentColor);
  await prisma.student.update({ where: { id }, data: { accentColor } });
  revalidatePath("/parent/students");
  revalidatePath("/parent");
  return { accentColor };
}

export async function deleteStudentAction(id: string) {
  try {
    await prisma.student.delete({ where: { id } });
  } catch {
    throw new Error("Can't delete a student who already has assignments or projects.");
  }
  revalidatePath("/parent/students");
  revalidatePath("/parent");
}
