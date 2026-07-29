// lib/pin.js — server-only PIN hashing (CLAUDE.md Task 2).
//
// scrypt via node:crypto, so it adds no dependency. Stored format:
//
//     s1$<salt hex>$<derived key hex>
//
// The PIN itself is never stored, logged, or sent back to a browser.
// Compare with verifyPinHash only — it uses timingSafeEqual.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

export function hashPin(pin) {
  const salt = randomBytes(16);
  const dk = scryptSync(String(pin), salt, 32);
  return `s1$${salt.toString("hex")}$${dk.toString("hex")}`;
}

export function verifyPinHash(pin, stored) {
  try {
    const [v, saltHex, hashHex] = String(stored || "").split("$");
    if (v !== "s1" || !saltHex || !hashHex) return false;
    const want = Buffer.from(hashHex, "hex");
    const got = scryptSync(String(pin), Buffer.from(saltHex, "hex"), want.length);
    return timingSafeEqual(got, want);
  } catch (e) {
    return false;
  }
}
