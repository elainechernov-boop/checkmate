"use server";

import { revalidatePath } from "next/cache";
import { getScopedPrisma } from "@/lib/prisma";
import { undoEntry } from "@/lib/undoLog";

export async function undoEntryAction(entryId: string): Promise<{ error: string | null }> {
  const prisma = await getScopedPrisma();
  try {
    await undoEntry(prisma, entryId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Couldn't undo that." };
  }
  revalidatePath("/parent");
  return { error: null };
}
