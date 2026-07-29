// app/api/carfax/route.js — CARFAX Service Network plumbing.
// CHANGED: guard() added. Drop-in spot and comments unchanged.
import { guard } from "../../../lib/guard";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  const gate = await guard(req, { limit: 20 });
  if (gate.blocked) return gate.response;

  try {
    const { entries } = await req.json();
    if (!process.env.CARFAX_PARTNER_KEY) {
      return json({
        error: "CARFAX partnership not yet in place",
        note: "Queue is stored in-app (carfax:queue) and export-ready. Apply via the CARFAX Service Network partner program; set CARFAX_PARTNER_KEY when issued.",
        received: Array.isArray(entries) ? entries.length : 0,
      }, 501);
    }
    // >>> DROP-IN SPOT: CARFAX partner submission call per their issued docs <<<
    return json({ error: "partner call not yet implemented" }, 501);
  } catch (e) {
    return json({ error: "bad request" }, 400);
  }
}
