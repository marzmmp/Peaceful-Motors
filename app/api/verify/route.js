// app/api/verify/route.js — REAL phone verification. NEW FILE.
//
// Replaces the client-side version, where the code was generated in the
// browser (component line ~662) and compared in the browser (line ~670).
// It sat in React state, readable in devtools. Worse than useless: the
// booking then recorded verified:true, which looks like proof in a
// dispute and isn't.
//
// Here the code is generated server-side, stored as a SHA-256 hash with
// a 10-minute expiry, and compared server-side. The browser never sees it.
//
// This route is intentionally PUBLIC — a customer booking a repair has no
// login — but it is rate limited hard, and "send" is what costs money.
import crypto from "crypto";
import { guard } from "../../../lib/guard";
import { supabaseAdmin } from "../../../lib/supabase-admin";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const digitsOf = (p) => String(p || "").replace(/\D/g, "").slice(-10);

const TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export async function POST(req) {
  // Public, but 4 sends/min/IP — this is the SMS-pumping choke point.
  const gate = await guard(req, { limit: 4, public: true });
  if (gate.blocked) return gate.response;

  const admin = supabaseAdmin();
  if (!admin) return json({ error: "Verification is not configured (SUPABASE_SERVICE_ROLE_KEY missing)." }, 501);

  let body;
  try { body = await req.json(); }
  catch (e) { return json({ error: "Invalid request body." }, 400); }

  const { action, phone, code } = body || {};
  const ph = digitsOf(phone);
  if (ph.length < 10) return json({ error: "Enter a valid 10-digit phone number." }, 400);

  /* ---------------- send ---------------- */
  if (action === "send") {
    const plain = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + TTL_MIN * 60_000).toISOString();

    const { error: insErr } = await admin.from("phone_verifications")
      .insert({ phone: ph, code_hash: sha(plain), expires_at: expires });
    if (insErr) return json({ error: "Could not start verification." }, 500);

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !tok || !from) {
      // Not configured yet — say so honestly. The code is NOT returned.
      return json({ sent: false, error: "Texting isn't switched on yet — you can book without verifying." }, 501);
    }

    const brandName = process.env.EMAIL_BRAND_NAME || "Peaceful Motors";
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(sid + ":" + tok).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone, From: from,
        Body: `${brandName} verification code: ${plain}`,
      }),
    });
    if (!r.ok) return json({ sent: false, error: "Could not send the code." }, 502);

    // Note what is NOT in this response: the code.
    return json({ sent: true, expiresInMinutes: TTL_MIN }, 200);
  }

  /* ---------------- check ---------------- */
  if (action === "check") {
    if (!code) return json({ error: "Enter the code." }, 400);

    const { data: rows } = await admin
      .from("phone_verifications")
      .select("id, code_hash, attempts, expires_at, verified_at")
      .eq("phone", ph)
      .order("created_at", { ascending: false })
      .limit(1);

    const rec = rows?.[0];
    if (!rec) return json({ verified: false, error: "Request a code first." }, 400);
    if (new Date(rec.expires_at) < new Date()) return json({ verified: false, error: "That code expired — request a new one." }, 400);
    if (rec.attempts >= MAX_ATTEMPTS) return json({ verified: false, error: "Too many tries — request a new code." }, 429);

    await admin.from("phone_verifications").update({ attempts: rec.attempts + 1 }).eq("id", rec.id);

    if (sha(code) !== rec.code_hash) return json({ verified: false, error: "That code doesn't match." }, 400);

    await admin.from("phone_verifications").update({ verified_at: new Date().toISOString() }).eq("id", rec.id);
    return json({ verified: true }, 200);
  }

  return json({ error: "action must be 'send' or 'check'." }, 400);
}
