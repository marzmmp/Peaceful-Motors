// app/api/claude/route.js — Anthropic vision/drafting proxy.
// CHANGED: added guard() (sign-in + shared rate limit). Model and token
// caps kept exactly as they were — those were already correct.
import { NextResponse } from "next/server";
import { guard } from "../../../lib/guard";

export async function POST(req) {
  const gate = await guard(req, { limit: 20 });
  if (gate.blocked) return gate.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Server misconfigured: ANTHROPIC_API_KEY is not set." }, { status: 500 });
  }

  let body;
  try { body = await req.json(); }
  catch (e) { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  // Model + max_tokens locked server-side so a modified front end can't
  // run up the bill. (Unchanged from the original — it was right.)
  const payload = {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    max_tokens: Math.min(Number(body.max_tokens) || 1000, 1500),
    messages: body.messages,
  };
  if (Array.isArray(body.tools)) payload.tools = body.tools;

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return NextResponse.json({ error: "Could not reach Anthropic." }, { status: 502 });
  }

  const data = await upstream.json();
  console.log(JSON.stringify({
    ts: new Date().toISOString(), shop: gate.shopId, user: gate.user?.id,
    ok: upstream.ok, status: upstream.status,
  }));
  return NextResponse.json(data, { status: upstream.status });
}
