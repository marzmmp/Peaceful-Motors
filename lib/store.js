// lib/store.js — the shared, tenant-scoped record store.
//
// ─────────────────────────────────────────────────────────────────────
// INTERFACE IS DELIBERATELY IDENTICAL to the localStorage `store` object
// that currently sits at line ~35 of components/PeacefulEstimate.jsx:
//
//     store.set(key, value)  -> true | null
//     store.get(key)         -> { value: "<json string>" } | null
//     store.list(prefix)     -> { keys: [...] } | null
//
// That is why swapping it is a ONE-LINE change in the component and
// zero changes anywhere else. Every existing call site keeps working,
// including the ones that do JSON.parse(r.value).
// ─────────────────────────────────────────────────────────────────────
//
// What changed underneath:
//   • Records live in Postgres, so every device sees the same data.
//   • shop_id is filled in by a database DEFAULT from the session.
//     The browser never sends it and cannot spoof it.
//   • RLS rejects any row belonging to another shop.
//
// Offline behaviour: writes fall back to localStorage and replay on the
// next successful call. A mobile mechanic in a metal building with no
// bars still gets to finish the estimate.

import { supabaseBrowser } from "./supabase-browser";

const QUEUE_KEY = "pm:__outbox";
const CACHE_PREFIX = "pm:__cache:";

/* ------------------------------------------------------------------ */
/* local mirror — read-through cache + offline outbox                  */
/* ------------------------------------------------------------------ */

function lsGet(k) {
  try { return localStorage.getItem(CACHE_PREFIX + k); } catch (e) { return null; }
}
function lsSet(k, jsonString) {
  try { localStorage.setItem(CACHE_PREFIX + k, jsonString); } catch (e) { /* quota */ }
}
function readOutbox() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); } catch (e) { return []; }
}
function writeOutbox(items) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-200))); } catch (e) {}
}
function enqueue(key, value) {
  const q = readOutbox().filter((i) => i.key !== key);
  q.push({ key, value, at: Date.now() });
  writeOutbox(q);
}

/** Replay anything written while offline. Safe to call often. */
export async function flushOutbox() {
  const q = readOutbox();
  if (!q.length) return { flushed: 0 };
  const sb = supabaseBrowser();
  const left = [];
  let flushed = 0;
  for (const item of q) {
    const { error } = await sb
      .from("pm_store")
      .upsert({ key: item.key, value: item.value }, { onConflict: "shop_id,key" });
    if (error) left.push(item);
    else flushed++;
  }
  writeOutbox(left);
  return { flushed, pending: left.length };
}

/* ------------------------------------------------------------------ */
/* the store                                                           */
/* ------------------------------------------------------------------ */

export const store = {
  async set(key, value) {
    lsSet(key, JSON.stringify(value));
    try {
      const sb = supabaseBrowser();
      // shop_id intentionally omitted — the DB default supplies it.
      const { error } = await sb
        .from("pm_store")
        .upsert({ key, value }, { onConflict: "shop_id,key" });
      if (error) { enqueue(key, value); return null; }
      return true;
    } catch (e) {
      enqueue(key, value);
      return null;
    }
  },

  async get(key) {
    try {
      const sb = supabaseBrowser();
      const { data, error } = await sb
        .from("pm_store")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const cached = lsGet(key);
        return cached == null ? null : { value: cached };
      }
      const asString = JSON.stringify(data.value);
      lsSet(key, asString);
      return { value: asString };
    } catch (e) {
      const cached = lsGet(key);
      return cached == null ? null : { value: cached };
    }
  },

  async list(prefix) {
    try {
      const sb = supabaseBrowser();
      const { data, error } = await sb
        .from("pm_store")
        .select("key")
        .like("key", (prefix || "") + "%")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return { keys: (data || []).map((r) => r.key) };
    } catch (e) {
      try {
        const p = CACHE_PREFIX + (prefix || "");
        const keys = Object.keys(localStorage)
          .filter((k) => k.startsWith(p))
          .map((k) => k.slice(CACHE_PREFIX.length));
        return { keys };
      } catch (e2) { return null; }
    }
  },

  async remove(key) {
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.from("pm_store").delete().eq("key", key);
      return error ? null : true;
    } catch (e) { return null; }
  },
};

/* ------------------------------------------------------------------ */
/* one-time migration off the old per-device localStorage store        */
/* ------------------------------------------------------------------ */
// The original store wrote under the raw "pm:" prefix. This lifts any of
// those records into the cloud once, then marks itself done. Call it
// after sign-in; it is a no-op on every device that has already run it.
export async function migrateLegacyLocalStorage() {
  try {
    if (localStorage.getItem("pm:__migrated") === "1") return { migrated: 0 };
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith("pm:") && !k.startsWith(CACHE_PREFIX) && k !== QUEUE_KEY && k !== "pm:__migrated");
    let migrated = 0;
    for (const full of keys) {
      const key = full.slice(3);
      let parsed;
      try { parsed = JSON.parse(localStorage.getItem(full)); } catch (e) { continue; }
      const ok = await store.set(key, parsed);
      if (ok) migrated++;
    }
    localStorage.setItem("pm:__migrated", "1");
    return { migrated };
  } catch (e) {
    return { migrated: 0, error: String(e) };
  }
}
