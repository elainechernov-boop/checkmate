"use server";

import { revalidatePath } from "next/cache";
import { createFamily } from "@/lib/family";
import { requireAdminSession } from "@/lib/session";

export async function createFamilyAction(formData: FormData) {
  await requireAdminSession();

  const name = String(formData.get("name") ?? "").trim();
  const accessCode = String(formData.get("accessCode") ?? "").trim();
  const parentPasscode = String(formData.get("parentPasscode") ?? "").trim();
  const complianceModuleEnabled = formData.get("complianceModuleEnabled") === "on";

  if (!name || !accessCode || !parentPasscode) {
    throw new Error("Family name, access code, and parent passcode are all required.");
  }

  await createFamily({ name, accessCode, parentPasscode, complianceModuleEnabled });
  revalidatePath("/admin/dashboard");
}
