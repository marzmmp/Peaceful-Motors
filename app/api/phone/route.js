// app/api/phone/route.js — provisions the shop's Twilio number.
//
// CHANGED: guard(role:"owner"). This route SPENDS MONEY — it buys phone
// numbers. Anonymous access meant an attacker could loop it and rack up
// charges on the shop's Twilio account without limit. Owner-only now,
// and rate limited to 3/minute on top of that.
import { guard } from "../../../lib/guard";

const json = (obj, status) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  const gate = await guard(req, { limit: 3, role: "owner" });
  if (gate.blocked) return gate.response;

  try {
    const { areaCode } = await req.json();
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok) {
      return json({ error: "Twilio not configured — set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN, then this button provisions the shop's number." }, 501);
    }
    const auth = "Basic " + Buffer.from(sid + ":" + tok).toString("base64");

    const q = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/US/Local.json?SmsEnabled=true&AreaCode=${encodeURIComponent(areaCode || "314")}&PageSize=1`,
      { headers: { Authorization: auth } }
    );
    const qd = await q.json();
    const num = qd.available_phone_numbers?.[0]?.phone_number;
    if (!num) return json({ error: "No numbers available in that area code — try another." }, 404);

    const buy = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ PhoneNumber: num }),
    });
    const bd = await buy.json();
    if (!buy.ok) return json({ error: bd.message || "purchase failed" }, 502);
    return json({ number: bd.phone_number }, 200);
  } catch (e) {
    return json({ error: "phone service error" }, 500);
  }
}
