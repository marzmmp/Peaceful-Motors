// app/api/pin/reset/route.js — "Forgot your PIN?" made real (CLAUDE.md Task 2).
//
// The old flow generated the temporary PIN in the browser, emailed it, and
// wrote it to the shared roster in plaintext. Now the server generates it,
// emails it through the same Resend transport /api/email uses (wording
// unchanged from the original), and returns only the scrypt hash for the
// client to store. The plaintext temp PIN exists in the email and nowhere
// else. Signed-in users only; 3/min/IP keeps mailbox flooding boring.
import { guard } from "../../../../lib/guard";
import { supabaseServer } from "../../../../lib/supabase-server";
import { hashPin } from "../../../../lib/pin";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  const gate = await guard(req, { limit: 3 });
  if (gate.blocked) return gate.response;

  if (!process.env.RESEND_API_KEY) {
    return json({ error: "Email resets need RESEND_API_KEY set on this deployment." }, 501);
  }

  try {
    const { name } = await req.json();
    if (!name) return json({ error: "name required" }, 400);

    const sb = await supabaseServer();
    const { data } = await sb
      .from("pm_store")
      .select("value")
      .eq("key", "techs:roster")
      .maybeSingle();
    const roster = Array.isArray(data?.value) ? data.value : null;
    const t = roster && roster.find((x) => x && x.name === name);
    if (!t) return json({ error: "No such tech on the roster." }, 404);
    if (!t.email) return json({ error: "No email saved for this tech." }, 400);

    // Shop identity from the database, same as /api/email.
    let shopName = "PEACEFUL MOTORS";
    try {
      const { data: shop } = await sb.from("shops").select("name").maybeSingle();
      if (shop?.name) shopName = shop.name;
    } catch (e) { /* fall back to default */ }

    const temp = String(Math.floor(100000 + Math.random() * 900000));
    const from = process.env.EMAIL_FROM || "Peaceful Motors <onboarding@resend.dev>";

    const upstream = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from,
        to: [t.email],
        subject: shopName + " — PIN reset",
        text: `Hi ${t.name},\n\nYour ${shopName} login PIN was reset by request.\nTemporary PIN: ${temp}\n\nLog in with it, then have the owner set your permanent PIN on the Admin tab.\nIf you didn't request this, tell the owner immediately.`,
      }),
    });
    if (!upstream.ok) return json({ error: "email send failed" }, 502);

    // Only the hash goes back — the client persists it to the roster
    // through the same saveTechs path the old flow already used.
    return json({ ok: true, pinHash: hashPin(temp) }, 200);
  } catch (e) {
    return json({ error: "reset failed" }, 500);
  }
}
