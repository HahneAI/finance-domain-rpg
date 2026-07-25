import { useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase.js";
import { redeemBetaCode, logBetaFeedback } from "../lib/db.js";
import { dhlEmployerMatchRate, computeNet, toLocalIso } from "../lib/finance.js";
import { BENEFIT_OPTIONS, DHL_PRESET, MONTH_FULL } from "../constants/config.js";
import { iS, lS, Card, Pressable, useFoldTransition, PanelHero, SH } from "./ui.jsx";
import { formatRotationDisplay } from "../lib/rotation.js";
import { canAccessTaxPlan, isTrackedBetaTester } from "../lib/entitlements.js";
import { getEntitlement } from "../lib/subscription.js";
import { InvestorAdminPanel } from "./InvestorAdminPanel.jsx";

// Account panel uses white (primary) labels instead of the shared dim label color.
const lSp = { ...lS, color: "var(--color-text-primary)" };

const BENEFIT_LABELS = {
  health: "Health / Medical",
  dental: "Dental",
  vision: "Vision",
  ltd:    "LTD",
  std:    "STD",
  life:   "Life / AD&D",
  hsa:    "HSA",
  fsa:    "FSA",
  k401:   "401K / Retirement",
};

function fmt(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Shared layout atoms ─────────────────────────────────────────────────────

// Back nav header used by all sub-views
function BackBar({ onBack, title }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
      <Pressable
        onClick={onBack}
        style={{ background: "transparent", border: "none", color: "var(--color-teal)", cursor: "pointer", fontSize: "13px", padding: "4px 0", display: "flex", alignItems: "center", gap: "5px" }}
      >
        <span style={{ fontSize: "16px", lineHeight: 1 }}>‹</span>
        <span style={{ letterSpacing: "1.5px", textTransform: "uppercase", fontSize: "10px" }}>Profile</span>
      </Pressable>
      <div style={{ flex: 1, fontSize: "13px", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
        {title}
      </div>
    </div>
  );
}

// Read-only detail row used inside sub-views
// Small grayed-out padlock — flags a value that's showing a locked default
// (e.g. "Standard withholding" while the Tax Plan feature is gated) rather
// than a real user election, without implying the row itself is clickable.
function LockIcon({ style }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-text-disabled)", flexShrink: 0, ...style }}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function DetailRow({ label, value, valueColor, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: last ? "none" : "1px solid #1e1e1e" }}>
      <span style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: "600", color: valueColor || "var(--color-text-primary)", textAlign: "right", maxWidth: "55%" }}>{value}</span>
    </div>
  );
}

// Grouped card wrapper for detail rows
function DetailCard({ children, style }) {
  return (
    <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", overflow: "hidden", marginBottom: "20px", ...style }}>
      {children}
    </div>
  );
}

// ── Sub-views ───────────────────────────────────────────────────────────────

