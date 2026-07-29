// lib/guard.js — the single front door for every API route.
//
// Before this file, /api/sms, /api/phone, /api/email, /api/parts and
// /api/carfax had NO caller check of any kind. An anonymous POST to
// /api/phone bought Twilio numbers on the shop's account; an anonymous
// POST to /api/email sent attacker-authored HTML from the shop's
// verified domain. That was demonstrated live against the running app.
//
// Usage at the top of any route:
//
//     const gate = await guard(req, { limit: 20 });
//     if (gate.blocked) return gate.response;
//     const { user, shopId, role } = gate;
//
import { supabaseServer } from "./supabase-server";
import { allow, clientIp, tooMany } from "./ratelimit";

function deny(status, error) {
  return {
    blocked: true,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  };
}

/**
 * @param req            the incoming Request
 * @param opts.limit     max requests per window for this route
 * @param opts.windowMs  window length, default 60s
 * @param opts.role      "owner" to require owner/manager
 * @param opts.public    true = skip the sign-in check, keep rate limiting
 *                       (only for genuinely public endpoints, e.g. the
 *                       customer booking portal)
 */
export async function guard(req, opts = {}) {
  const { limit = 30, windowMs = 60_000, role = null, public: isPublic = false } = opts;
  const ip = clientIp(req);
  const route = new URL(req.url).pathname;

  if (!(await allow(`${route}:${ip}`, { max: limit, windowMs }))) {
    return { blocked: true, response: tooMany() };
  }

  if (isPublic) return { blocked: false, user: null, shopId: null, role: null, ip };

  let sb;
  try { sb = await supabaseServer(); }
  catch (e) { return deny(500, "Auth is not configured on this deployment."); }

  const { data: { user } = {}, error } = await sb.auth.getUser();
  if (error || !user) return deny(401, "Sign in first.");

  const { data: membership } = await sb
    .from("shop_users")
    .select("shop_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return deny(403, "This account is not attached to a shop yet.");

  if (role === "owner" && !["owner", "manager"].includes(membership.role)) {
    return deny(403, "Owner access required for this action.");
  }

  return {
    blocked: false,
    user,
    shopId: membership.shop_id,
    role: membership.role,
    displayName: membership.display_name,
    ip,
  };
}
