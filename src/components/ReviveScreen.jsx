/**
 * ReviveScreen — §17.I account revival (docs/TODO.md).
 *
 * Rendered by App.jsx INSTEAD of the normal app whenever the signed-in
 * session's email matches an open deleted_accounts tombstone (checkRevival).
 * Not a nav destination — the only ways in are the SIGNED_IN short-circuit
 * and LoginScreen's failed-login routing (which lands here after the user
 * re-authenticates).
 *
 * Access is restored only by a successful charge: the plan buttons open a
 * Stripe Checkout via api/stripe-revive-checkout, and the webhook's revival
 * branch restores the archived data + consumes the tombstone. App.jsx clears
 * this screen when subscription_status flips to active (post-checkout poll).
 *
 * The "two-way door" (§I): a failed/abandoned checkout lands back here with
 * checkoutReturn === "cancel" — the screen stays fully usable so the user can
 * immediately retry with the same or a different card.
 */
import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { Shell } from "./LoginScreen.jsx";
import { Pressable } from "./ui.jsx";

export function ReviveScreen({ revival, checkoutReturn }) {
  const [checkoutState, setCheckoutState] = useState({ plan: null, error: null });

  async function handleReviveCheckout(plan) {
    setCheckoutState({ plan, error: null });
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setCheckoutState({ plan: null, error: "No active session found." });
      return;
    }
    try {
      const res = await fetch("/api/stripe-revive-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ plan }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setCheckoutState({ plan: null, error: payload?.error || "Failed to start checkout." });
        return;
      }
      window.location.href = payload.url;
    } catch {
      setCheckoutState({ plan: null, error: "Failed to start checkout." });
    }
  }

  const finalizing = checkoutReturn === "success";

  return (
    <Shell
      title="Welcome back"
      subtitle="This account was closed for non-payment, but your data was saved."
    >
      {/* Archived identity so the user recognizes their old account */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", marginBottom: "18px" }}>
        {revival?.avatarUrl && (
          <img src={revival.avatarUrl} alt="" style={{ width: "36px", height: "36px", borderRadius: "50%" }} />
        )}
        <div style={{ minWidth: 0 }}>
          {revival?.displayName && (
            <div className="text-base" style={{ fontWeight: "600", color: "var(--color-text-primary)" }}>{revival.displayName}</div>
          )}
          <div className="text-xs" style={{ color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>{revival?.email}</div>
        </div>
      </div>

      {finalizing ? (
        <div className="text-base" style={{ color: "var(--color-text-primary)", lineHeight: 1.6 }}>
          Payment received — restoring your account…
        </div>
      ) : (
        <>
          <div className="text-base" style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, marginBottom: "18px" }}>
            Pick a plan to restore your account. Your income setup, budget, goals,
            and history come back exactly as you left them — as soon as your
            payment goes through.
          </div>

          {checkoutReturn === "cancel" && (
            <div className="text-xs" style={{ padding: "10px 14px", background: "rgba(224,92,92,0.1)", border: "1px solid rgba(224,92,92,0.35)", borderRadius: "6px", color: "var(--color-deduction)", lineHeight: 1.5, marginBottom: "16px" }}>
              Your payment didn't go through. If your card was declined, try a
              different payment method, make sure the card isn't frozen, or add
              funds to the account — then try again.
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <Pressable
              onClick={() => handleReviveCheckout("monthly")}
              disabled={checkoutState.plan !== null}
              style={{ padding: "14px 16px", borderRadius: "12px", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", color: "var(--color-text-primary)", textAlign: "left", cursor: checkoutState.plan ? "default" : "pointer", opacity: checkoutState.plan && checkoutState.plan !== "monthly" ? 0.5 : 1 }}
            >
              <div className="text-md" style={{ fontWeight: "bold" }}>Monthly</div>
              <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                {checkoutState.plan === "monthly" ? "Redirecting…" : "$14.99/mo"}
              </div>
            </Pressable>
            <Pressable
              onClick={() => handleReviveCheckout("annual")}
              disabled={checkoutState.plan !== null}
              style={{ padding: "14px 16px", borderRadius: "12px", background: "var(--color-teal)", border: "none", color: "var(--color-bg-base)", textAlign: "left", cursor: checkoutState.plan ? "default" : "pointer", opacity: checkoutState.plan && checkoutState.plan !== "annual" ? 0.5 : 1 }}
            >
              <div className="text-md" style={{ fontWeight: "bold" }}>Annual — Best Value</div>
              <div className="text-sm">
                {checkoutState.plan === "annual" ? "Redirecting…" : "$10.00/mo billed annually ($120/yr)"}
              </div>
            </Pressable>
          </div>

          {checkoutState.error && (
            <div className="text-sm" style={{ color: "var(--color-deduction)", marginTop: "14px" }}>{checkoutState.error}</div>
          )}
        </>
      )}

      <div style={{ marginTop: "22px", textAlign: "center" }}>
        <button
          onClick={async () => { await supabase.auth.signOut({ scope: "local" }); }}
          className="text-xs" style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
        >
          Not you? Sign out
        </button>
      </div>
    </Shell>
  );
}
