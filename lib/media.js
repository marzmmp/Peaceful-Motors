// lib/media.js — makes job photos and videos survive a page reload.
//
// This fixes the single worst bug in the app: custPhotos lived only in
// React state, so every photo vanished on refresh and the customer
// report silently emitted "(no media attached)".
//
// ─────────────────────────────────────────────────────────────────────
// SHAPE CONTRACT — this is what keeps the UI untouched.
//
// loadMedia() returns EXACTLY the object shape the component already
// renders today:
//
//     { dataUrl, caption, comment, kind }
//
// components/PeacefulEstimate.jsx renders p.dataUrl at lines ~1110,
// ~1714, ~2065-2066 and edits p.caption / p.comment at ~2069-2070.
// None of that changes. Not one line of JSX, not one class name.
// ─────────────────────────────────────────────────────────────────────
//
// Bytes go to Supabase Storage under <shop_id>/<estimate_no>/<file>.
// The database keeps only the path. Base64 in a jsonb column would blow
// the browser's ~5 MB localStorage ceiling on the second photo, which is
// why the old code could never have persisted it as written.

import { supabaseBrowser } from "./supabase-browser";

const BUCKET = "media";

// Same downscale the customer portal already uses (component line ~644):
// longest edge 900px, JPEG quality 0.7. Matching it keeps every photo in
// the app looking identical to what the portal already produces.
const MAX_EDGE = 900;
const JPEG_QUALITY = 0.7;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(b64 || "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function currentShopId() {
  const sb = supabaseBrowser();
  const { data } = await sb.rpc("current_shop_id");
  return data || null;
}

function safeName(estimateNo, i, ext) {
  const stamp = Date.now().toString(36);
  return `${String(estimateNo).replace(/[^\w.-]/g, "_")}/${stamp}-${i}.${ext}`;
}

/* ------------------------------------------------------------------ */
/* save                                                                */
/* ------------------------------------------------------------------ */

/**
 * Persist an estimate's media. Accepts the SAME custPhotos array the
 * component already holds — items shaped { dataUrl, caption, comment, kind }.
 * Items that already carry a `path` are treated as saved and only have
 * their caption/comment refreshed, so re-saving is cheap.
 */
export async function saveMedia(estimateNo, items) {
  if (!estimateNo || !Array.isArray(items)) return { saved: 0 };
  const sb = supabaseBrowser();
  const shopId = await currentShopId();
  if (!shopId) return { saved: 0, error: "no shop" };

  // Replace this estimate's rows wholesale — simplest correct semantics.
  await sb.from("media").delete().eq("estimate_no", String(estimateNo));

  const rows = [];
  let i = 0;
  for (const item of items) {
    i++;
    const kind = item.kind === "video" ? "video" : "photo";
    let path = item.path;

    if (!path && item.dataUrl) {
      let blob = dataUrlToBlob(item.dataUrl);
      let ext = kind === "video" ? (blob.type.includes("webm") ? "webm" : "mp4") : "jpg";

      if (kind === "photo") {
        try { blob = await shrinkImage(new File([blob], "p.jpg", { type: blob.type })); ext = "jpg"; }
        catch (e) { /* keep original if the canvas path fails */ }
      }

      path = `${shopId}/${safeName(estimateNo, i, ext)}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type,
        upsert: true,
      });
      if (error) continue;
    }
    if (!path) continue;

    rows.push({
      estimate_no: String(estimateNo),
      path,
      kind,
      caption: item.caption || null,
      comment: item.comment || null,
      sort_order: i,
    });
  }

  if (rows.length) {
    const { error } = await sb.from("media").insert(rows);
    if (error) return { saved: 0, error: error.message };
  }
  return { saved: rows.length };
}

/* ------------------------------------------------------------------ */
/* load                                                                */
/* ------------------------------------------------------------------ */

/**
 * Rehydrate an estimate's media into the exact shape the UI renders.
 * Returns [{ dataUrl, caption, comment, kind, path }] — `dataUrl` holds a
 * signed URL, which <img src> and <video src> consume identically to a
 * base64 data URL. That is why no JSX changes.
 */
export async function loadMedia(estimateNo) {
  if (!estimateNo) return [];
  const sb = supabaseBrowser();
  const { data, error } = await sb
    .from("media")
    .select("path, kind, caption, comment, sort_order")
    .eq("estimate_no", String(estimateNo))
    .order("sort_order", { ascending: true });
  if (error || !data) return [];

  const out = [];
  for (const row of data) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(row.path, 60 * 60 * 8);
    if (!signed?.signedUrl) continue;
    out.push({
      dataUrl: signed.signedUrl,
      caption: row.caption || "",
      comment: row.comment || "",
      kind: row.kind,
      path: row.path,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* embed — for the downloadable customer report                        */
/* ------------------------------------------------------------------ */

/**
 * The customer report is a single self-contained HTML file that gets
 * texted or emailed, so it cannot reference signed URLs that expire.
 * This inlines each item back to base64 just for that export.
 * Stills only — videos stay as links, exactly as the README advises.
 */
export async function embedMediaForReport(items) {
  return inlineItems(items, { videos: false });
}

/**
 * Backup export (CLAUDE.md Task 5). A backup that references signed URLs
 * dies in 8 hours, so everything — videos included — is inlined to base64.
 * One estimate at a time so a single bad file never sinks the whole dump.
 * Items that refuse to inline keep their signed URL plus an honest note.
 */
export async function embedMediaForBackup(estimateNo) {
  const items = await loadMedia(estimateNo);
  const out = await inlineItems(items, { videos: true });
  return out.map(({ dataUrl, caption, comment, kind, path }) => ({
    caption: caption || "",
    comment: comment || "",
    kind,
    path,
    ...(String(dataUrl).startsWith("data:")
      ? { dataUrl }
      : { signedUrl: dataUrl, note: "inline failed — this link expires ~8 hours after export" }),
  }));
}

async function inlineItems(items, { videos }) {
  const out = [];
  for (const it of items || []) {
    if ((!videos && it.kind === "video") || !it.dataUrl) { out.push(it); continue; }
    if (it.dataUrl.startsWith("data:")) { out.push(it); continue; }
    try {
      const res = await fetch(it.dataUrl);
      const blob = await res.blob();
      const b64 = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      });
      out.push({ ...it, dataUrl: b64 });
    } catch (e) { out.push(it); }
  }
  return out;
}
