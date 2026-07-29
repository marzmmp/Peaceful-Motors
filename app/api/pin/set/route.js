// app/api/pin/set/route.js — mint a hash for a new PIN (CLAUDE.md Task 2).
//
// Used by the Admin roster's "Set new PIN" box, a tech's own "My PIN"
// field, the Add-technician flow, and the first-run owner setup. Any
// signed-in shop member may call it: the route is a pure hashing service,
// and WRITE access to the roster record itself is what RLS governs — the
// same trust model the store already has. The browser keeps only the
// returned hash; the plaintext PIN dies with this request.
import { guard } from "../../../../lib/guard";
import { hashPin } from "../../../../lib/pin";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  const gate = await guard(req, { limit: 20 });
  if (gate.blocked) return gate.response;

  try {
    const { pin } = await req.json();
    const p = String(pin || "").trim();
    if (p.length < 4) return json({ error: "PIN needs at least 4 digits." }, 400);
    return json({ ok: true, pinHash: hashPin(p) }, 200);
  } catch (e) {
    return json({ error: "bad request" }, 400);
  }
}
