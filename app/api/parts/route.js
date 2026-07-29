// app/api/parts/route.js — PartsTech / RepairLink plumbing.
// CHANGED: guard() added. Everything else left exactly as it was — the
// drop-in spot and its comments are correct and still apply.
import { NextResponse } from "next/server";
import { guard } from "../../../lib/guard";

export async function POST(req) {
  const gate = await guard(req, { limit: 30 });
  if (gate.blocked) return gate.response;

  let body;
  try { body = await req.json(); }
  catch (e) { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const { provider, query, vin } = body || {};

  const creds = {
    partstech: { account: process.env.PARTSTECH_ACCOUNT, key: process.env.PARTSTECH_API_KEY },
    repairlink: { user: process.env.REPAIRLINK_USER, key: process.env.REPAIRLINK_API_KEY },
  }[provider] || {};

  // ======================================================================
  // >>> DROP-IN SPOT — replace this block with the provider's documented
  // >>> API call once PartsTech / RepairLink issue your API credentials.
  // >>> Shape to return: { results: [{ partNumber, brand, price, availability, supplier }] }
  // ======================================================================
  return NextResponse.json(
    {
      error: "not_yet_connected",
      message:
        `The ${provider || "parts"} API isn't wired yet — this route is the ready plumbing. ` +
        "It activates when the provider issues API credentials and their documented call is dropped into app/api/parts/route.js.",
      received: { provider, query, vin, haveEnvCreds: Boolean(creds.key) },
    },
    { status: 501 }
  );
}
