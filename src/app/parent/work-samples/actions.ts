"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { flagWorkSample, unflagWorkSample } from "@/lib/workSamples";

export async function flagWorkSampleAction(formData: FormData) {
  const instanceId = String(formData.get("instanceId") ?? "");
  const note = String(formData.get("note") ?? "");
  const acknowledge = formData.get("acknowledge") === "on";
  if (!instanceId) return;

  await flagWorkSample(prisma, instanceId, note, acknowledge);
  revalidatePath("/parent/work-samples");
  revalidatePath("/parent");
}

export async function unflagWorkSampleAction(formData: FormData) {
  const instanceId = String(formData.get("instanceId") ?? "");
  if (!instanceId) return;

  await unflagWorkSample(prisma, instanceId);
  revalidatePath("/parent/work-samples");
  revalidatePath("/parent");
}
