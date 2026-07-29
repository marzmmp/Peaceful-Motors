"use client";

// app/login/page.js — NEW PAGE. Nothing existing was modified to add this.
//
// ─────────────────────────────────────────────────────────────────────
// DESIGN NOTE FOR WHOEVER TOUCHES THIS NEXT:
// This is deliberately NOT a new design. Every color, class string, and
// piece of structure below is copied from the app's existing PIN gate
// (components/PeacefulEstimate.jsx, around line 1375) so this reads as
// the same product, not a bolted-on login. If you restyle it, restyle it
// to match that screen — do not introduce a second visual language.
//
// The palette is the component's own `C` object:
//   maroon #7A1F1F · ink #141414 · panel #1E1E1E · line #2E2E2E · green #2E7D32
// The input class string is the component's `input` const, verbatim.
// ─────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS: the PIN screen inside the app stamps jobs to the right
// tech — it was never security, and the README says so. This is the real
// account boundary. The PIN gate still runs behind it, unchanged.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase-browser";

const C = {
  maroon: "#7A1F1F",
  green: "#2E7D32",
  ink: "#141414",
  panel: "#1E1E1E",
  line: "#2E2E2E",
};

const BRAND = { name: "PEACEFUL MOTORS", tagline: "An Ease of Mind is Simply Divine." };

const input =
  "w-full bg-neutral-800 text-neutral-100 rounded-lg px-3 py-2.5 text-base border border-neutral-700 focus:outline-none focus:border-neutral-400 min-h-[44px]";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState("in"); // "in" | "up" | "reset"
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => {
      if (data?.user) router.replace("/");
    });
  }, [router]);

  async function submit() {
    setMsg("");
    if (!email.includes("@")) return setMsg("Enter your email address.");
    if (mode !== "reset" && pw.length < 8) return setMsg("Password needs to be at least 8 characters.");

    setBusy(true);
    const sb = supabaseBrowser();
    try {
      if (mode === "in") {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        router.replace("/");
        return;
      }
      if (mode === "up") {
        const { error } = await sb.auth.signUp({
          email,
          password: pw,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        setMsg("Check your email to confirm the account, then sign in.");
        setMode("in");
        return;
      }
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
      setMsg("Reset link sent — check the inbox, and the spam folder.");
      setMode("in");
    } catch (e) {
      setMsg(e.message || "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 text-neutral-100" style={{ background: C.ink }}>
      <div className="w-full max-w-sm rounded-lg p-5" style={{ background: C.panel, border: `1px solid ${C.maroon}` }}>
        <div className="text-center mb-4">
          <div className="text-xl font-black tracking-wide">{BRAND.name}</div>
          <div className="text-xs italic" style={{ color: "#BFE3C0" }}>{BRAND.tagline}</div>
        </div>

        <div className="text-sm font-bold mb-2">
          {mode === "in" ? "Sign in" : mode === "up" ? "Create your account" : "Reset your password"}
        </div>

        <input
          className={input}
          placeholder="Email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        {mode !== "reset" && (
          <input
            className={input + " mt-2"}
            type="password"
            placeholder={mode === "up" ? "Choose a password (8+ characters)" : "Password"}
            autoComplete={mode === "up" ? "new-password" : "current-password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        )}

        <button
          onClick={submit}
          disabled={busy}
          className="w-full mt-3 py-2.5 rounded-lg text-sm font-semibold min-h-[44px] disabled:opacity-60"
          style={{ background: C.green }}
        >
          {busy ? "Working…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
        </button>

        {msg && <div className="text-xs mt-3 text-center" style={{ color: "#F59E0B" }}>{msg}</div>}

        <div className="flex justify-between mt-4 text-xs text-neutral-400">
          {mode !== "in" ? (
            <button className="underline" onClick={() => { setMode("in"); setMsg(""); }}>Back to sign in</button>
          ) : (
            <button className="underline" onClick={() => { setMode("up"); setMsg(""); }}>Create an account</button>
          )}
          {mode === "in" && (
            <button className="underline" onClick={() => { setMode("reset"); setMsg(""); }}>Forgot password</button>
          )}
        </div>

        <div className="text-[10px] text-neutral-500 mt-4">
          This is your account login — it protects the shop&apos;s records. The PIN screen inside the app still
          stamps each job to the right tech.
        </div>
      </div>
    </div>
  );
}
