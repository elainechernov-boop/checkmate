"use server";

import { revalidatePath } from "next/cache";
import { getScopedPrisma } from "@/lib/prisma";
import { WorkSampleCategory } from "@/generated/prisma/enums";

function parseWorkSampleCategory(value: string): WorkSampleCategory {
  if (value in WorkSampleCategory) {
    return value as WorkSampleCategory;
  }
  return WorkSampleCategory.none;
}

export async function createSubjectAction(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const prisma = await getScopedPrisma();
  await prisma.subject.create({ data: { name: trimmed, workSampleCategory: WorkSampleCategory.none, isFaithIntegrated: false } });
  revalidatePath("/parent/subjects");
  revalidatePath("/parent");
}

export async function updateSubjectNameAction(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required.");
  const prisma = await getScopedPrisma();
  await prisma.subject.update({ where: { id }, data: { name: trimmed } });
  revalidatePath("/parent/subjects");
  revalidatePath("/parent");
}

export async function updateSubjectCategoryAction(id: string, workSampleCategory: string) {
  const prisma = await getScopedPrisma();
  await prisma.subject.update({ where: { id }, data: { workSampleCategory: parseWorkSampleCategory(workSampleCategory) } });
  revalidatePath("/parent/subjects");
}

export async function updateSubjectFaithIntegratedAction(id: string, isFaithIntegrated: boolean) {
  const prisma = await getScopedPrisma();
  await prisma.subject.update({ where: { id }, data: { isFaithIntegrated } });
  revalidatePath("/parent/subjects");
}

export async function deleteSubjectAction(id: string) {
  const prisma = await getScopedPrisma();
  try {
    await prisma.subject.delete({ where: { id } });
  } catch {
    throw new Error("Can't delete a subject that's already in use by an assignment or project.");
  }
  revalidatePath("/parent/subjects");
  revalidatePath("/parent");
}
