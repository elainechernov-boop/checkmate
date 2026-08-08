"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { WorkSampleCategory } from "@/generated/prisma/enums";

function parseWorkSampleCategory(value: string): WorkSampleCategory {
  if (value in WorkSampleCategory) {
    return value as WorkSampleCategory;
  }
  return WorkSampleCategory.none;
}

export async function createSubject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const workSampleCategory = parseWorkSampleCategory(String(formData.get("workSampleCategory") ?? "none"));
  const isFaithIntegrated = formData.get("isFaithIntegrated") === "on";

  if (!name) {
    throw new Error("Name is required.");
  }

  await prisma.subject.create({ data: { name, workSampleCategory, isFaithIntegrated } });
  revalidatePath("/parent/subjects");
  revalidatePath("/parent");
}

export async function updateSubject(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const workSampleCategory = parseWorkSampleCategory(String(formData.get("workSampleCategory") ?? "none"));
  const isFaithIntegrated = formData.get("isFaithIntegrated") === "on";

  if (!id || !name) {
    throw new Error("Name is required.");
  }

  await prisma.subject.update({ where: { id }, data: { name, workSampleCategory, isFaithIntegrated } });
  revalidatePath("/parent/subjects");
  revalidatePath("/parent");
}

export async function deleteSubject(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  try {
    await prisma.subject.delete({ where: { id } });
  } catch {
    throw new Error("Can't delete a subject that's already in use by an assignment or project.");
  }

  revalidatePath("/parent/subjects");
  revalidatePath("/parent");
}
