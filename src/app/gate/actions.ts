"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FAMILY_COOKIE, ONE_YEAR_SECONDS, secretsMatch, signFamilySession } from "@/lib/session";

export async function submitFamilyPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.FAMILY_PASSWORD;
  if (!expected) {
    throw new Error("FAMILY_PASSWORD environment variable is not set.");
  }

  if (!secretsMatch(password, expected)) {
    redirect("/gate?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(FAMILY_COOKIE, signFamilySession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });

  const from = String(formData.get("from") ?? "/");
  redirect(from.startsWith("/") ? from : "/");
}
