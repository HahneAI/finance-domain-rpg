import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { LiquidGlass } from "./LiquidGlass.jsx";
import { Pressable } from "./ui.jsx";

// Shared Liquid-Glass upgrade card — the actual pitch + checkout buttons,
// with no opinion on how it's presented. Used by both UpgradeModal (portal
// overlay on top of read-only Home/Budget) and UpgradePanel (a real panel
// that replaces Income/Log entirely, docs/TODO.md §17.E). Same
// getSession()/Bearer-token checkout pattern as ProfilePanel's AccountDetail.
export function UpgradeCard({ onClose, tagline } = {}) {
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

  return (
    <LiquidGlass purpose="modal" tone="teal" intensity="strong" style={{ maxWidth: "420px", width: "100%", padding: "28px 24px", borderRadius: "18px", position: "relative" }}>
      {onClose && (
        <Pressable onClick={onClose} aria-label="Dismiss" style={{ position: "absolute", top: "14px", right: "14px", background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", fontSize: "16px", padding: "4px 8px" }}>✕</Pressable>
      )}
      {tagline && (
        <div className="text-base" style={{ color: "var(--color-text-primary)", marginBottom: "14px" }}>
          {tagline}
        </div>
      )}
      <div className="text-xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)", marginBottom: "8px" }}>
        Authority Finance Premium
      </div>
      <div style={{ fontSize: "20px", fontWeight: "bold", color: "var(--color-text-primary)", marginBottom: "10px" }}>
        Your free trial has ended
      </div>
      <div className="text-base" style={{ color: "var(--color-text-secondary)", marginBottom: "22px", lineHeight: 1.5 }}>
        Subscribe to keep editing your income, budget, and goals.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <Pressable onClick={() => handleCheckout("monthly")} disabled={checkoutState.plan !== null} style={planBtnStyle("monthly")}>
          <div className="text-md" style={{ fontWeight: "bold" }}>Monthly</div>
          <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {checkoutState.plan === "monthly" ? "Redirecting…" : "$14.99/mo"}
          </div>
        </Pressable>
        <Pressable onClick={() => handleCheckout("annual")} disabled={checkoutState.plan !== null} style={planBtnStyle("annual", "var(--color-teal)", "var(--color-bg-base)")}>
          <div className="text-md" style={{ fontWeight: "bold" }}>Annual — Best Value</div>
          <div className="text-sm" style={{ }}>
            {checkoutState.plan === "annual" ? "Redirecting…" : "$10.00/mo billed annually ($120/yr)"}
          </div>
        </Pressable>
      </div>
      {checkoutState.error && (
        <div className="text-sm" style={{ color: "var(--color-deduction)", marginTop: "14px" }}>{checkoutState.error}</div>
      )}
    </LiquidGlass>
  );
}
