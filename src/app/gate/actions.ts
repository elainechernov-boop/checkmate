"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  FAMILY_COOKIE,
  ONE_YEAR_SECONDS,
  hashSecret,
  secretMatchesHash,
  secretsMatch,
  signFamilySession,
} from "@/lib/session";

export async function submitFamilyPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  // Try every family's code rather than looking one up by it — the codes
  // are hashed at rest, and a handful of families is cheap to scan
  // (MULTI_FAMILY_SPEC.md Phase 2's answer to "how does login know whose
  // family this is": it doesn't have to, until a code matches). Keeps the
  // login form exactly what it's always been — one field, no family
  // picker, no accounts.
  const families = await prisma.family.findMany();

  let matchedFamilyId: string | null = null;
  for (const family of families) {
    if (family.accessCodeHash) {
      if (secretMatchesHash(password, family.accessCodeHash)) {
        matchedFamilyId = family.id;
        break;
      }
      continue;
    }

    // Legacy bootstrap, only ever true for the one family that predates
    // per-family hashed codes: fall back to the env var this family has
    // always been gated by, and persist a hash on success so this branch
    // never runs again for it.
    const legacy = process.env.FAMILY_PASSWORD;
    if (legacy && secretsMatch(password, legacy)) {
      await prisma.family.update({
        where: { id: family.id },
        data: { accessCodeHash: hashSecret(password) },
      });
      matchedFamilyId = family.id;
      break;
    }
  }

  if (!matchedFamilyId) {
    redirect("/gate?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(FAMILY_COOKIE, signFamilySession(matchedFamilyId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });

  const from = String(formData.get("from") ?? "/");
  redirect(from.startsWith("/") ? from : "/");
}
