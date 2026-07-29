// app/api/roster/route.js — owner adds a tech: real login + role (CLAUDE.md Task 1).
//
// Before this route, "Add technician" only wrote the shared roster record —
// the new tech appeared on every device but had no login of their own.
// The same button now also calls here, and this route:
//   1. invites the tech by email (Supabase sends the confirmation link),
//   2. attaches them to this shop in shop_users with the chosen role,
//   3. returns a scrypt hash of the starting PIN so the roster record
//      stores no plaintext secret (Task 2).
//
// supabaseAdmin() appears for exactly one call: auth.admin.inviteUserByEmail,
// which only the service key can perform (it touches auth.users, not shop
// data). The shop_users insert deliberately goes through the CALLER's
// session client instead, so RLS re-proves the caller owns this shop —
// the tenant boundary stays in the database where it belongs.
import { guard } from "../../../lib/guard";
import { supabaseServer } from "../../../lib/supabase-server";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { hashPin } from "../../../lib/pin";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

// Admin-tab role labels → shop_users.role values (check constraint, schema 01).
const ROLE_MAP = {
  "Owner": "owner",
  "Manager": "manager",
  "Service Advisor": "advisor",
  "Technician": "tech",
  "Independent Contractor": "contractor",
  "Apprentice": "apprentice",
};

export async function POST(req) {
  const gate = await guard(req, { role: "owner", limit: 10 });
  if (gate.blocked) return gate.response;

  try {
    const { name, email, role, pin } = await req.json();
    if (!name || !String(name).trim()) return json({ error: "name required" }, 400);

    const out = { ok: true, invited: false };

    // Hash the starting PIN here so the browser never has to store it raw.
    const p = String(pin || "").trim();
    if (p.length >= 4) out.pinHash = hashPin(p);

    const to = String(email || "").trim().toLowerCase();
    if (to.includes("@")) {
      const admin = supabaseAdmin();
      if (!admin) {
        out.note = "Invite skipped — service key not configured on this deployment.";
        return json(out, 200);
      }
      const redirectTo = new URL("/auth/callback", req.url).toString();
      const { data, error } = await admin.auth.admin.inviteUserByEmail(to, { redirectTo });

      if (error) {
        // Most common: the address already has an account. The roster entry
        // still saves; attaching an existing account stays a seed-SQL step.
        out.note = "Invite not sent: " + error.message;
        return json(out, 200);
      }

      out.invited = true;

      const sb = await supabaseServer();
      const { error: linkErr } = await sb.from("shop_users").insert({
        user_id: data.user.id,
        shop_id: gate.shopId,
        role: ROLE_MAP[role] || "tech",
        display_name: String(name).slice(0, 80),
      });
      if (linkErr) out.note = "Invited, but shop link failed: " + linkErr.message;
    }

    return json(out, 200);
  } catch (e) {
    return json({ error: "roster update failed" }, 500);
  }
}
