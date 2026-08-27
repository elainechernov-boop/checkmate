import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const FAMILY_COOKIE = "checkmate_family";
export const PARENT_COOKIE = "checkmate_parent";
export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set.");
  }
  return secret;
}

function sign(payload: string): string {
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verify(token: string, expectedPayload: string): boolean {
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return false;

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  if (payload !== expectedPayload) return false;

  const expectedSignature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
}

export function signFamilySession(): string {
  return sign("family");
}

export function signParentSession(): string {
  return sign("parent");
}

export function verifyFamilySession(token: string | undefined): boolean {
  return !!token && verify(token, "family");
}

export function verifyParentSession(token: string | undefined): boolean {
  return !!token && verify(token, "parent");
}

/**
 * HOMEROOM_UX_MIGRATION.md §11 authorization: "Apply the check inside
 * parent-only server actions, especially project and idea mutation.
 * Middleware protects pages, but the actions themselves must not rely
 * solely on a hidden UI." The `/parent/**` middleware guard in proxy.ts
 * already blocks a normal page visit without a parent session, but a
 * Server Action is its own callable endpoint — this is the same check,
 * called directly inside the action so removing/hiding a button is never
 * the only thing standing between a family-session browser and a
 * parent-only mutation. Throws (rather than redirecting) since actions
 * run inside the fetch a form/mutation triggered, not a page navigation.
 */
export async function requireParentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARENT_COOKIE)?.value;
  if (!verifyParentSession(token)) {
    throw new Error("Parent Mode session required.");
  }
}

/** Constant-time comparison of two secrets, regardless of their length. */
export function secretsMatch(a: string, b: string): boolean {
  const hashedA = createHash("sha256").update(a).digest();
  const hashedB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashedA, hashedB);
}
