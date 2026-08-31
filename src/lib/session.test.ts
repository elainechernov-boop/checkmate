import { beforeEach, describe, expect, it } from "vitest";
import {
  getFamilyIdFromSession,
  hashSecret,
  secretMatchesHash,
  signFamilySession,
  signParentSession,
  verifyFamilySession,
  verifyParentSession,
} from "./session";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("hashSecret / secretMatchesHash", () => {
  it("round-trips a secret through hashing", () => {
    const hash = hashSecret("correct horse battery staple");
    expect(secretMatchesHash("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects the wrong secret", () => {
    const hash = hashSecret("correct horse battery staple");
    expect(secretMatchesHash("wrong guess", hash)).toBe(false);
  });

  it("produces a different hash (different salt) each time", () => {
    const a = hashSecret("same input");
    const b = hashSecret("same input");
    expect(a).not.toBe(b);
    expect(secretMatchesHash("same input", a)).toBe(true);
    expect(secretMatchesHash("same input", b)).toBe(true);
  });

  it("rejects a malformed stored hash rather than throwing", () => {
    expect(secretMatchesHash("anything", "not-a-real-hash")).toBe(false);
  });
});

describe("family session", () => {
  it("round-trips the family id through sign/verify", () => {
    const token = signFamilySession("family_123");
    expect(getFamilyIdFromSession(token)).toBe("family_123");
    expect(verifyFamilySession(token)).toBe(true);
  });

  it("rejects a tampered token", () => {
    const token = signFamilySession("family_123");
    const tampered = token.replace("family_123", "family_456");
    expect(getFamilyIdFromSession(tampered)).toBeNull();
  });

  it("rejects an undefined token", () => {
    expect(getFamilyIdFromSession(undefined)).toBeNull();
    expect(verifyFamilySession(undefined)).toBe(false);
  });

  it("a parent session token doesn't verify as a family session and vice versa", () => {
    const familyToken = signFamilySession("family_123");
    const parentToken = signParentSession();
    expect(verifyParentSession(familyToken)).toBe(false);
    expect(getFamilyIdFromSession(parentToken)).toBeNull();
  });
});
