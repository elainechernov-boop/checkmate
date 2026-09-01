"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, secretsMatch, signAdminSession } from "@/lib/session";

export async function submitAdminSecret(formData: FormData) {
  const secret = String(formData.get("secret") ?? "");
  const expected = process.env.ADMIN_SECRET;
  if (!expected) {
    throw new Error("ADMIN_SECRET environment variable is not set.");
  }

  if (!secretsMatch(secret, expected)) {
    redirect("/admin?error=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, signAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_SECONDS,
    path: "/",
  });

  redirect("/admin/dashboard");
}
