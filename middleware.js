// middleware.js — NEW. Two jobs:
//   1. Refresh the Supabase session cookie on every request, so a tech who
//      leaves the app open in a driveway all day doesn't get logged out.
//   2. Bounce signed-out visitors to /login before the app ever renders.
//
// This is what makes the app private. It runs ahead of every page and API
// route, and it is the reason the existing UI needed no auth code added.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Reachable without signing in. Keep this list short and deliberate.
const PUBLIC = [
  "/login",
  "/auth/callback",
  "/api/verify",       // customer booking portal — public by design, rate limited
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

function isPublic(pathname) {
  return PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  // If Supabase isn't configured yet, don't lock anyone out of their own app.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(list) {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: { headers: req.headers } });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = req.nextUrl;

  if (!user && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ error: "Sign in first." }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
    const to = req.nextUrl.clone();
    to.pathname = "/login";
    return NextResponse.redirect(to);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
