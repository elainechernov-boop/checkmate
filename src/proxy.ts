import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { FAMILY_COOKIE, PARENT_COOKIE, verifyFamilySession, verifyParentSession } from "@/lib/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/gate")) {
    return NextResponse.next();
  }

  const familySession = request.cookies.get(FAMILY_COOKIE)?.value;
  if (!verifyFamilySession(familySession)) {
    const url = new URL("/gate", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/parent") && !pathname.startsWith("/parent/unlock")) {
    const parentSession = request.cookies.get(PARENT_COOKIE)?.value;
    if (!verifyParentSession(parentSession)) {
      return NextResponse.redirect(new URL("/parent/unlock", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Static files under public/ (the wordmark/favicon SVGs, etc.) need to
  // load on the gate page itself, before any session cookie exists — so
  // any request for a plain static-asset extension bypasses the gate the
  // same way _next/static and _next/image already do.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|ico|png|jpg|jpeg|gif|webp|json)$).*)"],
};
