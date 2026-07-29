// lib/supabase-admin.js — SERVICE ROLE client. Bypasses RLS entirely.
//
// RULES, and they are not negotiable:
//   1. SERVER ONLY. This file must never be imported by a component.
//      SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix precisely so
//      that Next.js refuses to bundle it into the browser.
//   2. Use it ONLY for the two tables that have no policies on purpose:
//      phone_verifications and rate_hits.
//   3. Never use it to read shop data "because it's easier". That throws
//      away the tenant boundary the whole schema is built on.
import { createClient } from "@supabase/supabase-js";

let _admin = null;

export function supabaseAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}
