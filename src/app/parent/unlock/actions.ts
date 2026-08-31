"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  FAMILY_COOKIE,
  ONE_YEAR_SECONDS,
  PARENT_COOKIE,
  getFamilyIdFromSession,
  hashSecret,
  secretMatchesHash,
  secretsMatch,
  signParentSession,
} from "@/lib/session";

export async function submitParentPasscode(formData: FormData) {
  const passcode = String(formData.get("passcode") ?? "");

  const cookieStore = await cookies();
  const familyId = getFamilyIdFromSession(cookieStore.get(FAMILY_COOKIE)?.value);
  if (!familyId) {
    redirect("/gate");
  }

  // Family, not getScopedPrisma() — this looks up the tenant row itself,
  // which has no familyId of its own to scope by.
  const family = await prisma.family.findUniqueOrThrow({ where: { id: familyId } });

  let matched = false;
  if (family.parentPasscodeHash) {
    matched = secretMatchesHash(passcode, family.parentPasscodeHash);
  } else {
    // Legacy bootstrap — see gate/actions.ts's identical fallback.
    const legacy = process.env.PARENT_PASSCODE;
    if (legacy && secretsMatch(passcode, legacy)) {
      await prisma.family.update({
        where: { id: familyId },
        data: { parentPasscodeHash: hashSecret(passcode) },
      });
      matched = true;
    }
  }

  if (!matched) {
    redirect("/parent/unlock?error=1");
  }

  cookieStore.set(PARENT_COOKIE, signParentSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });

  redirect("/parent");
}
