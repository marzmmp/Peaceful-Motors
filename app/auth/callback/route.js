// app/auth/callback/route.js — NEW. Completes email confirmation and
// password-reset links by exchanging the code for a session cookie.
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase-server";

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const sb = await supabaseServer();
      await sb.auth.exchangeCodeForSession(code);
    } catch (e) { /* fall through to /login */ }
  }
  return NextResponse.redirect(new URL(code ? "/" : "/login", url.origin));
}