export function AccountDetail({ authedUser, config, subscription, onBack }) {
  const setupColor  = config.setupComplete ? "var(--color-green)"           : "var(--color-teal)";
  const setupBg     = config.setupComplete ? "rgba(76,175,125,0.12)"        : "rgba(0,200,150,0.08)";
  const setupBorder = config.setupComplete ? "rgba(76,175,125,0.3)"         : "rgba(0,200,150,0.22)";
  const setupLabel  = config.setupComplete ? "Setup complete"               : "Setup pending";

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState(authedUser?.email ?? "");
  const [emailStatus, setEmailStatus] = useState({ error: null, success: null, loading: false });

  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [pwError, setPwError]       = useState(null);
  const [pwSaved, setPwSaved]       = useState(false);
  const [pwLoading, setPwLoading]   = useState(false);

  const [globalSignoutState, setGlobalSignoutState] = useState({ error: null, success: null, loading: false });

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deleteFold = useFoldTransition(showDeleteDialog, { ms: 340 });
  const [deleteText, setDeleteText] = useState("");
  const [deleteState, setDeleteState] = useState({ error: null, loading: false });

  const [linkState, setLinkState] = useState({ loading: false, error: null });
  const hasGoogleLinked = authedUser?.identities?.some(id => id.provider === "google") ?? false;
  // Change-password requires re-verifying the current password via signInWithPassword,
  // which only works for accounts that have an email/password identity. Google-only
  // users have no password, so the form is hidden for them (the re-auth would always
  // fail with a misleading "Current password is incorrect").
  const hasEmailIdentity = authedUser?.identities?.some(id => id.provider === "email") ?? false;
  const displayName = authedUser?.user_metadata?.full_name ?? null;

  async function handleChangeEmail(e) {
    e.preventDefault();
    const trimmed = newEmail.trim();
    setEmailStatus({ error: null, success: null, loading: false });

    if (!trimmed || !trimmed.includes("@")) {
      setEmailStatus({ error: "Enter a valid email address.", success: null, loading: false });
      return;
    }
    if (trimmed.toLowerCase() === (authedUser?.email ?? "").toLowerCase()) {
      setEmailStatus({ error: "That email is already on your account.", success: null, loading: false });
      return;
    }

    setEmailStatus({ error: null, success: null, loading: true });
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) {
      setEmailStatus({ error: error.message, success: null, loading: false });
      return;
    }

    setEmailStatus({
      error: null,
      success: "Confirmation sent. Check your new inbox and confirm before the email change takes effect.",
      loading: false,
    });
    setShowEmailForm(false);
  }

  async function handleChangePw(e) {
    e.preventDefault();
    setPwError(null);

    if (!currentPw)            { setPwError("Enter your current password."); return; }
    if (newPw !== confirmPw)   { setPwError("New passwords don't match."); return; }
    if (newPw.length < 8)      { setPwError("Use at least 8 characters for your new password."); return; }
    if (newPw === currentPw)   { setPwError("New password must be different from your current password."); return; }

    setPwLoading(true);

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: authedUser?.email ?? "",
      password: currentPw,
    });

    if (verifyError) {
      setPwLoading(false);
      setPwError("Current password is incorrect.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);

    if (error) {
      setPwError(error.message);
      return;
    }

    setPwSaved(true);
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setTimeout(() => { setPwSaved(false); setShowPwForm(false); }, 2000);
  }

  async function handleGlobalSignOut() {
    setGlobalSignoutState({ error: null, success: null, loading: true });
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      setGlobalSignoutState({ error: error.message, success: null, loading: false });
      return;
    }
    setGlobalSignoutState({ error: null, success: "Signed out from all devices.", loading: false });
  }

  async function handleLinkGoogle() {
    setLinkState({ loading: true, error: null });
    const { error } = await supabase.auth.linkIdentity({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    // On success the browser redirects — only reaches here on error.
    if (error) setLinkState({ loading: false, error: error.message });
  }

  // Minimal checkout trigger for validating the Stripe integration end-to-end
  // (docs/TODO.md §17.C/D/E) — no entitlement-aware phase copy yet, that's §D.
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

  const [portalState, setPortalState] = useState({ loading: false, error: null });

  async function handleManageSubscription() {
    setPortalState({ loading: true, error: null });
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setPortalState({ loading: false, error: "No active session found." });
      return;
    }

    try {
      const res = await fetch("/api/stripe-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        setPortalState({ loading: false, error: payload?.error || "Failed to open billing portal." });
        return;
      }
      window.location.href = payload.url;
    } catch {
      setPortalState({ loading: false, error: "Failed to open billing portal." });
    }
  }

  // §17.F subscription status card. Raw Stripe status (past_due/canceled)
  // takes priority over the collapsed entitlement state so a still-within-
  // paid-period cancellation shows "Canceled" rather than "Active" — but
  // only while getEntitlement still considers the account "active" (i.e.
  // within current_period_end); once that lapses, fall into the same
  // trial-ended bucket as any other non-entitled account rather than
  // inventing a fifth label. grace/expired/none all render identically here
  // (no day-count, no mention of a grace period) — same disclosure rule as
  // the Upgrade panels and TrialBanner.
  const entitlement = getEntitlement(subscription, new Date());
  const hasStripeCustomer = Boolean(subscription?.stripeCustomerId);
  const planLabel = subscription?.plan === "annual" ? "Annual" : subscription?.plan === "monthly" ? "Monthly" : null;
  const planPrice = subscription?.plan === "annual" ? "$120/yr ($10.00/mo)" : subscription?.plan === "monthly" ? "$14.99/mo" : null;
  const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let subStatusLabel, subStatusTone, subDetailText;
  if (entitlement.state === "active") {
    if (subscription?.status === "past_due") {
      subStatusLabel = "Past Due"; subStatusTone = "red";
      subDetailText = "Your last payment failed — update your card to keep access.";
    } else if (subscription?.status === "canceled") {
      subStatusLabel = "Canceled"; subStatusTone = "teal";
      subDetailText = subscription?.currentPeriodEnd
        ? `Access continues through ${fmtDate(subscription.currentPeriodEnd)}.`
        : "Your subscription has been canceled.";
    } else {
      subStatusLabel = "Active"; subStatusTone = "green";
      subDetailText = subscription?.currentPeriodEnd
        ? `Renews ${fmtDate(subscription.currentPeriodEnd)}.`
        : "Your subscription is active.";
    }
  } else if (entitlement.state === "trial") {
    subStatusLabel = "Trial"; subStatusTone = "teal";
    subDetailText = `${entitlement.trialDaysLeft} day${entitlement.trialDaysLeft === 1 ? "" : "s"} left in your free trial.`;
  } else if (entitlement.state === "none") {
    subStatusLabel = "N/A"; subStatusTone = "teal";
    subDetailText = "No subscription required for this account.";
  } else {
    subStatusLabel = "Trial Ended"; subStatusTone = "red";
    subDetailText = "Add a card to restore full access.";
  }

  const subToneColors = {
    green: { color: "var(--color-green)", bg: "rgba(76,175,125,0.12)", border: "rgba(76,175,125,0.3)" },
    teal:  { color: "var(--color-teal)", bg: "rgba(0,200,150,0.08)", border: "rgba(0,200,150,0.22)" },
    red:   { color: "var(--color-deduction)", bg: "rgba(244,164,164,0.1)", border: "rgba(244,164,164,0.28)" },
  }[subStatusTone];

  async function handleDeleteAccount() {
    setDeleteState({ error: null, loading: true });
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setDeleteState({ error: "No active session found.", loading: false });
      return;
    }

    try {
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ confirmationText: deleteText }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteState({ error: payload?.error || "Failed to delete account.", loading: false });
        return;
      }
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      setDeleteState({ error: "Failed to delete account.", loading: false });
    }
  }

  return (
    <>
      <BackBar onBack={onBack} title="Account" />
      <DetailCard>
        {displayName && <DetailRow label="Name" value={displayName} />}
        <DetailRow label="Email" value={authedUser?.email ?? "—"} />
        <DetailRow label="Setup" last value={
          <span style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", padding: "3px 10px", background: setupBg, color: setupColor, border: `1px solid ${setupBorder}`, borderRadius: "12px" }}>
            {setupLabel}
          </span>
        } />
      </DetailCard>

      <DetailCard>
        <div style={{ padding: "13px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-primary)" }}>Subscription</div>
            <span style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", padding: "3px 10px", background: subToneColors.bg, color: subToneColors.color, border: `1px solid ${subToneColors.border}`, borderRadius: "12px" }}>
              {subStatusLabel}
            </span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "12px" }}>
            {subDetailText}
            {planLabel && ` ${planLabel} plan — ${planPrice}.`}
          </div>
          {entitlement.state !== "none" && (
            hasStripeCustomer ? (
              <Pressable
                onClick={handleManageSubscription}
                disabled={portalState.loading}
                style={{ width: "100%", padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", color: "var(--color-text-primary)", fontSize: "12px", fontWeight: "600", cursor: portalState.loading ? "default" : "pointer" }}
              >
                {portalState.loading ? "Opening…" : "Manage Subscription"}
              </Pressable>
            ) : (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Pressable
                  onClick={() => handleCheckout("monthly")}
                  disabled={checkoutState.plan !== null}
                  style={{ flex: 1, minWidth: "120px", padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", color: "var(--color-text-primary)", fontSize: "12px", fontWeight: "600", cursor: checkoutState.plan ? "default" : "pointer", opacity: checkoutState.plan && checkoutState.plan !== "monthly" ? 0.5 : 1 }}
                >
                  {checkoutState.plan === "monthly" ? "Redirecting…" : "Monthly — $14.99"}
                </Pressable>
                <Pressable
                  onClick={() => handleCheckout("annual")}
                  disabled={checkoutState.plan !== null}
                  style={{ flex: 1, minWidth: "120px", padding: "9px 0", background: "var(--color-teal)", border: "none", borderRadius: "10px", color: "var(--color-bg-base)", fontSize: "12px", fontWeight: "700", cursor: checkoutState.plan ? "default" : "pointer", opacity: checkoutState.plan && checkoutState.plan !== "annual" ? 0.5 : 1 }}
                >
                  {checkoutState.plan === "annual" ? "Redirecting…" : "Annual — $10.00/mo"}
                </Pressable>
              </div>
            )
          )}
          {checkoutState.error && (
            <div style={{ fontSize: "12px", color: "var(--color-deduction)", marginTop: "8px" }}>{checkoutState.error}</div>
          )}
          {portalState.error && (
            <div style={{ fontSize: "12px", color: "var(--color-deduction)", marginTop: "8px" }}>{portalState.error}</div>
          )}
        </div>
      </DetailCard>

      <DetailCard>
        <div style={{ padding: "13px 16px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "10px" }}>Connected Accounts</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {authedUser?.identities?.some(id => id.provider === "email") && (
              <span style={{ fontSize: "11px", padding: "3px 10px", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "20px", color: "var(--color-text-primary)" }}>
                Email / Password
              </span>
            )}
            {hasGoogleLinked && (
              <span style={{ fontSize: "11px", padding: "3px 10px", background: "rgba(66,133,244,0.1)", border: "1px solid rgba(66,133,244,0.28)", borderRadius: "20px", color: "#4285F4" }}>
                Google
              </span>
            )}
          </div>
          {!hasGoogleLinked && (
            <Pressable
              onClick={handleLinkGoogle}
              disabled={linkState.loading}
              style={{ marginTop: "12px", padding: "8px 14px", background: "transparent", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "12px", cursor: linkState.loading ? "default" : "pointer" }}
            >
              {linkState.loading ? "Redirecting to Google…" : "Link Google Account"}
            </Pressable>
          )}
          {linkState.error && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--color-deduction)" }}>{linkState.error}</div>
          )}
        </div>
      </DetailCard>

      <DetailCard>
        {!showEmailForm ? (
          <Pressable
            onClick={() => setShowEmailForm(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: "14px", color: "var(--color-text-primary)", fontWeight: "500" }}>Change Email</span>
            <span style={{ fontSize: "18px", color: "var(--color-text-primary)", lineHeight: 1 }}>›</span>
          </Pressable>
        ) : (
          <form onSubmit={handleChangeEmail} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-primary)", fontWeight: "600" }}>Change Email</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lSp}>New Email</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required autoComplete="email" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-primary)" }}>
              Supabase will send a confirmation email to the new address.
            </div>
            {emailStatus.error && (
              <div style={{ fontSize: "11px", color: "var(--color-deduction)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>{emailStatus.error}</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <Pressable type="button" onClick={() => { setShowEmailForm(false); setEmailStatus({ error: null, success: null, loading: false }); setNewEmail(authedUser?.email ?? ""); }} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
              <Pressable type="submit" disabled={emailStatus.loading} style={{ flex: 1, padding: "9px 0", background: "var(--color-green)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: emailStatus.loading ? "default" : "pointer" }}>{emailStatus.loading ? "..." : "Save"}</Pressable>
            </div>
          </form>
        )}
        {emailStatus.success && (
          <div style={{ padding: "0 16px 14px", fontSize: "11px", color: "var(--color-green)" }}>
            {emailStatus.success}
          </div>
        )}
      </DetailCard>

      {hasEmailIdentity && (
      <DetailCard>
        {!showPwForm ? (
          <Pressable
            onClick={() => setShowPwForm(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: "14px", color: "var(--color-text-primary)", fontWeight: "500" }}>Change Password</span>
            <span style={{ fontSize: "18px", color: "var(--color-text-primary)", lineHeight: 1 }}>›</span>
          </Pressable>
        ) : (
          <form onSubmit={handleChangePw} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-primary)", fontWeight: "600" }}>Change Password</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lSp}>Current Password</label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Required to verify" required autoComplete="current-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lSp}>New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lSp}>Confirm New Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            {pwError && (
              <div style={{ fontSize: "11px", color: "var(--color-deduction)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>{pwError}</div>
            )}
            {pwSaved && (
              <div style={{ fontSize: "11px", color: "var(--color-green)" }}>Password updated.</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <Pressable type="button" onClick={() => { setShowPwForm(false); setPwError(null); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
              <Pressable type="submit" disabled={pwLoading} style={{ flex: 1, padding: "9px 0", background: "var(--color-green)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: pwLoading ? "default" : "pointer" }}>{pwLoading ? "..." : "Save"}</Pressable>
            </div>
          </form>
        )}
      </DetailCard>
      )}

      <DetailCard>
        <Pressable
          onClick={handleGlobalSignOut}
          disabled={globalSignoutState.loading}
          style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", textAlign: "left", cursor: globalSignoutState.loading ? "default" : "pointer" }}
        >
          <div style={{ fontSize: "14px", color: "var(--color-text-primary)", fontWeight: "500", marginBottom: "4px" }}>Sign Out All Devices</div>
          <div style={{ fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.5" }}>
            Ends active sessions on every device for this account.
          </div>
        </Pressable>
        {(globalSignoutState.error || globalSignoutState.success) && (
          <div style={{ padding: "0 16px 12px", fontSize: "11px", color: globalSignoutState.error ? "var(--color-deduction)" : "var(--color-green)" }}>
            {globalSignoutState.error || globalSignoutState.success}
          </div>
        )}
      </DetailCard>

      <DetailCard style={{ borderColor: "rgba(224,92,92,0.32)" }}>
        <Pressable
          onClick={() => { setDeleteText(""); setDeleteState({ error: null, loading: false }); setShowDeleteDialog(true); }}
          style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
        >
          <div style={{ fontSize: "14px", color: "var(--color-deduction)", fontWeight: "600", marginBottom: "4px" }}>Delete Account</div>
          <div style={{ fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.5" }}>
            This permanently deletes your account and dashboard data.
          </div>
        </Pressable>
      </DetailCard>

      {/* Portaled to document.body so position:fixed resolves against the viewport,
          not the scrolling .main-content ancestor — iOS Safari hit-tests a fixed
          element nested in an overflow:auto container at a scrollTop offset. */}
      {deleteFold.mounted && createPortal(
        <div className="fold-backdrop" data-fold={deleteFold.fold} style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
          <div className="fold-modal" data-fold={deleteFold.fold} style={{ width: "100%", maxWidth: "430px", background: "var(--color-bg-surface)", border: "1px solid rgba(224,92,92,0.4)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "16px", fontFamily: "var(--font-display)", color: "var(--color-deduction)" }}>Delete Account</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-primary)", lineHeight: "1.55" }}>
              This action is irreversible. Your account, profile, and stored dashboard data will be permanently deleted.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lSp}>Type DELETE to confirm</label>
              <input type="text" value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder="DELETE" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            {deleteState.error && (
              <div style={{ fontSize: "11px", color: "var(--color-deduction)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>{deleteState.error}</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <Pressable onClick={() => setShowDeleteDialog(false)} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
              <Pressable onClick={handleDeleteAccount} disabled={deleteText.trim() !== "DELETE" || deleteState.loading} style={{ flex: 1, padding: "9px 0", background: "var(--color-deduction)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: deleteState.loading ? "default" : "pointer", opacity: deleteText.trim() !== "DELETE" ? 0.6 : 1 }}>{deleteState.loading ? "..." : "Delete"}</Pressable>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Employment card — folded into Job & Pay (below the pay-structure cards) since
// it's a small, low-churn set of fields (employer/state/start date/team) rather
// than a standalone destination.
function EmploymentCard({ config, setConfig, onSaveConfig }) {
  const isEmployerDHL = config.employerPreset === "DHL";
  const isBaseUser = !isEmployerDHL;

  // Start date: only editable if not already set
  const [startDate, setStartDate] = useState(config.startDate || "");
  const [startDateDirty, setStartDateDirty] = useState(false);

  // DHL team: always editable
  const [dhlTeam, setDhlTeam] = useState(config.dhlTeam || "");
  const [teamDirty, setTeamDirty]   = useState(false);

  const canSave = (startDateDirty && startDate) || teamDirty;

  function handleSave() {
    if (!canSave) return;
    const newConfig = { ...config };
    if (startDateDirty && startDate) {
      newConfig.startDate = startDate;
    }
    if (teamDirty && dhlTeam) {
      newConfig.dhlTeam = dhlTeam;
      // Re-derive startingWeekIsLong from the new team unless user has a custom schedule
      if (!config.dhlCustomSchedule) {
        newConfig.startingWeekIsLong = DHL_PRESET.teams[dhlTeam]?.startsLong ?? config.startingWeekIsLong;
      }
    }
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setStartDateDirty(false);
    setTeamDirty(false);
  }

  const employer = isEmployerDHL ? "DHL / P&G" : (config.employerPreset || "Independent");

  return (
    <>
      <PaySectionHeader title="Employment" editing />
      <DetailCard>
        <DetailRow label="Employer" value={employer} />
        <DetailRow label="State"    value={config.userState || "—"} last={isBaseUser && !!config.startDate} />
        {/* Start date — read-only if already set, editable if not */}
        {config.startDate ? (
          <DetailRow label="Job Start" value={fmt(config.startDate)} last={isBaseUser} />
        ) : (
          <div style={{ padding: "13px 16px", borderTop: "1px solid #1e1e1e" }}>
            <label style={lSp}>Job Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setStartDateDirty(true); }}
              style={iS}
            />
          </div>
        )}
        {/* DHL Team — always editable for DHL users */}
        {isEmployerDHL && (
          <div style={{ padding: "13px 16px", borderTop: "1px solid #1e1e1e" }}>
            <label style={lSp}>DHL Team</label>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              {["A", "B"].map(t => (
                <Pressable
                  key={t}
                  onClick={() => { setDhlTeam(t); setTeamDirty(t !== config.dhlTeam); }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid",
                    borderColor: dhlTeam === t ? "var(--color-teal)" : "var(--color-border-subtle)",
                    background: dhlTeam === t ? "rgba(0,200,150,0.10)" : "var(--color-bg-base)",
                    color: dhlTeam === t ? "var(--color-teal)" : "var(--color-text-secondary)",
                    fontWeight: "bold", fontSize: "14px", cursor: "pointer",
                  }}
                >
                  Team {t}
                </Pressable>
              ))}
            </div>
            {teamDirty && (
              <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginTop: "6px" }}>
                Rotation will update — save to apply.
              </div>
            )}
          </div>
        )}
      </DetailCard>

      {canSave && (
        <Pressable
          onClick={handleSave}
          style={{ width: "100%", padding: "13px 16px", marginBottom: "20px", background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
        >
          Save
        </Pressable>
      )}
    </>
  );
}

const PAY_SCHEDULE_LABELS = {
  weekly:   "Weekly",
  biweekly: "Biweekly",
  monthly:  "Monthly",
  salary:   "Salary (biweekly)",
};

// Shared chrome for each independently editable Pay Structure section.
function PaySectionHeader({ title, editing, onEdit }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", paddingLeft: "4px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-primary)" }}>{title}</div>
      {!editing && (
        <Pressable
          onClick={onEdit}
          style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", background: "transparent", color: "var(--color-teal)", border: "1px solid rgba(0,200,150,0.28)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}
        >
          Edit
        </Pressable>
      )}
    </div>
  );
}

function PaySectionActions({ error, onSave, onCancel }) {
  return (
    <>
      {error && (
        <div style={{ fontSize: "11px", color: "var(--color-deduction)", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px", padding: "8px 12px" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: "10px" }}>
        <Pressable
          onClick={onSave}
          style={{ flex: 1, padding: "10px 0", background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
        >
          Save Changes
        </Pressable>
        <Pressable
          onClick={onCancel}
          style={{ flex: 1, padding: "10px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "10px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-primary)", cursor: "pointer" }}
        >
          Cancel
        </Pressable>
      </div>
    </>
  );
}

// ── Base Pay (rate, schedule, shift length) ─────────────────────────────────
function BasePayCard({ config, setConfig, onSaveConfig }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  const startEditing = () => {
    setDraft({
      userPaySchedule: config.userPaySchedule ?? "weekly",
      annualSalary: config.annualSalary != null ? String(config.annualSalary) : "",
      baseRate: config.baseRate != null ? String(config.baseRate) : "",
      shiftHours: config.shiftHours != null ? String(config.shiftHours) : "",
    });
    setError(null);
    setEditing(true);
  };
  const cancelEditing = () => { setEditing(false); setDraft(null); setError(null); };
  const change = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!draft) return;
    setError(null);
    const updates = {};
    const schedule = draft.userPaySchedule || "weekly";
    updates.userPaySchedule = schedule;

    if (schedule === "salary") {
      const annualSalary = parseFloat(draft.annualSalary);
      if (!Number.isFinite(annualSalary) || annualSalary <= 0) {
        setError("Enter a valid annual salary.");
        return;
      }
      updates.annualSalary = Math.round(annualSalary);
      updates.baseRate = parseFloat((annualSalary / 2080).toFixed(2));
    } else {
      const baseRate = parseFloat(draft.baseRate);
      if (!Number.isFinite(baseRate) || baseRate <= 0) {
        setError("Enter a valid base hourly rate.");
        return;
      }
      updates.baseRate = parseFloat(baseRate.toFixed(2));
      updates.annualSalary = null;
    }

    const shiftHours = parseFloat(draft.shiftHours);
    if (!Number.isFinite(shiftHours) || shiftHours <= 0) {
      setError("Enter a valid shift length.");
      return;
    }
    updates.shiftHours = parseFloat(shiftHours.toFixed(2));

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setEditing(false);
    setDraft(null);
  };

  return (
    <>
      <PaySectionHeader title="Base Pay" editing={editing} onEdit={startEditing} />
      {!editing ? (
        <DetailCard>
          <DetailRow label="Pay Schedule" value={PAY_SCHEDULE_LABELS[config.userPaySchedule] ?? "Weekly"} />
          <DetailRow label="Base Rate"    value={`$${config.baseRate}/hr`} valueColor="var(--color-teal)" />
          <DetailRow label="Shift Length" value={config.shiftHours > 0 ? `${config.shiftHours}h` : "—"} last />
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lSp}>Pay Schedule</label>
                <select
                  value={draft.userPaySchedule}
                  onChange={e => change("userPaySchedule", e.target.value)}
                  style={{ ...iS, appearance: "none" }}
                >
                  {Object.entries(PAY_SCHEDULE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {draft.userPaySchedule === "salary" && (
                <div style={{ gridColumn: "span 2" }}>
                  <label style={lSp}>Annual Salary ($)</label>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={draft.annualSalary}
                    onChange={e => change("annualSalary", e.target.value)}
                    style={iS}
                  />
                  <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginTop: "4px" }}>
                    Hourly base pay auto-derives from salary ÷ 2080.
                  </div>
                </div>
              )}

              <div>
                <label style={lSp}>Base Hourly Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.baseRate}
                  disabled={draft.userPaySchedule === "salary"}
                  onChange={e => change("baseRate", e.target.value)}
                  style={{ ...iS, opacity: draft.userPaySchedule === "salary" ? 0.6 : 1 }}
                />
              </div>

              <div>
                <label style={lSp}>Shift Length (hrs)</label>
                <input
                  type="number"
                  step="0.25"
                  min="1"
                  value={draft.shiftHours}
                  onChange={e => change("shiftHours", e.target.value)}
                  style={iS}
                />
                <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginTop: "4px" }}>
                  Update this if you move to 10-hour shifts.
                </div>
              </div>
            </div>
            <PaySectionActions error={error} onSave={handleSave} onCancel={cancelEditing} />
          </div>
        </DetailCard>
      )}
    </>
  );
}

// ── Differentials (weekend + DHL night shift) ───────────────────────────────
function DifferentialsCard({ config, setConfig, onSaveConfig, isEmployerDHL }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const startEditing = () => {
    setDraft({
      diffRate: config.diffRate != null ? String(config.diffRate) : "",
      nightDiffRate: config.nightDiffRate != null ? String(config.nightDiffRate) : "",
      dhlNightShift: Boolean(config.dhlNightShift),
    });
    setEditing(true);
  };
  const cancelEditing = () => { setEditing(false); setDraft(null); };
  const change = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!draft) return;
    const updates = {};
    const diffRate = parseFloat(draft.diffRate);
    updates.diffRate = Number.isFinite(diffRate) ? parseFloat(diffRate.toFixed(2)) : 0;

    if (isEmployerDHL) {
      updates.dhlNightShift = !!draft.dhlNightShift;
      const nightDiffRate = parseFloat(draft.nightDiffRate);
      updates.nightDiffRate = Number.isFinite(nightDiffRate) ? parseFloat(nightDiffRate.toFixed(2)) : 0;
    }

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setEditing(false);
    setDraft(null);
  };

  return (
    <>
      <PaySectionHeader title="Differentials" editing={editing} onEdit={startEditing} />
      {!editing ? (
        <DetailCard>
          <DetailRow label="Weekend Diff" value={config.diffRate > 0 ? `+$${config.diffRate}/hr` : "$0.00/hr"} last={!isEmployerDHL} />
          {isEmployerDHL && (
            <DetailRow
              label="Night Diff"
              value={config.dhlNightShift && config.nightDiffRate > 0 ? `+$${config.nightDiffRate}/hr` : "Off"}
              last
            />
          )}
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lSp}>Weekend Differential ($/hr)</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={draft.diffRate}
                  onChange={e => change("diffRate", e.target.value)}
                  style={iS}
                />
              </div>

              {isEmployerDHL && (
                <div>
                  <label style={lSp}>Night Differential ($/hr)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={draft.nightDiffRate}
                    disabled={!draft.dhlNightShift}
                    onChange={e => change("nightDiffRate", e.target.value)}
                    style={{ ...iS, opacity: draft.dhlNightShift ? 1 : 0.6 }}
                  />
                  <div style={{ marginTop: "6px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={draft.dhlNightShift}
                      onChange={e => change("dhlNightShift", e.target.checked)}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--color-text-primary)" }}>Night shift applies</span>
                  </div>
                </div>
              )}
            </div>
            <PaySectionActions error={null} onSave={handleSave} onCancel={cancelEditing} />
          </div>
        </DetailCard>
      )}
    </>
  );
}

// ── Overtime rules (threshold + multiplier) ─────────────────────────────────
function OvertimeCard({ config, setConfig, onSaveConfig }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  const startEditing = () => {
    setDraft({
      otThreshold: config.otThreshold != null ? String(config.otThreshold) : "",
      otMultiplier: config.otMultiplier != null ? String(config.otMultiplier) : "",
    });
    setError(null);
    setEditing(true);
  };
  const cancelEditing = () => { setEditing(false); setDraft(null); setError(null); };
  const change = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!draft) return;
    setError(null);
    const updates = {};

    const otThreshold = parseFloat(draft.otThreshold);
    if (!Number.isFinite(otThreshold) || otThreshold <= 0) {
      setError("Enter a valid OT threshold.");
      return;
    }
    updates.otThreshold = parseFloat(otThreshold.toFixed(2));

    const otMultiplier = parseFloat(draft.otMultiplier);
    if (!Number.isFinite(otMultiplier) || otMultiplier < 1) {
      setError("Enter a valid OT multiplier (>= 1).");
      return;
    }
    updates.otMultiplier = parseFloat(otMultiplier.toFixed(2));

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setEditing(false);
    setDraft(null);
  };

  return (
    <>
      <PaySectionHeader title="Overtime Rules" editing={editing} onEdit={startEditing} />
      {!editing ? (
        <DetailCard>
          <DetailRow label="OT Threshold"  value={`${config.otThreshold} hrs/wk`} />
          <DetailRow label="OT Multiplier" value={`${config.otMultiplier}×`} last />
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={lSp}>OT Threshold (hrs/wk)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={draft.otThreshold}
                  onChange={e => change("otThreshold", e.target.value)}
                  style={iS}
                />
              </div>

              <div>
                <label style={lSp}>OT Multiplier</label>
                <input
                  type="number"
                  step="0.05"
                  min="1"
                  value={draft.otMultiplier}
                  onChange={e => change("otMultiplier", e.target.value)}
                  style={iS}
                />
              </div>
            </div>
            <PaySectionActions error={error} onSave={handleSave} onCancel={cancelEditing} />
          </div>
        </DetailCard>
      )}
    </>
  );
}

// ── Weekly hours & schedule override (DHL long/short vs base custom/standard) ──
function ScheduleCard({ config, setConfig, onSaveConfig, isEmployerDHL }) {
  const scheduleLabel = config.customWeeklyHours != null
    ? (config.customWeeklyHoursLong != null && config.customWeeklyHoursShort != null
        ? `Long ${config.customWeeklyHoursLong}h / Short ${config.customWeeklyHoursShort}h (custom)`
        : `${config.customWeeklyHours} hrs / week (custom)`)
    : config.scheduleIsVariable
      ? "Variable hours"
      : config.maxWeeklyHours != null
        ? `${config.maxWeeklyHours} hrs / week (max ceiling)`
        : `${config.standardWeeklyHours || 40} hrs / week`;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);

  const startEditing = () => {
    setDraft({
      standardWeeklyHours: config.maxWeeklyHours != null
        ? String(config.maxWeeklyHours)
        : (config.standardWeeklyHours != null ? String(config.standardWeeklyHours) : ""),
      customScheduleEnabled: config.customWeeklyHours != null,
      customWeeklyHours: config.customWeeklyHours != null ? String(config.customWeeklyHours) : "",
      customWeeklyHoursLong: config.customWeeklyHoursLong != null ? String(config.customWeeklyHoursLong) : "",
      customWeeklyHoursShort: config.customWeeklyHoursShort != null ? String(config.customWeeklyHoursShort) : "",
    });
    setError(null);
    setEditing(true);
  };
  const cancelEditing = () => { setEditing(false); setDraft(null); setError(null); };
  const change = (field, value) => setDraft(prev => ({ ...prev, [field]: value }));

  const handleSave = () => {
    if (!draft) return;
    setError(null);
    const updates = {};

    if (!config.scheduleIsVariable) {
      const rawWeekly = draft.standardWeeklyHours;
      const weeklyValue = rawWeekly === "" ? (config.maxWeeklyHours ?? config.standardWeeklyHours) : parseFloat(rawWeekly);
      if (!Number.isFinite(weeklyValue) || weeklyValue <= 0) {
        setError("Enter weekly hours for your schedule.");
        return;
      }
      // maxWeeklyHours is the field the finance engine and display label actually
      // read first (see config.js); standardWeeklyHours is kept in sync only for
      // legacy back-compat reads.
      updates.maxWeeklyHours = parseFloat(weeklyValue.toFixed(1));
      updates.standardWeeklyHours = parseFloat(weeklyValue.toFixed(1));
    }

    if (draft.customScheduleEnabled) {
      if (isEmployerDHL) {
        const longHrs = parseFloat(draft.customWeeklyHoursLong);
        const shortHrs = parseFloat(draft.customWeeklyHoursShort);
        if (!Number.isFinite(longHrs) || longHrs <= 0 || longHrs > 168) {
          setError("Long week hours must be between 1 and 168.");
          return;
        }
        if (!Number.isFinite(shortHrs) || shortHrs <= 0 || shortHrs > 168) {
          setError("Short week hours must be between 1 and 168.");
          return;
        }
        updates.customWeeklyHoursLong = parseFloat(longHrs.toFixed(1));
        updates.customWeeklyHoursShort = parseFloat(shortHrs.toFixed(1));
        // Keep flat fallback as average so non-per-week-aware code still has a value.
        updates.customWeeklyHours = parseFloat(((longHrs + shortHrs) / 2).toFixed(1));
      } else {
        const customHrs = parseFloat(draft.customWeeklyHours);
        if (!Number.isFinite(customHrs) || customHrs <= 0 || customHrs > 168) {
          setError("Custom hours must be between 1 and 168.");
          return;
        }
        updates.customWeeklyHours = parseFloat(customHrs.toFixed(1));
        updates.customWeeklyHoursLong = null;
        updates.customWeeklyHoursShort = null;
      }
    } else {
      updates.customWeeklyHours = null;
      updates.customWeeklyHoursLong = null;
      updates.customWeeklyHoursShort = null;
    }

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setEditing(false);
    setDraft(null);
  };

  return (
    <>
      <PaySectionHeader title="Weekly Hours & Schedule Override" editing={editing} onEdit={startEditing} />
      {!editing ? (
        <DetailCard>
          <DetailRow label="Schedule" value={scheduleLabel} last={config.customWeeklyHours == null} />
          {config.customWeeklyHours != null && (
            config.customWeeklyHoursLong != null && config.customWeeklyHoursShort != null ? (
              <>
                <DetailRow label="Long Week Override" value={`${config.customWeeklyHoursLong} hrs`} valueColor="var(--color-teal)" />
                <DetailRow label="Short Week Override" value={`${config.customWeeklyHoursShort} hrs`} valueColor="var(--color-teal)" last />
              </>
            ) : (
              <DetailRow label="Custom Override" value={`${config.customWeeklyHours} hrs/wk`} valueColor="var(--color-teal)" last />
            )
          )}
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            {!config.scheduleIsVariable && (
              <div>
                <label style={lSp}>Max Weekly Hours</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={draft.standardWeeklyHours}
                  onChange={e => change("standardWeeklyHours", e.target.value)}
                  style={iS}
                />
              </div>
            )}

            {isEmployerDHL && (
              <div>
                <SH color="var(--color-teal)" right={null}>Schedule Override</SH>
                <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginBottom: "8px" }}>
                  {`${config.dhlTeam ?? "B"}-Team · Long/Short alternating (DHL preset rotation)`}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <Pressable
                    type="button"
                    onClick={() => change("customScheduleEnabled", false)}
                    style={{
                      padding: "6px 14px", borderRadius: "6px", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer",
                      border: !draft.customScheduleEnabled ? "1px solid var(--color-teal)" : "1px solid var(--color-border-subtle)",
                      background: !draft.customScheduleEnabled ? "rgba(0,200,150,0.1)" : "var(--color-bg-surface)",
                      color: !draft.customScheduleEnabled ? "var(--color-teal)" : "var(--color-text-secondary)",
                      fontWeight: !draft.customScheduleEnabled ? "bold" : "normal",
                    }}
                  >
                    Use rotation hours
                  </Pressable>
                  <Pressable
                    type="button"
                    onClick={() => change("customScheduleEnabled", true)}
                    style={{
                      padding: "6px 14px", borderRadius: "6px", fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", cursor: "pointer",
                      border: draft.customScheduleEnabled ? "1px solid var(--color-teal)" : "1px solid var(--color-border-subtle)",
                      background: draft.customScheduleEnabled ? "rgba(0,200,150,0.1)" : "var(--color-bg-surface)",
                      color: draft.customScheduleEnabled ? "var(--color-teal)" : "var(--color-text-secondary)",
                      fontWeight: draft.customScheduleEnabled ? "bold" : "normal",
                    }}
                  >
                    Set custom weekly hours
                  </Pressable>
                </div>
                {draft.customScheduleEnabled && (
                  <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <label style={lSp}>Hours per week</label>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginBottom: "4px" }}>Long week</div>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="168"
                        value={draft.customWeeklyHoursLong}
                        onChange={e => change("customWeeklyHoursLong", e.target.value)}
                        style={iS}
                      />
                      {(() => {
                        const h = parseFloat(draft.customWeeklyHoursLong);
                        const sh = config.shiftHours || 12;
                        if (!Number.isFinite(h) || h <= 0) return null;
                        const ot = Math.max(0, Math.round((h - DHL_PRESET.rotation.long.baseHours) / sh));
                        return <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--color-text-primary)" }}>OT pickups required: {ot}</div>;
                      })()}
                    </div>
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginBottom: "4px" }}>Short week</div>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="168"
                        value={draft.customWeeklyHoursShort}
                        onChange={e => change("customWeeklyHoursShort", e.target.value)}
                        style={iS}
                      />
                      {(() => {
                        const h = parseFloat(draft.customWeeklyHoursShort);
                        const sh = config.shiftHours || 12;
                        if (!Number.isFinite(h) || h <= 0) return null;
                        const ot = Math.max(0, Math.round((h - DHL_PRESET.rotation.short.baseHours) / sh));
                        return <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--color-text-primary)" }}>OT pickups required: {ot}</div>;
                      })()}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.5" }}>
                      Projections use long/short targets by week type. DHL rotation still shows scheduled days in weekly confirmation.
                    </div>
                  </div>
                )}
              </div>
            )}
            <PaySectionActions error={error} onSave={handleSave} onCancel={cancelEditing} />
          </div>
        </DetailCard>
      )}
    </>
  );
}

// PayDetail (Job & Pay) — each pay-structure concern (base pay, differentials,
// overtime, schedule override) is its own independently editable section so base
// users and DHL users only ever see and edit the fields relevant to them, without
// a single all-or-nothing form gating every field behind one Edit button.
// Employment sits below the pay cards since it changes far less often, and a
// Life Events link at the bottom gives a second entry point into that wizard
// right where a pay/job change would prompt someone to look for it.
function PayDetail({ config, setConfig, onSaveConfig, onBack, onOpenLifeEvents }) {
  const isEmployerDHL = config.employerPreset === "DHL";

  return (
    <>
      <BackBar onBack={onBack} title="Job & Pay" />
      <BasePayCard config={config} setConfig={setConfig} onSaveConfig={onSaveConfig} />
      <DifferentialsCard config={config} setConfig={setConfig} onSaveConfig={onSaveConfig} isEmployerDHL={isEmployerDHL} />
      <OvertimeCard config={config} setConfig={setConfig} onSaveConfig={onSaveConfig} />
      <ScheduleCard config={config} setConfig={setConfig} onSaveConfig={onSaveConfig} isEmployerDHL={isEmployerDHL} />
      <EmploymentCard config={config} setConfig={setConfig} onSaveConfig={onSaveConfig} />
      <div style={{ fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.6", marginBottom: "20px" }}>
        Saving recalculates every paycheck, projection, and budget automatically.
      </div>
      {onOpenLifeEvents && (
        <Pressable
          onClick={onOpenLifeEvents}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 16px", background: "var(--color-bg-surface)", border: "1px solid rgba(0,200,150,0.28)", borderRadius: "12px", cursor: "pointer", textAlign: "left" }}
        >
          <div>
            <div style={{ fontSize: "14px", color: "var(--color-teal)", fontWeight: "600" }}>Life Events</div>
            <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginTop: "2px" }}>Pay structure changed, new job, or lost your job</div>
          </div>
          <span style={{ fontSize: "18px", color: "var(--color-text-primary)", marginLeft: "12px", lineHeight: 1 }}>›</span>
        </Pressable>
      )}
    </>
  );
}

function BenefitsDetail({ config, setConfig, onSaveConfig, onBack }) {
  const isEmployerDHL     = config.employerPreset === "DHL";
  const isBaseUser = !isEmployerDHL;
  const has401k   = config.k401Rate > 0;
  const matchRate = isEmployerDHL ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);
  const effectiveK401Start = config.k401StartDate || config.benefitsStartDate || null;
  const k401StartSource = config.k401StartDate ? "k401" : (config.benefitsStartDate ? "benefits" : null);
  const k401StartLabel = effectiveK401Start
    ? `${fmt(effectiveK401Start)}${k401StartSource === "benefits" ? " (benefits start)" : ""}`
    : "—";
  const k401StartColor = k401StartSource === "benefits" ? "var(--color-teal)" : undefined;
  const enrolledConfig = Array.isArray(config.selectedBenefits) ? config.selectedBenefits : [];

  const [editing, setEditing]   = useState(true);
  const [selectedBenefits, setSelectedBenefits] = useState(new Set(enrolledConfig));
  const [k401Rate, setK401Rate] = useState(String(config.k401Rate ?? ""));
  const [k401Match, setK401Match] = useState(String(config.k401MatchRate ?? ""));
  const [k401Start, setK401Start] = useState(config.k401StartDate ?? "");
  const [benefitsStartDate, setBenefitsStartDate] = useState(config.benefitsStartDate ?? "");
  const [weeklyValues, setWeeklyValues] = useState(
    BENEFIT_OPTIONS
      .filter(b => b.type === "weekly")
      .reduce((acc, b) => ({ ...acc, [b.field]: String(config[b.field] ?? "") }), {})
  );

  function handleSave() {
    const nextSelected = [...selectedBenefits];
    const weeklyPatch = BENEFIT_OPTIONS
      .filter(b => b.type === "weekly")
      .reduce((acc, b) => ({ ...acc, [b.field]: parseFloat(weeklyValues[b.field]) || 0 }), {});
    const newConfig = {
      ...config,
      k401Rate:         parseFloat(k401Rate)  || 0,
      k401MatchRate:    parseFloat(k401Match) || 0,
      k401StartDate:    k401Start || null,
      benefitsStartDate: benefitsStartDate || null,
      selectedBenefits: nextSelected,
      ...weeklyPatch,
    };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setEditing(false);
  }

  function toggleBenefit(id) {
    setSelectedBenefits(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <BackBar onBack={onBack} title="Retirement & Benefits" />

      {/* 401k section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-primary)", paddingLeft: "4px" }}>401k</div>
        {!editing && (
          <Pressable onClick={() => setEditing(true)} style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", background: "transparent", color: "var(--color-teal)", border: "1px solid rgba(0,200,150,0.28)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}>Edit</Pressable>
        )}
      </div>

      {!editing ? (
        <DetailCard>
          <DetailRow
            label="Employee Rate"
            value={has401k ? `${(config.k401Rate * 100).toFixed(0)}%` : "Not enrolled"}
            valueColor={has401k ? undefined : "var(--color-text-disabled)"}
          />
          {isBaseUser && (
            <DetailRow
              label="Employer Match"
              value={has401k ? `${(matchRate * 100).toFixed(1)}%` : "—"}
              valueColor={has401k ? "var(--color-green)" : "var(--color-text-disabled)"}
            />
          )}
          {isEmployerDHL && has401k && (
            <DetailRow label="Employer Match" value="Tiered (DHL formula)" valueColor="var(--color-green)" />
          )}
          <DetailRow label="Contribution Start" value={k401StartLabel} valueColor={k401StartColor} last />
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
              Payroll-Deduction Benefits ({BENEFIT_OPTIONS.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
              {BENEFIT_OPTIONS.map((benefit) => (
                <Pressable
                  key={benefit.id}
                  onClick={() => toggleBenefit(benefit.id)}
                  style={{
                    fontSize: "10px",
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                    padding: "6px 8px",
                    borderRadius: "8px",
                    border: `1px solid ${selectedBenefits.has(benefit.id) ? "rgba(76,175,125,0.32)" : "var(--color-border-subtle)"}`,
                    background: selectedBenefits.has(benefit.id) ? "rgba(76,175,125,0.10)" : "var(--color-bg-raised)",
                    color: selectedBenefits.has(benefit.id) ? "var(--color-green)" : "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {selectedBenefits.has(benefit.id) ? "✓ " : ""}{BENEFIT_LABELS[benefit.id] ?? benefit.id}
                </Pressable>
              ))}
            </div>
            {isEmployerDHL && (
              <div style={{ padding: "8px 10px", background: "rgba(0,200,150,0.06)", border: "1px solid rgba(0,200,150,0.18)", borderRadius: "6px", fontSize: "10px", color: "var(--color-text-primary)", lineHeight: "1.6" }}>
                <span style={{ color: "var(--color-accent-primary)", fontWeight: "bold" }}>PTO accrual</span> and <span style={{ color: "var(--color-accent-primary)", fontWeight: "bold" }}>attendance bucket</span> are automatically enabled for all DHL employees — no enrollment needed.
              </div>
            )}
            <div>
              <label style={lSp}>Benefits Start Date</label>
              <input type="date" value={benefitsStartDate} onChange={e => setBenefitsStartDate(e.target.value)} style={iS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {selectedBenefits.has("k401") && <>
                <div>
                  <label style={lSp}>Employee % (decimal)</label>
                  <input type="number" step="0.01" min="0" max="1" value={k401Rate} onChange={e => setK401Rate(e.target.value)} style={iS} />
                </div>
                {isBaseUser && (
                  <div>
                    <label style={lSp}>Match % (decimal)</label>
                    <input type="number" step="0.01" min="0" max="1" value={k401Match} onChange={e => setK401Match(e.target.value)} style={iS} />
                  </div>
                )}
                <div>
                  <label style={lSp}>Start Date</label>
                  <input type="date" value={k401Start} onChange={e => setK401Start(e.target.value)} style={iS} />
                </div>
              </>}
            </div>
            {BENEFIT_OPTIONS.filter(b => b.type === "weekly" && selectedBenefits.has(b.id)).length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {BENEFIT_OPTIONS.filter(b => b.type === "weekly" && selectedBenefits.has(b.id)).map((benefit) => (
                  <div key={benefit.id}>
                    <label style={lSp}>{benefit.label} ($ / week)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={weeklyValues[benefit.field]}
                      placeholder={benefit.placeholder}
                      onChange={e => setWeeklyValues(v => ({ ...v, [benefit.field]: e.target.value }))}
                      style={iS}
                    />
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <Pressable onClick={() => setEditing(false)} style={{ flex: 1, padding: "8px 0", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
              <Pressable onClick={handleSave} style={{ flex: 1, padding: "8px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}>Save</Pressable>
            </div>
          </div>
        </DetailCard>
      )}

      {/* Benefits enrollment (read-only) */}
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "8px", paddingLeft: "4px", marginTop: "20px" }}>Benefits Enrollment</div>
      <DetailCard>
        {config.benefitsStartDate && (
          <DetailRow label="Benefits Start" value={fmt(config.benefitsStartDate)} />
        )}
        <DetailRow
          label="Enrolled"
          value={enrolledConfig.length > 0 ? `${enrolledConfig.length} plan${enrolledConfig.length !== 1 ? "s" : ""}` : "None enrolled"}
          valueColor={enrolledConfig.length > 0 ? undefined : "var(--color-text-disabled)"}
          last={enrolledConfig.length === 0}
        />
        {(enrolledConfig.length > 0 || isEmployerDHL) && (
          <div style={{ padding: "10px 16px 14px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {enrolledConfig.map(id => (
                <span key={id} style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "3px 10px", background: "rgba(76,175,125,0.08)", color: "var(--color-green)", border: "1px solid rgba(76,175,125,0.2)", borderRadius: "12px" }}>
                  {BENEFIT_LABELS[id] ?? id}
                </span>
              ))}
              {isEmployerDHL && (
                <>
                  <span style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "3px 10px", background: "rgba(0,200,150,0.06)", color: "var(--color-accent-primary)", border: "1px solid rgba(0,200,150,0.18)", borderRadius: "12px" }}>PTO Accrual ✦</span>
                  <span style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "3px 10px", background: "rgba(0,200,150,0.06)", color: "var(--color-accent-primary)", border: "1px solid rgba(0,200,150,0.18)", borderRadius: "12px" }}>Attendance Bucket ✦</span>
                </>
              )}
            </div>
            {isEmployerDHL && <div style={{ fontSize: "9px", color: "var(--color-text-primary)", marginTop: "6px" }}>✦ Auto-enabled for DHL employees</div>}
          </div>
        )}
      </DetailCard>
    </>
  );
}

