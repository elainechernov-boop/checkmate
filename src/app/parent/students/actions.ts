"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function createStudent(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const gradeLevel = String(formData.get("gradeLevel") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "#6B6B6B").trim();

  if (!name || !gradeLevel) {
    throw new Error("Name and grade level are required.");
  }

  await prisma.student.create({ data: { name, gradeLevel, accentColor } });
  revalidatePath("/parent/students");
  revalidatePath("/parent");
}

export async function updateStudent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const gradeLevel = String(formData.get("gradeLevel") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "#6B6B6B").trim();

  if (!id || !name || !gradeLevel) {
    throw new Error("Name and grade level are required.");
  }

  await prisma.student.update({ where: { id }, data: { name, gradeLevel, accentColor } });
  revalidatePath("/parent/students");
  revalidatePath("/parent");
}

export async function deleteStudent(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  try {
    await prisma.student.delete({ where: { id } });
  } catch {
    throw new Error("Can't delete a student who already has assignments or projects.");
  }

  revalidatePath("/parent/students");
  revalidatePath("/parent");
}
