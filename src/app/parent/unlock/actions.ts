"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ONE_YEAR_SECONDS, PARENT_COOKIE, secretsMatch, signParentSession } from "@/lib/session";

export async function submitParentPasscode(formData: FormData) {
  const passcode = String(formData.get("passcode") ?? "");
  const expected = process.env.PARENT_PASSCODE;
  if (!expected) {
    throw new Error("PARENT_PASSCODE environment variable is not set.");
  }

  if (!secretsMatch(passcode, expected)) {
    redirect("/parent/unlock?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(PARENT_COOKIE, signParentSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });

  redirect("/parent");
}
