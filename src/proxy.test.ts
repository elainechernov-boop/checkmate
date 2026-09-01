import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import {
  ADMIN_COOKIE,
  FAMILY_COOKIE,
  PARENT_COOKIE,
  signAdminSession,
  signFamilySession,
  signParentSession,
} from "@/lib/session";

// Hermetic regardless of whether the developer's own .env is loaded under
// vitest — sign*Session() only reads process.env.SESSION_SECRET lazily,
// inside the call, so setting it here (before any call) is enough even if
// this file runs before any other module touches it.
beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-only-proxy-secret";
});

function request(path: string, cookies: Record<string, string> = {}) {
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

function isRedirectTo(response: Response, path: string): boolean {
  if (response.status < 300 || response.status >= 400) return false;
  const location = response.headers.get("location");
  return !!location && new URL(location).pathname === path;
}

// §1-2: a family password gates the whole app; Parent Mode has its own
// passcode on top. Both unlock pages set a signed cookie on success, but
// nothing else previously read it back — this is what actually enforces
// the gate (renamed from middleware.ts to proxy.ts as of Next.js 16).
describe("proxy (auth gate)", () => {
  it("redirects an unauthenticated request for the student picker to /gate", () => {
    const response = proxy(request("/"));
    expect(isRedirectTo(response, "/gate")).toBe(true);
  });

  it("redirects an unauthenticated request for a student page to /gate, preserving the path to return to", () => {
    const response = proxy(request("/student/abc123"));
    expect(isRedirectTo(response, "/gate")).toBe(true);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("from")).toBe("/student/abc123");
  });

  it("never redirects /gate itself, even with no cookies at all", () => {
    const response = proxy(request("/gate"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a family-authenticated request through to a non-parent route", () => {
    const response = proxy(request("/student/abc123", { [FAMILY_COOKIE]: signFamilySession("test-family") }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects a family-authenticated-but-not-parent request for /parent to /parent/unlock", () => {
    const response = proxy(request("/parent", { [FAMILY_COOKIE]: signFamilySession("test-family") }));
    expect(isRedirectTo(response, "/parent/unlock")).toBe(true);
  });

  it("still requires the family cookie to reach /parent/unlock itself", () => {
    const response = proxy(request("/parent/unlock"));
    expect(isRedirectTo(response, "/gate")).toBe(true);
  });

  it("lets a family-authenticated request through to /parent/unlock", () => {
    const response = proxy(request("/parent/unlock", { [FAMILY_COOKIE]: signFamilySession("test-family") }));
    expect(response.headers.get("location")).toBeNull();
  });

  it("lets a fully-authenticated request through to /parent", () => {
    const response = proxy(
      request("/parent", { [FAMILY_COOKIE]: signFamilySession("test-family"), [PARENT_COOKIE]: signParentSession() })
    );
    expect(response.headers.get("location")).toBeNull();
  });

  it("rejects a forged/garbage cookie the same as a missing one", () => {
    const response = proxy(request("/parent", { [FAMILY_COOKIE]: "not-a-real-token" }));
    expect(isRedirectTo(response, "/gate")).toBe(true);
  });

  // Phase 4: the owner-only admin area isn't a family concept at all — it
  // must never sit behind the family gate (a brand-new family can't have a
  // session yet), and has its own separate, required session.
  describe("admin area", () => {
    it("never redirects /admin itself, even with no cookies at all — not even to /gate", () => {
      const response = proxy(request("/admin"));
      expect(response.headers.get("location")).toBeNull();
    });

    it("redirects /admin/dashboard without an admin session to /admin, not /gate", () => {
      const response = proxy(request("/admin/dashboard"));
      expect(isRedirectTo(response, "/admin")).toBe(true);
    });

    it("a family or parent session alone does not grant access to /admin/dashboard", () => {
      const response = proxy(
        request("/admin/dashboard", {
          [FAMILY_COOKIE]: signFamilySession("test-family"),
          [PARENT_COOKIE]: signParentSession(),
        })
      );
      expect(isRedirectTo(response, "/admin")).toBe(true);
    });

    it("lets an admin-authenticated request through to /admin/dashboard, with no family session at all", () => {
      const response = proxy(request("/admin/dashboard", { [ADMIN_COOKIE]: signAdminSession() }));
      expect(response.headers.get("location")).toBeNull();
    });

    it("rejects a forged admin cookie the same as a missing one", () => {
      const response = proxy(request("/admin/dashboard", { [ADMIN_COOKIE]: "not-a-real-token" }));
      expect(isRedirectTo(response, "/admin")).toBe(true);
    });
  });
});
