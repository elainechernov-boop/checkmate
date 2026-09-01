import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const FAMILY_COOKIE = "checkmate_family";
export const PARENT_COOKIE = "checkmate_parent";
export const ADMIN_COOKIE = "checkmate_admin";
export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
// Deliberately short (MULTI_FAMILY_SPEC.md Phase 4) — this session can
// create new families, so it doesn't get the family/parent sessions' long
// remembered-per-browser lifetime.
export const ADMIN_SESSION_SECONDS = 60 * 60 * 4;

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

// Verifies the signature covers exactly the payload embedded in the token
// and returns that payload — callers decide separately whether the payload
// they got back is the one they expected (a fixed "parent" constant, or a
// "family:<id>" carrying which tenant this session belongs to).
function verifySigned(token: string | undefined): string | null {
  if (!token) return null;
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return null;

  const payload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length) return null;

  return timingSafeEqual(provided, expected) ? payload : null;
}

const FAMILY_PAYLOAD_PREFIX = "family:";

// The session now carries *which* family, not just "a family gate was
// passed" (MULTI_FAMILY_SPEC.md Phase 2) — getScopedPrisma() reads this to
// know which tenant every query for this request should be scoped to.
export function signFamilySession(familyId: string): string {
  return sign(`${FAMILY_PAYLOAD_PREFIX}${familyId}`);
}

export function signParentSession(): string {
  return sign("parent");
}

/** The family this session belongs to, or null if the session is missing/invalid. */
export function getFamilyIdFromSession(token: string | undefined): string | null {
  const payload = verifySigned(token);
  if (!payload || !payload.startsWith(FAMILY_PAYLOAD_PREFIX)) return null;
  return payload.slice(FAMILY_PAYLOAD_PREFIX.length);
}

export function verifyFamilySession(token: string | undefined): boolean {
  return getFamilyIdFromSession(token) !== null;
}

export function verifyParentSession(token: string | undefined): boolean {
  return verifySigned(token) === "parent";
}

/**
 * The owner-only admin session (MULTI_FAMILY_SPEC.md Phase 4) — gated by
 * ADMIN_SECRET, a separate env var from any family's own credentials.
 * Deliberately not tied to a family at all: this is how new families get
 * created in the first place, so it has to work with none selected yet.
 */
export function signAdminSession(): string {
  return sign("admin");
}

export function verifyAdminSession(token: string | undefined): boolean {
  return verifySigned(token) === "admin";
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

/** Same defense-in-depth reasoning as requireParentSession() above, for the
 * admin area's own mutations (creating a family). */
export async function requireAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!verifyAdminSession(token)) {
    throw new Error("Admin session required.");
  }
}

/** Constant-time comparison of two secrets, regardless of their length. */
export function secretsMatch(a: string, b: string): boolean {
  const hashedA = createHash("sha256").update(a).digest();
  const hashedB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashedA, hashedB);
}

const SCRYPT_KEY_LENGTH = 64;

/**
 * Per-family access codes and parent passcodes (MULTI_FAMILY_SPEC.md Phase
 * 2) are hashed at rest instead of living in a plain env var — a new
 * random salt per secret, scrypt (built into Node, no new dependency).
 */
export function hashSecret(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, SCRYPT_KEY_LENGTH).toString("hex");
  return `${salt}:${hash}`;
}

export function secretMatchesHash(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const attempt = scryptSync(plain, salt, SCRYPT_KEY_LENGTH);
  const expected = Buffer.from(hash, "hex");
  if (attempt.length !== expected.length) return false;

  return timingSafeEqual(attempt, expected);
}
