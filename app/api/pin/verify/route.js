// app/api/pin/verify/route.js — the PIN gate's real check (CLAUDE.md Task 2).
//
// PINs used to be compared in the browser against a plaintext roster —
// which, once the roster moved to the shared database, was a credential
// list readable on every signed-in device. Verification now happens here:
// the roster row never leaves the server and hashes compare with
// timingSafeEqual.
//
// A legacy plaintext entry is upgraded the first time it verifies: the
// response carries the new hash and the client persists the roster through
// the same store path it already uses — no separate migration to run.
//
// Perspective: the Supabase session (middleware + guard) is what protects
// the records. This PIN stamps WHO at the shop did the work. It gets a
// tight rate limit anyway — 10 tries/min/IP keeps brute force boring.
import { guard } from "../../../../lib/guard";
import { supabaseServer } from "../../../../lib/supabase-server";
import { hashPin, verifyPinHash } from "../../../../lib/pin";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  const gate = await guard(req, { limit: 10 });
  if (gate.blocked) return gate.response;

  try {
    const { name, pin } = await req.json();
    if (!name || pin == null) return json({ ok: false, error: "name and pin required" }, 400);

    const sb = await supabaseServer();
    const { data } = await sb
      .from("pm_store")
      .select("value")
      .eq("key", "techs:roster")
      .maybeSingle();
    const roster = Array.isArray(data?.value) ? data.value : null;

    // No shared roster row (or this tech isn't in it yet — e.g. added
    // offline and not flushed). Tell the client so its legacy local
    // fallback can decide; nothing here to verify against.
    const t = roster && roster.find((x) => x && x.name === name);
    if (!t) return json({ ok: false, noRoster: true }, 200);

    if (t.pinHash) return json({ ok: verifyPinHash(pin, t.pinHash) }, 200);

    if (t.pin != null) {
      if (String(t.pin) !== String(pin)) return json({ ok: false }, 200);
      // Legacy plaintext matched — hand back a hash so the client
      // upgrades the roster record and the plaintext disappears.
      return json({ ok: true, pinHash: hashPin(String(pin)) }, 200);
    }

    return json({ ok: false }, 200);
  } catch (e) {
    return json({ ok: false, error: "verify failed" }, 500);
  }
}
