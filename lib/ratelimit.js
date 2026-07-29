// lib/ratelimit.js — rate limiting that actually survives serverless.
//
// The original limiter in /api/claude was an in-process Map. On Vercel
// that resets on every cold start and is not shared between concurrent
// instances, so under real load it approximates no limit at all. Its own
// comment said as much.
//
// This one keeps counters in Postgres (rate_hits), so every instance
// sees the same window. If the service key isn't configured it fails
// OPEN and falls back to the in-process map — a missing env var should
// degrade the app, not break it.
import { supabaseAdmin } from "./supabase-admin";

const localHits = new Map();

function localAllowed(bucket, max, windowMs) {
  const now = Date.now();
  const recent = (localHits.get(bucket) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  localHits.set(bucket, recent);
  return recent.length <= max;
}

export function clientIp(req) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * @returns {Promise<boolean>} true if the call is allowed through.
 */
export async function allow(bucket, { max = 20, windowMs = 60_000 } = {}) {
  const admin = supabaseAdmin();
  if (!admin) return localAllowed(bucket, max, windowMs);

  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  try {
    const { data, error } = await admin.rpc("bump_rate", {
      p_bucket: bucket,
      p_window: windowStart,
    });
    if (error) return localAllowed(bucket, max, windowMs);
    return Number(data) <= max;
  } catch (e) {
    return localAllowed(bucket, max, windowMs);
  }
}

export function tooMany(message = "Too many requests — slow down a bit and try again.") {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
}
