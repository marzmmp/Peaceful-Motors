// lib/customers.js — puts customers on file so the consent gate has
// something to check (CLAUDE.md Task 4).
//
// /api/sms already refuses to text a customer whose customers.notify_ok
// is false — but customers only lived inside estimate JSON, so the gate
// never had a row to look at. This writes/refreshes the row whenever an
// estimate is saved or a status text is about to go out.
//
// Matching is by the last 10 phone digits, the same match /api/sms uses.
// shop_id is NEVER sent — the database default fills it from the session,
// and RLS keeps every row inside this shop.

import { supabaseBrowser } from "./supabase-browser";

/**
 * Upsert the customer attached to an estimate. Accepts the exact
 * meta.customer shape the component already holds:
 *     { name, phone, email, address, notify }
 * Returns the customer id, or null (offline / no phone / RLS denied —
 * all silent by design; this must never block a save).
 */
export async function upsertCustomerRecord(cust) {
  const phone = String(cust?.phone || "").trim();
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null; // nothing the consent gate could ever match

  const notifyOk = cust.notify !== false;
  try {
    const sb = supabaseBrowser();
    const { data: found } = await sb
      .from("customers")
      .select("id, notify_ok")
      .ilike("phone", "%" + digits.slice(-10))
      .limit(1);
    const existing = found && found[0];

    const fields = {
      name: cust.name || null,
      phone,
      email: cust.email || null,
      address: cust.address || null,
      notify_ok: notifyOk,
    };

    if (existing) {
      const patch = { ...fields };
      if (existing.notify_ok !== notifyOk) patch.notify_consent_at = new Date().toISOString();
      const { error } = await sb.from("customers").update(patch).eq("id", existing.id);
      return error ? null : existing.id;
    }

    const { data, error } = await sb
      .from("customers")
      .insert({ ...fields, notify_consent_at: notifyOk ? new Date().toISOString() : null })
      .select("id")
      .limit(1);
    return error ? null : (data && data[0] && data[0].id) || null;
  } catch (e) {
    return null;
  }
}
