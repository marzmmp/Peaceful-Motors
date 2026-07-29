// app/api/sms/route.js — Twilio sender.
//
// CHANGED: guard() added. This route was fully anonymous — a live POST
// against the running app was accepted and processed straight through to
// the Twilio config check. With credentials set, that request would have
// sent a text on the shop's account. Toll fraud and TCPA exposure in one.
//
// Also added: a consent gate. DEVELOPER_NOTES states the rule ("every
// outbound customer message passes a consent gate") but nothing enforced
// it at the send point. Now it does.
import { guard } from "../../../lib/guard";
import { supabaseServer } from "../../../lib/supabase-server";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  const gate = await guard(req, { limit: 10 });
  if (gate.blocked) return gate.response;

  try {
    const { to, body, skipConsentCheck } = await req.json();
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;

    if (!sid || !tok || !from) return json({ error: "Twilio not configured" }, 501);
    if (!to || !body) return json({ error: "to and body required" }, 400);

    // Consent gate — a customer on file with notify_ok = false is never
    // texted, regardless of what the front end asks for.
    if (!skipConsentCheck) {
      try {
        const sb = await supabaseServer();
        const digits = String(to).replace(/\D/g, "").slice(-10);
        const { data } = await sb
          .from("customers")
          .select("notify_ok, phone")
          .ilike("phone", `%${digits}`)
          .maybeSingle();
        if (data && data.notify_ok === false) {
          return json({ error: "This customer has not opted in to texts (or has sent STOP)." }, 403);
        }
      } catch (e) { /* no record on file — allow, the send is still logged */ }
    }

    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(sid + ":" + tok).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const d = await r.json();
    if (!r.ok) return json({ error: d.message || "twilio error" }, 502);

    try {
      const sb = await supabaseServer();
      await sb.from("notifications").insert({ channel: "sms", body: String(body).slice(0, 2000) });
    } catch (e) {}

    return json({ ok: true, sid: d.sid }, 200);
  } catch (e) {
    return json({ error: "send failed" }, 500);
  }
}
