import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase.js";
import { LiquidGlass } from "./LiquidGlass.jsx";
import { Pressable } from "./ui.jsx";

// Shown in place of a gated panel once the trial + hidden grace window has
// fully expired (docs/TODO.md §17.E). Self-contained, same
// getSession()/Bearer-token checkout pattern as ProfilePanel's AccountDetail.
// onClose is optional — omitted when this replaces a whole panel (Income/Log,
// nothing to "go back to" besides switching tabs); passed when triggered as
// an overlay on top of read-only Home/Budget, which do have content behind it.
export function UpgradeModal({ onClose } = {}) {
  const [checkoutState, setCheckoutState] = useState({ plan: null, error: null });

  async function handleCheckout(plan) {
    setCheckoutState({ plan, error: null });
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setCheckoutState({ plan: null, error: "No active session found." });
      return;
    }

    try {
      const res = await fetch("/api/stripe-create-checkout", {
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

  const planBtnStyle = (plan, activeBg, activeColor) => ({
    padding: "14px 16px",
    borderRadius: "12px",
    background: plan === "annual" ? activeBg : "var(--color-bg-raised)",
    border: plan === "annual" ? "none" : "1px solid var(--color-border-subtle)",
    color: plan === "annual" ? activeColor : "var(--color-text-primary)",
    textAlign: "left",
    cursor: checkoutState.plan ? "default" : "pointer",
    opacity: checkoutState.plan && checkoutState.plan !== plan ? 0.5 : 1,
  });

  return createPortal(
    <div
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, overflowY: "auto", padding: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <LiquidGlass purpose="modal" tone="teal" intensity="strong" style={{ maxWidth: "420px", width: "100%", padding: "28px 24px", borderRadius: "18px", position: "relative" }}>
        {onClose && (
          <Pressable onClick={onClose} aria-label="Dismiss" style={{ position: "absolute", top: "14px", right: "14px", background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", fontSize: "16px", padding: "4px 8px" }}>✕</Pressable>
        )}
        <div style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-gold)", marginBottom: "8px" }}>
          Authority Finance Premium
        </div>
        <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--color-text-primary)", marginBottom: "10px" }}>
          Your free trial has ended
        </div>
        <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "22px", lineHeight: 1.5 }}>
          Subscribe to keep editing your income, budget, and goals.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Pressable onClick={() => handleCheckout("monthly")} disabled={checkoutState.plan !== null} style={planBtnStyle("monthly")}>
            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Monthly</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              {checkoutState.plan === "monthly" ? "Redirecting…" : "$14.99/mo"}
            </div>
          </Pressable>
          <Pressable onClick={() => handleCheckout("annual")} disabled={checkoutState.plan !== null} style={planBtnStyle("annual", "var(--color-gold)", "var(--color-bg-base)")}>
            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Annual — Best Value</div>
            <div style={{ fontSize: "12px" }}>
              {checkoutState.plan === "annual" ? "Redirecting…" : "$10.00/mo billed annually ($120/yr)"}
            </div>
          </Pressable>
        </div>
        {checkoutState.error && (
          <div style={{ fontSize: "12px", color: "var(--color-deduction)", marginTop: "14px" }}>{checkoutState.error}</div>
        )}
      </LiquidGlass>
    </div>,
    document.body,
  );
}