function PreferencesDetail({ config, setConfig, onSaveConfig, onBack, taxFeatureUnlocked = false }) {
  // Reflect tax-exempt status only when the tax feature is unlocked. taxExemptOptIn
  // is ignored by the withholding math, so for everyone else "Standard withholding"
  // is both the safe and the accurate label (avoids implying an exemption isn't real).
  const showTaxExempt = taxFeatureUnlocked && config.taxExemptOptIn;
  const [editingBuffer, setEditingBuffer] = useState(false);
  const [bufferEnabled, setBufferEnabled] = useState(config.bufferEnabled ?? true);
  const [paycheckBuffer, setPaycheckBuffer] = useState(config.paycheckBuffer ?? 50);

  const handleSaveBuffer = () => {
    const clampedBuffer = Math.max(0, Math.min(Number(paycheckBuffer) || 0, 200));
    const newConfig = { ...config, bufferEnabled, paycheckBuffer: clampedBuffer };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setEditingBuffer(false);
  };

  return (
    <>
      <BackBar onBack={onBack} title="App Preferences" />
      <DetailCard>
        {!editingBuffer ? (
          <Pressable
            onClick={() => setEditingBuffer(true)}
            style={{ width: "100%", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}
          >
            <DetailRow
              label="Paycheck Buffer"
              value={config.bufferEnabled ? `On — $${config.paycheckBuffer}/check` : "Off"}
              valueColor={config.bufferEnabled ? undefined : "var(--color-text-disabled)"}
            />
          </Pressable>
        ) : (
          <div style={{ padding: "13px 16px", borderBottom: "1px solid #1e1e1e" }}>
            <div style={{ fontSize: "13px", color: "var(--color-text-primary)", marginBottom: "10px" }}>Paycheck Buffer</div>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <Pressable onClick={() => setBufferEnabled(true)} style={{ flex: 1, padding: "8px 0", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", background: bufferEnabled ? "rgba(0,200,150,0.12)" : "var(--color-bg-raised)", color: bufferEnabled ? "var(--color-accent-primary)" : "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>On</Pressable>
              <Pressable onClick={() => setBufferEnabled(false)} style={{ flex: 1, padding: "8px 0", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", background: !bufferEnabled ? "rgba(0,200,150,0.12)" : "var(--color-bg-raised)", color: !bufferEnabled ? "var(--color-accent-primary)" : "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>Off</Pressable>
            </div>
            <label style={lSp}>Buffer Amount ($ / check)</label>
            <input
              type="number"
              min="0"
              max="200"
              step="1"
              value={paycheckBuffer}
              onChange={e => setPaycheckBuffer(e.target.value)}
              style={{ ...iS, marginTop: "6px", marginBottom: "12px", opacity: bufferEnabled ? 1 : 0.65 }}
              disabled={!bufferEnabled}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <Pressable onClick={() => { setEditingBuffer(false); setBufferEnabled(config.bufferEnabled ?? true); setPaycheckBuffer(config.paycheckBuffer ?? 50); }} style={{ flex: 1, padding: "8px 0", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
              <Pressable onClick={handleSaveBuffer} style={{ flex: 1, padding: "8px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}>Save</Pressable>
            </div>
          </div>
        )}
        <DetailRow
          label="Tax Exempt"
          value={showTaxExempt ? "Opted in" : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              {!taxFeatureUnlocked && <LockIcon />}
              Standard withholding
            </span>
          )}
          valueColor={showTaxExempt ? "var(--color-teal)" : "var(--color-text-secondary)"}
          last
        />
      </DetailCard>
      <div style={{ fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.6" }}>
        Buffer and tax settings can also be updated from setup flows and Life Events.
      </div>
    </>
  );
}

// ── TaxPlanDetail ────────────────────────────────────────────────────────────

function TaxPlanDetail({ config, setConfig, onSaveConfig, allWeeks, taxDerived, showExtra, setShowExtra, onBack, isAdmin = false, today, weekConfirmations = {} }) {
  const { extraPerCheck, taxedWeekCount, fedLiability, moLiability, ficaTotal, fedWithheldBase, moWithheldBase, fedGap, moGap, totalGap, targetExtraTotal, fedAGI, eventGrossDelta = 0, fedLiabilityEventDelta = 0, moLiabilityEventDelta = 0 } = taxDerived;
  const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gN = w => computeNet(w, config, extraPerCheck, showExtra);
  const startDateDisplay = config.startDate
    ? new Date(config.startDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const [taxDraft, setTaxDraft] = useState(null);
  const pastOverrides = config.pastWeekTaxStatusOverrides ?? {};
  const hasPastOverride = (idx) => Object.prototype.hasOwnProperty.call(pastOverrides, idx);
  const getPastStatus = (idx) => hasPastOverride(idx) ? Boolean(pastOverrides[idx]) : config.taxedWeeks.includes(idx);
  // Computed synchronously (not a setState updater) so the same value can go
  // to setConfig AND onSaveConfig — same pattern every other card in this
  // file uses. Each tap here is a complete, discrete action (set this one
  // week's status, done) that shouldn't sit in the ambient debounce window.
  const setPastStatus = (idx, taxed) => {
    const newConfig = {
      ...config,
      pastWeekTaxStatusOverrides: {
        ...(config.pastWeekTaxStatusOverrides ?? {}),
        [idx]: taxed,
      },
    };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
  };

  const toggleWeek = (idx) => {
    const s = new Set(config.taxedWeeks);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    const newConfig = { ...config, taxedWeeks: [...s].sort((a, b) => a - b) };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
  };

  // A week belongs in the "past" section if it's been confirmed via WeekConfirmModal
  // OR its end date is before today. Using confirmation lets a week slide over the
  // moment the user taps Confirm in the modal, even when weekEnd === today.
  const isPastOrConfirmed = (w) =>
    Boolean(weekConfirmations[w.idx]) || (today != null && toLocalIso(w.weekEnd) < today);

  // Future schedule only shows weeks not yet past/confirmed.
  const scheduleByMonth = MONTH_FULL.map((name, mi) => {
    const wks = allWeeks.filter(w =>
      w.active &&
      w.weekEnd.getFullYear() === 2026 &&
      w.weekEnd.getMonth() === mi &&
      !isPastOrConfirmed(w)
    );
    return { name, wks };
  }).filter(m => m.wks.length > 0);

  // Pay-schedule-aware check history ─────────────────────────────────────────
  const paySchedule = config.userPaySchedule ?? "weekly";
  const firstActiveIdx = config.firstActiveIdx ?? 0;
  const PAY_SCHEDULE_LABELS = { weekly: "Weekly", biweekly: "Biweekly", monthly: "Monthly", salary: "Salary (Biweekly)" };

  // extraPerCheck from taxDerived is per-week (used correctly in computeNet per fiscal week).
  // For display purposes, convert to per-paycheck: biweekly users get 2 weeks per check.
  const checksPerYear = { weekly: 52, biweekly: 26, monthly: 12, salary: 26 }[paySchedule] ?? 52;
  const perCheckFactor = 52 / checksPerYear;
  const extraPerPaycheck = extraPerCheck * perCheckFactor;
  const remainingPaychecks = Math.round(taxedWeekCount / perCheckFactor);

  const allPastWeeks = allWeeks.filter(w => w.active && isPastOrConfirmed(w));

  let pastCheckWeeks;
  if (paySchedule === "biweekly" || paySchedule === "salary") {
    // Every other week from firstActiveIdx is a check; offset 0 = check week
    pastCheckWeeks = allPastWeeks.filter(w => ((w.idx - firstActiveIdx) % 2 + 2) % 2 === 0);
  } else if (paySchedule === "monthly") {
    // Last active week of each calendar month = the pay week
    const byMonth = {};
    allPastWeeks.forEach(w => {
      const key = `${w.weekEnd.getFullYear()}-${w.weekEnd.getMonth()}`;
      if (!byMonth[key] || w.weekEnd > byMonth[key].weekEnd) byMonth[key] = w;
    });
    pastCheckWeeks = Object.values(byMonth).sort((a, b) => a.weekEnd - b.weekEnd);
  } else {
    // weekly: every past active week is a check
    pastCheckWeeks = allPastWeeks;
  }

  // Newest check first so the most recent work is at the top of the scroll box
  const sortedCheckWeeks = [...pastCheckWeeks].reverse();

  return (
    <>
      <BackBar onBack={onBack} title="Tax Plan" />

      {/* Extra withholding quick-toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", padding: "10px 14px", background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px" }}>
        <div style={{ fontSize: "11px", color: "var(--color-text-primary)", flex: 1 }}>Apply extra withholding <span style={{ color: "var(--color-teal)", fontWeight: "bold" }}>{f2(extraPerPaycheck)}/check</span> on taxed weeks → ~{f(config.targetOwedAtFiling)} owed at filing</div>
        <Pressable onClick={() => setShowExtra(v => !v)} style={{ fontSize: "9px", letterSpacing: "2px", padding: "5px 12px", borderRadius: "12px", cursor: "pointer", background: showExtra ? "rgba(0,200,150,0.10)" : "var(--color-bg-surface)", color: showExtra ? "var(--color-teal)" : "var(--color-text-primary)", border: "1px solid " + (showExtra ? "var(--color-teal)" : "var(--color-border-subtle)"), textTransform: "uppercase", flexShrink: 0 }}>{showExtra ? "ON" : "OFF"}</Pressable>
      </div>

      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "10px" }}>
          <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1 }}>Tax Strategy & Planning</div>
          {taxDraft === null ? (
            <Pressable onClick={() => setTaxDraft({
              fedStdDeduction: String(config.fedStdDeduction ?? ""),
              moFlatRate: String(config.moFlatRate ?? ""),
              targetOwedAtFiling: String(config.targetOwedAtFiling ?? ""),
              firstActiveIdx: String(config.firstActiveIdx ?? ""),
            })} style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>Edit Tax Plan</Pressable>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <Pressable onClick={() => { const nc = { ...config, fedStdDeduction: parseFloat(taxDraft.fedStdDeduction) || 0, moFlatRate: parseFloat(taxDraft.moFlatRate) || 0, targetOwedAtFiling: parseFloat(taxDraft.targetOwedAtFiling) || 0, firstActiveIdx: parseInt(taxDraft.firstActiveIdx) || 0 }; setConfig(nc); onSaveConfig?.(nc); setTaxDraft(null); }} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>Save</Pressable>
              <Pressable onClick={() => setTaxDraft(null)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "6px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
            </div>
          )}
        </div>

        {taxDraft === null ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
            {[{ l: "Federal Std Deduction", v: f(config.fedStdDeduction) }, ...(config.userState ? [] : [{ l: "State Rate (fallback)", v: `${(config.moFlatRate * 100).toFixed(1)}%` }]), { l: "Target Owed at Filing", v: f(config.targetOwedAtFiling) }, { l: "First Active Week Index", v: `idx ${config.firstActiveIdx}` }].map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}><span style={{ color: "var(--color-text-primary)" }}>{r.l}</span><span style={{ fontWeight: "bold", color: "var(--color-text-primary)" }}>{r.v}</span></div>)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={lSp}>Federal Std Deduction ($)</label><input type="number" step="100" value={taxDraft.fedStdDeduction} onChange={e => setTaxDraft(v => ({ ...v, fedStdDeduction: e.target.value }))} style={iS} /></div>
            {!config.userState && <div><label style={lSp}>State Rate (fallback)</label><input type="number" step="0.001" value={taxDraft.moFlatRate} onChange={e => setTaxDraft(v => ({ ...v, moFlatRate: e.target.value }))} style={iS} /></div>}
            <div><label style={lSp}>Target Owed at Filing ($)</label><input type="number" step="100" value={taxDraft.targetOwedAtFiling} onChange={e => setTaxDraft(v => ({ ...v, targetOwedAtFiling: e.target.value }))} style={iS} /></div>
            <div><label style={lSp}>First Active Week Index</label><input type="number" step="1" value={taxDraft.firstActiveIdx} onChange={e => setTaxDraft(v => ({ ...v, firstActiveIdx: e.target.value }))} style={iS} /></div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "12px", marginBottom: "20px" }}>
        <Card label="Full Year Fed Liability" val={f(fedLiability)} rawVal={fedLiability} sub={`${startDateDisplay ? `from ${startDateDisplay} · ` : ""}On ${f(fedAGI)} AGI`} color="var(--color-deduction)" size="20px" />
        <Card label="Full Year MO Liability" val={f(moLiability)} rawVal={moLiability} sub="4.7% flat" color="var(--color-teal)" size="20px" />
        <Card label="FICA (Always Paid)" val={f(ficaTotal)} rawVal={ficaTotal} sub="7.65% every check" color="var(--color-text-primary)" size="20px" />
      </div>

      {/* Tax gap analysis */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1, marginBottom: "12px" }}>Tax Gap Analysis</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
          {[{ l: "Fed withheld (taxed weeks)", v: f(fedWithheldBase), c: "var(--color-green)" }, { l: "MO withheld (taxed weeks)", v: f(moWithheldBase), c: "var(--color-green)" }, { l: "Federal gap", v: f(fedGap), c: "var(--color-deduction)" }, { l: "Missouri gap", v: f(moGap), c: "var(--color-deduction)" }, { l: "Total income tax gap", v: f(totalGap), c: "var(--color-deduction)" }, { l: "Target owed at filing", v: f(config.targetOwedAtFiling), c: "var(--color-teal)" }].map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}><span style={{ color: "var(--color-text-primary)" }}>{r.l}</span><span style={{ fontWeight: "bold", color: r.c }}>{r.v}</span></div>)}
        </div>

        {/* Event log pipeline indicator — always shown so user can confirm events are wired in */}
        <div style={{ marginTop: "14px", padding: "10px 12px", background: "var(--color-bg-base)", borderRadius: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "2px" }}>Log Event Impact (live)</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span style={{ color: "var(--color-text-primary)" }}>Gross adjustment from events</span>
            <span style={{ fontWeight: "bold", color: eventGrossDelta === 0 ? "var(--color-text-disabled)" : eventGrossDelta > 0 ? "var(--color-green)" : "var(--color-red)", fontVariantNumeric: "tabular-nums" }}>
              {eventGrossDelta === 0 ? "—" : (eventGrossDelta > 0 ? "+" : "") + f2(eventGrossDelta)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span style={{ color: "var(--color-text-primary)" }}>Fed liability shift from events</span>
            <span style={{ fontWeight: "bold", color: fedLiabilityEventDelta === 0 ? "var(--color-text-disabled)" : fedLiabilityEventDelta > 0 ? "var(--color-red)" : "var(--color-green)", fontVariantNumeric: "tabular-nums" }}>
              {fedLiabilityEventDelta === 0 ? "—" : (fedLiabilityEventDelta > 0 ? "+" : "") + f2(fedLiabilityEventDelta)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span style={{ color: "var(--color-text-primary)" }}>State liability shift from events</span>
            <span style={{ fontWeight: "bold", color: moLiabilityEventDelta === 0 ? "var(--color-text-disabled)" : moLiabilityEventDelta > 0 ? "var(--color-red)" : "var(--color-green)", fontVariantNumeric: "tabular-nums" }}>
              {moLiabilityEventDelta === 0 ? "—" : (moLiabilityEventDelta > 0 ? "+" : "") + f2(moLiabilityEventDelta)}
            </span>
          </div>
          {eventGrossDelta === 0 && (
            <div style={{ fontSize: "10px", color: "var(--color-text-primary)", marginTop: "2px" }}>No logged events affecting gross yet — will update as you confirm weeks.</div>
          )}
        </div>
      </div>

      {/* Extra withholding plan */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "20px", marginBottom: "28px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1, marginBottom: "12px" }}>Extra Withholding Plan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "12px", marginBottom: "16px" }}>
          {[{ l: "Extra Needed", v: f(targetExtraTotal), c: "var(--color-deduction)" }, { l: "Remaining Paychecks", v: remainingPaychecks, c: "var(--color-text-primary)" }, { l: "Extra Per Check", v: f2(extraPerPaycheck), c: "var(--color-teal)" }].map(c => <div key={c.l} style={{ textAlign: "center", padding: "12px", background: "var(--color-bg-base)", borderRadius: "6px" }}><div style={{ fontSize: "9px", letterSpacing: "2px", color: "var(--color-text-primary)", textTransform: "uppercase", marginBottom: "6px" }}>{c.l}</div><div style={{ fontSize: "20px", fontWeight: "bold", color: c.c }}>{c.v}</div></div>)}
        </div>
        <div style={{ fontSize: "11px", color: "var(--color-text-primary)", lineHeight: "1.8" }}>Add <span style={{ color: "var(--color-teal)", fontWeight: "bold" }}>{f2(extraPerPaycheck)}</span> extra federal withholding on each of your <span style={{ color: "var(--color-teal)" }}>{remainingPaychecks} remaining taxed checks</span>.</div>
      </div>

      {/* ── Check History — Past Tax Status Editor ─────────────────────────── */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", gap: "8px" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text-primary)" }}>Check History — Tax Status</div>
            <div style={{ fontSize: "10px", color: "var(--color-text-primary)", marginTop: "2px" }}>
              Overrides only affect extra withholding math · {sortedCheckWeeks.length} check{sortedCheckWeeks.length !== 1 ? "s" : ""} recorded
            </div>
          </div>
          <span style={{ fontSize: "9px", padding: "3px 8px", borderRadius: "10px", flexShrink: 0, background: "rgba(0,200,150,0.08)", border: "1px solid rgba(0,200,150,0.18)", color: "var(--color-teal)", letterSpacing: "1px", textTransform: "uppercase" }}>
            {PAY_SCHEDULE_LABELS[paySchedule] ?? "Weekly"}
          </span>
        </div>

        <div style={{
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "10px",
          overflowY: "auto",
          maxHeight: "400px",
          background: "var(--color-bg-base)",
        }}>
          {sortedCheckWeeks.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: "11px", color: "var(--color-text-primary)" }}>
              No checks recorded yet — weeks slide in here as they pass.
            </div>
          ) : sortedCheckWeeks.map((w, i) => {
            const taxed = getPastStatus(w.idx);
            const isOverride = hasPastOverride(w.idx);
            const isConfirmed = Boolean(weekConfirmations[w.idx]);
            const checkNum = pastCheckWeeks.length - i;
            const rotLabel = formatRotationDisplay(w, { isAdmin });
            return (
              <div
                key={w.idx}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  gap: "10px", padding: "10px 14px",
                  borderBottom: i < sortedCheckWeeks.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "10px", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>
                      #{checkNum}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    {isConfirmed && (
                      <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: "rgba(34,197,94,0.12)", color: "var(--color-green)", border: "1px solid rgba(34,197,94,0.25)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                        confirmed
                      </span>
                    )}
                    {isOverride && (
                      <span style={{ fontSize: "8px", padding: "1px 5px", borderRadius: "3px", background: "rgba(0,200,150,0.08)", color: "var(--color-accent-primary)", border: "1px solid rgba(0,200,150,0.18)", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                        override
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>
                    {rotLabel} · {f2(w.grossPay)}
                  </div>
                </div>
                <div style={{ display: "flex", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)", borderRadius: "6px", overflow: "hidden", flexShrink: 0 }}>
                  <Pressable onClick={() => setPastStatus(w.idx, true)} style={{ padding: "6px 10px", fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", border: "none", cursor: "pointer", background: taxed ? "rgba(0,200,150,0.16)" : "transparent", color: taxed ? "var(--color-accent-primary)" : "var(--color-text-secondary)", fontWeight: taxed ? "bold" : "normal" }}>Taxed</Pressable>
                  <div style={{ width: "1px", background: "var(--color-border-subtle)" }} />
                  <Pressable onClick={() => setPastStatus(w.idx, false)} style={{ padding: "6px 10px", fontSize: "9px", textTransform: "uppercase", letterSpacing: "1.5px", border: "none", cursor: "pointer", background: !taxed ? "rgba(34,197,94,0.16)" : "transparent", color: !taxed ? "var(--color-green)" : "var(--color-text-secondary)", fontWeight: !taxed ? "bold" : "normal" }}>Exempt</Pressable>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-week toggle schedule */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1 }}>Future Weekly Tax Schedule</div>
        <div style={{ display: "flex", gap: "10px", fontSize: "10px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#7a8bbf", display: "inline-block" }} />Taxed weeks: <strong style={{ color: "var(--color-deduction)" }}>{config.taxedWeeks.length}</strong></span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "var(--color-green)", display: "inline-block" }} />Exempt weeks: <strong style={{ color: "var(--color-green)" }}>{allWeeks.filter(w => w.active).length - config.taxedWeeks.length}</strong></span>
        </div>
      </div>

      {scheduleByMonth.map(m => <div key={m.name} style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "8px" }}>{m.name.slice(0, 3)}</div>
        {m.wks.map(w => {
          const taxed = config.taxedWeeks.includes(w.idx);
          const isPast = today ? toLocalIso(w.weekEnd) < today : false;
          return <div key={w.idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: isPast ? "var(--color-bg-base)" : "var(--color-bg-surface)", border: `1px solid ${isPast ? "var(--color-border-subtle)" : taxed ? "#7a8bbf22" : "rgba(76,175,125,0.13)"}`, borderRadius: "6px", marginBottom: "6px", opacity: isPast ? 0.5 : 1 }}>
            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "bold", color: isPast ? "var(--color-text-disabled)" : "var(--color-text-primary)" }}>Ends {w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}{isPast && <span style={{ marginLeft: "6px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-primary)", fontWeight: "normal" }}>received</span>}</div>
                <div style={{ fontSize: "10px", color: "var(--color-text-primary)" }}>{formatRotationDisplay(w, { isAdmin })} · {w.totalHours}h · idx {w.idx}{w.has401k ? " · 401k✓" : ""}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>{f2(w.grossPay)} gross</div>
                <div style={{ fontSize: "11px", color: isPast ? "var(--color-text-disabled)" : taxed ? "var(--color-text-primary)" : "var(--color-green)" }}>{f2(gN(w))} net</div>
              </div>
            </div>
            <div style={{ display: "flex", background: "var(--color-bg-base)", border: "1px solid #2a2a2a", borderRadius: "5px", overflow: "hidden" }}>
              <Pressable disabled={isPast} onClick={() => !isPast && !taxed && toggleWeek(w.idx)} style={{ padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", border: "none", cursor: isPast || taxed ? "default" : "pointer", background: taxed ? (isPast ? "#15152a" : "#1e1e3a") : "transparent", color: taxed ? (isPast ? "#3a3a5a" : "#7a8bbf") : "var(--color-border-subtle)", fontWeight: taxed ? "bold" : "normal", transition: "all 0.12s" }}>Taxed</Pressable>
              <div style={{ width: "1px", background: "var(--color-border-subtle)" }} />
              <Pressable disabled={isPast} onClick={() => !isPast && taxed && toggleWeek(w.idx)} style={{ padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", border: "none", cursor: isPast || !taxed ? "default" : "pointer", background: !taxed ? (isPast ? "#0f2a1a" : "#1e4a30") : "transparent", color: !taxed ? (isPast ? "#1f4a2a" : "var(--color-green)") : "var(--color-border-subtle)", fontWeight: !taxed ? "bold" : "normal", transition: "all 0.12s" }}>Exempt</Pressable>
            </div>
          </div>;
        })}
      </div>)}
      <div style={{ padding: "12px", background: "var(--color-bg-surface)", borderRadius: "6px", fontSize: "10px", color: "var(--color-text-primary)", lineHeight: "1.9" }}>
        Toggling a week instantly recalculates projected net, tax gap, extra withholding per check, and all downstream totals.
      </div>
    </>
  );
}

// ── Main list view ──────────────────────────────────────────────────────────

// A tappable row that navigates to a sub-view
function ListRow({ label, summary, onPress, last }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onClick={(e) => onPress?.(e)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", width: "100%",
        padding: "14px 16px",
        background: hovered ? "var(--color-bg-raised)" : "transparent",
        border: "none",
        borderBottom: last ? "none" : "1px solid #1e1e1e",
        cursor: "pointer",
        transition: "background 0.15s",
        textAlign: "left",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", color: "var(--color-text-primary)", fontWeight: "500" }}>{label}</div>
        {summary && <div style={{ fontSize: "11px", color: "var(--color-text-primary)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</div>}
      </div>
      <span style={{ fontSize: "18px", color: "var(--color-text-primary)", marginLeft: "12px", lineHeight: 1 }}>›</span>
    </Pressable>
  );
}

// ── ProfilePanel ────────────────────────────────────────────────────────────

// docs/TODO.md §32 — self-serve redemption for an already-signed-in account.
// Mirrors the investor code flow's client-side validate-then-redeem shape
// (LoginScreen.jsx's investorCode handling), but simpler: this upgrades an
// existing account in place rather than routing into a separate registration
// form, so a full-page reload after success is the simplest correct way to
// pick up the new is_tester/beta_code_used values (loadUserData's read-only
// mapping) without threading a new reload-trigger callback through App.jsx
// for a one-time, rarely-used action.
function BetaRedeemDetail({ onBack }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState({ loading: false, error: null, success: false });

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed || status.loading) return;
    setStatus({ loading: true, error: null, success: false });
    const result = await redeemBetaCode(trimmed);
    if (result.ok) {
      setStatus({ loading: false, error: null, success: true });
    } else {
      setStatus({ loading: false, error: result.error || "Invalid or inactive beta code", success: false });
    }
  };

  return (
    <>
      <BackBar onBack={onBack} title="Redeem Beta Code" />
      <DetailCard>
        <div style={{ padding: "13px 16px" }}>
          {status.success ? (
            <>
              <div style={{ fontSize: "13px", color: "var(--color-teal)", marginBottom: "12px" }}>
                Code accepted — welcome to the beta.
              </div>
              <Pressable
                onClick={() => window.location.reload()}
                style={{ width: "100%", padding: "9px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
              >
                Continue
              </Pressable>
            </>
          ) : (
            <>
              <label style={lSp}>Beta Access Code</label>
              <input
                type="text"
                autoComplete="off"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder="enter access code"
                style={{ ...iS, marginTop: "6px", marginBottom: "10px" }}
              />
              {status.error && (
                <div style={{ fontSize: "11px", color: "var(--color-red)", marginBottom: "10px" }}>{status.error}</div>
              )}
              <Pressable
                onClick={handleRedeem}
                disabled={status.loading || !code.trim()}
                style={{ width: "100%", padding: "9px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: (status.loading || !code.trim()) ? "default" : "pointer", opacity: !code.trim() ? 0.45 : 1 }}
              >
                {status.loading ? "Checking…" : "Redeem"}
              </Pressable>
            </>
          )}
        </div>
      </DetailCard>
    </>
  );
}

// docs/TODO.md §33 — replaces the earlier mailto: link. The beta scoring
// rubric needs feedback to be both countable ("frequency") and readable
// ("specificity"), which a mailto link can never supply — this logs the
// actual text via logBetaFeedback (migration 030_add_beta_feedback.sql)
// instead of handing it off to the user's mail client.
function BetaFeedbackDetail({ isTester, betaCodeUsed, onBack }) {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState({ loading: false, error: null, success: false });

  const handleSubmit = async () => {
    if (!note.trim() || status.loading) return;
    setStatus({ loading: true, error: null, success: false });
    const result = await logBetaFeedback({ isTester, betaCodeUsed, note });
    if (result.ok) {
      setStatus({ loading: false, error: null, success: true });
      setNote("");
    } else {
      setStatus({ loading: false, error: result.error || "Couldn't submit feedback", success: false });
    }
  };

  return (
    <>
      <BackBar onBack={onBack} title="Send Feedback" />
      <DetailCard>
        <div style={{ padding: "13px 16px" }}>
          {status.success ? (
            <>
              <div style={{ fontSize: "13px", color: "var(--color-teal)", marginBottom: "12px" }}>
                Thanks — got it.
              </div>
              <Pressable
                onClick={onBack}
                style={{ width: "100%", padding: "9px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
              >
                Done
              </Pressable>
            </>
          ) : (
            <>
              <label style={lSp}>What's working (or not)?</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Tell us what you're noticing during the beta..."
                maxLength={4000}
                rows={6}
                style={{ ...iS, marginTop: "6px", marginBottom: "10px", resize: "vertical", fontFamily: "inherit" }}
              />
              {status.error && (
                <div style={{ fontSize: "11px", color: "var(--color-red)", marginBottom: "10px" }}>{status.error}</div>
              )}
              <Pressable
                onClick={handleSubmit}
                disabled={status.loading || !note.trim()}
                style={{ width: "100%", padding: "9px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: (status.loading || !note.trim()) ? "default" : "pointer", opacity: !note.trim() ? 0.45 : 1 }}
              >
                {status.loading ? "Sending…" : "Submit"}
              </Pressable>
            </>
          )}
        </div>
      </DetailCard>
    </>
  );
}

export function ProfilePanel({ authedUser, config, setConfig, saveConfigNow, onLocalSignOut, allWeeks, taxDerived, showExtra, setShowExtra, isAdmin, taxProjectionsEnabled = false, isTester = false, betaCodeUsed = null, today, weekConfirmations = {}, onInstallClick, onOpenLifeEvents, onBackToWork, subscription }) {
  // Tax Plan unlock is manual-only for now (admin, beta tester, or the per-user
  // tax_projections_enabled flag). The setup wizard's "Unlock projections" choice
  // intentionally does NOT reveal it — see canAccessTaxPlan for why.
  const canSeeTaxPlan = canAccessTaxPlan({ isAdmin, taxProjectionsEnabled, isTester });
  // docs/TODO.md §33/§36 — the real 10-week cohort only (isAdmin does NOT count,
  // same distinction isTrackedBetaTester enforces everywhere else).
  const isBetaTester = isTrackedBetaTester({ isTester, betaCodeUsed });
  const [activeSection, setActiveSection] = useState(null);
  const [showLocalSignOutConfirm, setShowLocalSignOutConfirm] = useState(false);
  const signOutFold = useFoldTransition(showLocalSignOutConfirm, { ms: 340 });
  const [localSignOutState, setLocalSignOutState] = useState({ loading: false, error: null });

  const isEmployerDHL     = config.employerPreset === "DHL";
  const isBaseUser = !isEmployerDHL;
  const employer  = isEmployerDHL ? "DHL / P&G" : (config.employerPreset || "Independent");
  const has401k   = config.k401Rate > 0;
  const enrolled  = Array.isArray(config.selectedBenefits) ? config.selectedBenefits : [];
  const matchRate = isEmployerDHL ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);
  const localSignOutAction = onLocalSignOut ?? (async () => { await supabase.auth.signOut({ scope: "local" }); });

  async function confirmLocalSignOut() {
    setLocalSignOutState({ loading: true, error: null });
    try {
      await localSignOutAction();
      setShowLocalSignOutConfirm(false);
      setLocalSignOutState({ loading: false, error: null });
    } catch (error) {
      setLocalSignOutState({
        loading: false,
        error: error?.message || "Unable to sign out right now.",
      });
    }
  }

  // Sub-view routing
  if (activeSection === "account") {
    return <AccountDetail authedUser={authedUser} config={config} subscription={subscription} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "pay") {
    return <PayDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} onBack={() => setActiveSection(null)} onOpenLifeEvents={onOpenLifeEvents} />;
  }
  if (activeSection === "retirement") {
    return <BenefitsDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "preferences") {
    return <PreferencesDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} onBack={() => setActiveSection(null)} taxFeatureUnlocked={canSeeTaxPlan} />;
  }
  if (activeSection === "taxplan" && canSeeTaxPlan) {
    return <TaxPlanDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} allWeeks={allWeeks} taxDerived={taxDerived} showExtra={showExtra} setShowExtra={setShowExtra} onBack={() => setActiveSection(null)} isAdmin={isAdmin} today={today} weekConfirmations={weekConfirmations} />;
  }
  if (activeSection === "investorcodes") {
    return <InvestorAdminPanel onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "betaredeem") {
    return <BetaRedeemDetail onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "betafeedback") {
    return <BetaFeedbackDetail isTester={isTester} betaCodeUsed={betaCodeUsed} onBack={() => setActiveSection(null)} />;
  }

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "520px" }}>
      <PanelHero eyebrow="Authority Finance">Account</PanelHero>

      {/* TODO §15 nav/panel restructuring — Job & Pay and Retirement & Benefits
          both show figures (rate, 401k contribution/match) that are either
          stale or actively misleading while there's no real income to speak
          of. Swapped for a single "Back to Work" entry point instead — the
          same structure_change flow the Job Loss banner's button already
          uses (§15.H4) — as a second route to it beyond the banner. */}
      {config?.jobLossMode ? (
        <>
          <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "8px", paddingLeft: "4px" }}>Job Search</div>
          <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid rgba(245,158,11,0.28)", overflow: "hidden", marginBottom: "20px" }}>
            <ListRow
              label="Back to Work"
              summary="Fill in your new pay structure and exit Job Loss Mode"
              onPress={onBackToWork}
              last
            />
          </div>
        </>
      ) : (
        <>
          {/* Work & Pay group. Employment lives inside the Job & Pay detail view
              (below the pay cards) rather than as its own row — it's a small,
              low-churn set of fields. Life Events is reachable from the bottom of
              that same detail view, plus the always-present sidebar/drawer nav, so
              it isn't duplicated here as a standalone card. */}
          <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "8px", paddingLeft: "4px" }}>Work & Pay</div>
          <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", overflow: "hidden", marginBottom: "20px" }}>
            <ListRow
              label="Job & Pay"
              summary={`${employer} · $${config.baseRate}/hr${config.shiftHours ? ` · ${config.shiftHours}h shifts` : ""}`}
              onPress={() => setActiveSection("pay")}
            />
            <ListRow
              label="Retirement & Benefits"
              summary={has401k ? `401k ${(config.k401Rate * 100).toFixed(0)}% + ${(matchRate * 100).toFixed(1)}% match${enrolled.length ? ` · ${enrolled.length} benefit${enrolled.length !== 1 ? "s" : ""}` : ""}` : "No 401k enrolled"}
              onPress={() => setActiveSection("retirement")}
              last
            />
          </div>
        </>
      )}

      {/* App group */}
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "8px", paddingLeft: "4px" }}>App</div>
      <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", overflow: "hidden", marginBottom: "20px" }}>
        <ListRow
          label="Account"
          summary={authedUser?.email ?? "—"}
          onPress={() => setActiveSection("account")}
        />
        <ListRow
          label="App Preferences"
          summary={`${config.bufferEnabled ? `Buffer $${config.paycheckBuffer}/check` : "Buffer off"} · ${canSeeTaxPlan && config.taxExemptOptIn ? "Tax exempt on" : "Standard tax"}`}
          onPress={() => setActiveSection("preferences")}
          last={!(canSeeTaxPlan && !config?.jobLossMode) && !isAdmin}
        />
        {/* Tax Plan assumes real withholding against real pay — nothing to plan
            around while jobLossMode is true. */}
        {canSeeTaxPlan && !config?.jobLossMode && (
          <ListRow
            label="Tax Plan"
            summary={`${config.taxedWeeks?.length ?? 0} taxed weeks · target $${config.targetOwedAtFiling} owed`}
            onPress={() => setActiveSection("taxplan")}
            last={!isAdmin}
          />
        )}
        {isAdmin && (
          <ListRow
            label="Investor Codes"
            summary="Manage access codes and view registrations"
            onPress={() => setActiveSection("investorcodes")}
            last
          />
        )}
      </div>

      {/* Beta Program group (docs/TODO.md §32/§33/§36) — one section that adapts
          to redemption state instead of two near-duplicate UI elements. Before
          redemption: a "Redeem Beta Code" entry point visible to every user,
          same always-visible-regardless-of-invite pattern LoginScreen already
          uses for the investor access code. After redemption (tracked 10-week
          cohort only — never friends/family testers, is_tester true with no
          beta_code_used): the section header itself doubles as the "badge," a
          passive acknowledgment every time this panel opens, paired with the
          feedback row. */}
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-primary)", marginBottom: "8px", paddingLeft: "4px" }}>Beta Program</div>
      <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", overflow: "hidden", marginBottom: "20px" }}>
        {isBetaTester ? (
          <ListRow
            label="Send Feedback"
            summary="Tell us what's working (or not) during the 10-week beta"
            onPress={() => setActiveSection("betafeedback")}
            last
          />
        ) : (
          <ListRow
            label="Redeem Beta Code"
            summary="Have a beta program access code? Enter it here"
            onPress={() => setActiveSection("betaredeem")}
            last
          />
        )}
      </div>

      {/* Install instructions trigger — hidden when already running standalone
          (App passes onInstallClick=null in that case). */}
      {onInstallClick && (
        <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", overflow: "hidden", marginBottom: "20px" }}>
          <ListRow
            label="Install on home screen"
            summary="Add A:Fin to your home screen — opens like a native app"
            onPress={(e) => onInstallClick(e.currentTarget)}
            last
          />
        </div>
      )}

      <Pressable
        onClick={() => { setLocalSignOutState({ loading: false, error: null }); setShowLocalSignOutConfirm(true); }}
        style={{ width: "100%", padding: "14px 16px", background: "var(--color-bg-surface)", border: "1px solid rgba(224,92,92,0.3)", borderRadius: "12px", color: "var(--color-deduction)", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out (This Device)
      </Pressable>

      {/* Portaled to document.body so position:fixed resolves against the viewport,
          not the scrolling .main-content ancestor (iOS Safari scrollTop hit-test bug). */}
      {signOutFold.mounted && createPortal(
        <div className="fold-backdrop" data-fold={signOutFold.fold} style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
          <div className="fold-modal" data-fold={signOutFold.fold} style={{ width: "100%", maxWidth: "420px", background: "var(--color-bg-surface)", border: "1px solid rgba(224,92,92,0.35)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "16px", fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>Sign Out</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-primary)", lineHeight: "1.55" }}>
              Sign out from this device now?
            </div>
            {localSignOutState.error && (
              <div style={{ fontSize: "11px", color: "var(--color-deduction)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>
                {localSignOutState.error}
              </div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <Pressable onClick={() => setShowLocalSignOutConfirm(false)} disabled={localSignOutState.loading} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: localSignOutState.loading ? "default" : "pointer" }}>Cancel</Pressable>
              <Pressable onClick={confirmLocalSignOut} disabled={localSignOutState.loading} style={{ flex: 1, padding: "9px 0", background: "var(--color-deduction)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: localSignOutState.loading ? "default" : "pointer" }}>{localSignOutState.loading ? "..." : "Confirm"}</Pressable>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}
