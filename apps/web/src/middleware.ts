import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic check only (cookie present). Real checks happen server-side via requireUser().
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const PUBLIC = ["/login", "/signup", "/forgot-password", "/reset-password"];
  if (PUBLIC.includes(pathname) || pathname.startsWith("/api/auth")) return NextResponse.next();
  if (!getSessionCookie(req)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
