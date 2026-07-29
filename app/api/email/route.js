// app/api/email/route.js — outbound email via Resend.
//
// CHANGED, and every one of these was a real exposure:
//   1. guard() — was fully anonymous. Anyone could send mail from the
//      shop's verified domain with attacker-authored HTML. That is
//      phishing with valid SPF/DKIM.
//   2. HTML is escaped, not passed through.
//   3. The BCC target is now an env var. It was hardcoded to
//      peacefulmotors@outlook.com, which meant every future shop's
//      customer mail would have copied to one personal inbox.
//   4. Branding reads from the shop record, not a constant.
import { NextResponse } from "next/server";
import { guard } from "../../../lib/guard";
import { supabaseServer } from "../../../lib/supabase-server";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function corpWrap(innerSafeHtml, brand) {
  const NAME = brand.name || "Peaceful Motors, LLC";
  const PHONE = brand.phone || "";
  const SITE = brand.site || "";
  const TAG = brand.tagline || "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto">
  <div style="background:#7A1F1F;color:#ffffff;padding:12px 18px;border-radius:10px 10px 0 0;font-weight:800;font-size:16px">${esc(NAME)}</div>
  <div style="border:1px solid #E7DACE;border-top:0;padding:18px;border-radius:0 0 10px 10px;background:#ffffff;color:#241F1F;font-size:14px;line-height:1.6">${innerSafeHtml}
  <hr style="border:none;border-top:1px solid #E7DACE;margin:18px 0 10px"/>
  <div style="font-size:12px;color:#555555"><b>${esc(NAME)}</b> · ${esc(PHONE)} · ${esc(SITE)}<br/>${esc(TAG)}</div>
  <div style="font-size:10px;color:#999999;margin-top:8px">This message and any attachments are intended only for the named recipient and may contain business-confidential information. If you received it in error, please reply to let us know and delete it.</div>
  </div></div>`;
}

export async function POST(req) {
  const gate = await guard(req, { limit: 15 });
  if (gate.blocked) return gate.response;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not set." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch (e) { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  // Shop identity from the database, not a hardcoded constant.
  let brand = { name: "Peaceful Motors, LLC", phone: "", site: "", tagline: "", email: "" };
  try {
    const sb = await supabaseServer();
    const { data } = await sb.from("shops").select("name,phone,site,tagline,email").maybeSingle();
    if (data) brand = { ...brand, ...data };
  } catch (e) { /* fall back to defaults */ }

  const archive = process.env.SHOP_INBOX || brand.email || "";
  const to = body.to && String(body.to).includes("@") ? String(body.to).slice(0, 120) : archive;
  if (!to) return NextResponse.json({ error: "No recipient and no SHOP_INBOX configured." }, { status: 400 });

  const subject = String(body.subject || brand.name).slice(0, 200);
  const text = String(body.text || "").slice(0, 50_000);

  // Caller-supplied HTML is ESCAPED, never trusted. If a future feature
  // genuinely needs rich HTML, build it here from structured fields —
  // do not reopen this hole.
  const inner = body.html
    ? `<pre style="font-family:inherit;white-space:pre-wrap">${esc(String(body.html).slice(0, 100_000))}</pre>`
    : (text ? `<pre style="font-family:inherit;white-space:pre-wrap">${esc(text)}</pre>` : "");

  const from = process.env.EMAIL_FROM || "Peaceful Motors <onboarding@resend.dev>";

  const upstream = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from,
      to: [to],
      bcc: archive && to !== archive ? [archive] : undefined,
      subject,
      text: text || undefined,
      html: inner ? corpWrap(inner, brand) : undefined,
    }),
  });
  const data = await upstream.json();
  return NextResponse.json(data, { status: upstream.status });
}
