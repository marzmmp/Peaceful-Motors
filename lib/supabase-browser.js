// lib/supabase-browser.js — the browser-side Supabase client.
// Uses cookie storage so the SAME session is visible to the server in
// middleware.js and in every /api route. That shared session is what
// makes route protection possible.
import { createBrowserClient } from "@supabase/ssr";

let _client = null;

export function supabaseBrowser() {
  if (_client) return _client;
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  return _client;
}
