// lib/supabase-server.js — server-side Supabase client bound to the
// request's cookies. Runs under the SIGNED-IN USER, so every query it
// makes is filtered by the same RLS policies the browser gets.
// Use this to ask "who is calling?" — never to bypass a policy.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(list) {
          try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch (e) { /* called from a Server Component — middleware refreshes instead */ }
        },
      },
    }
  );
}
