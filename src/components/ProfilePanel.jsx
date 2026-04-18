import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { dhlEmployerMatchRate, computeNet } from "../lib/finance.js";
import { DHL_BENEFIT_OPTIONS, DHL_PRESET, MONTH_FULL } from "../constants/config.js";
import { iS, lS, Card, PanelHero } from "./ui.jsx";
import { formatRotationDisplay } from "../lib/rotation.js";

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
      <button
        onClick={onBack}
        style={{ background: "transparent", border: "none", color: "var(--color-gold)", cursor: "pointer", fontSize: "13px", padding: "4px 0", display: "flex", alignItems: "center", gap: "5px" }}
      >
        <span style={{ fontSize: "16px", lineHeight: 1 }}>‹</span>
        <span style={{ letterSpacing: "1.5px", textTransform: "uppercase", fontSize: "10px" }}>Profile</span>
      </button>
      <div style={{ flex: 1, fontSize: "13px", fontWeight: "bold", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-primary)" }}>
        {title}
      </div>
    </div>
  );
}

// Read-only detail row used inside sub-views
function DetailRow({ label, value, valueColor, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: last ? "none" : "1px solid #1e1e1e" }}>
      <span style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>{label}</span>
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

function AccountDetail({ authedUser, config, onBack }) {
  const setupColor  = config.setupComplete ? "var(--color-green)"           : "var(--color-gold)";
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
  const [deleteText, setDeleteText] = useState("");
  const [deleteState, setDeleteState] = useState({ error: null, loading: false });

  const [linkState, setLinkState] = useState({ loading: false, error: null });
  const hasGoogleLinked = authedUser?.identities?.some(id => id.provider === "google") ?? false;
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
          <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "10px" }}>Connected Accounts</div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {authedUser?.identities?.some(id => id.provider === "email") && (
              <span style={{ fontSize: "11px", padding: "3px 10px", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "20px", color: "var(--color-text-secondary)" }}>
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
            <button
              onClick={handleLinkGoogle}
              disabled={linkState.loading}
              style={{ marginTop: "12px", padding: "8px 14px", background: "transparent", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: "var(--color-text-primary)", fontSize: "12px", cursor: linkState.loading ? "default" : "pointer" }}
            >
              {linkState.loading ? "Redirecting to Google…" : "Link Google Account"}
            </button>
          )}
          {linkState.error && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--color-red)" }}>{linkState.error}</div>
          )}
        </div>
      </DetailCard>

      <DetailCard>
        {!showEmailForm ? (
          <button
            onClick={() => setShowEmailForm(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: "14px", color: "var(--color-text-primary)", fontWeight: "500" }}>Change Email</span>
            <span style={{ fontSize: "18px", color: "#555", lineHeight: 1 }}>›</span>
          </button>
        ) : (
          <form onSubmit={handleChangeEmail} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", fontWeight: "600" }}>Change Email</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lS}>New Email</label>
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required autoComplete="email" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
              Supabase will send a confirmation email to the new address.
            </div>
            {emailStatus.error && (
              <div style={{ fontSize: "11px", color: "var(--color-red)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>{emailStatus.error}</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => { setShowEmailForm(false); setEmailStatus({ error: null, success: null, loading: false }); setNewEmail(authedUser?.email ?? ""); }} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={emailStatus.loading} style={{ flex: 1, padding: "9px 0", background: "var(--color-green)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: emailStatus.loading ? "default" : "pointer" }}>{emailStatus.loading ? "..." : "Save"}</button>
            </div>
          </form>
        )}
        {emailStatus.success && (
          <div style={{ padding: "0 16px 14px", fontSize: "11px", color: "var(--color-green)" }}>
            {emailStatus.success}
          </div>
        )}
      </DetailCard>

      <DetailCard>
        {!showPwForm ? (
          <button
            onClick={() => setShowPwForm(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
          >
            <span style={{ fontSize: "14px", color: "var(--color-text-primary)", fontWeight: "500" }}>Change Password</span>
            <span style={{ fontSize: "18px", color: "#555", lineHeight: 1 }}>›</span>
          </button>
        ) : (
          <form onSubmit={handleChangePw} style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", fontWeight: "600" }}>Change Password</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lS}>Current Password</label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Required to verify" required autoComplete="current-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lS}>New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 8 characters" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lS}>Confirm New Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            {pwError && (
              <div style={{ fontSize: "11px", color: "var(--color-red)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>{pwError}</div>
            )}
            {pwSaved && (
              <div style={{ fontSize: "11px", color: "var(--color-green)" }}>Password updated.</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => { setShowPwForm(false); setPwError(null); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={pwLoading} style={{ flex: 1, padding: "9px 0", background: "var(--color-green)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: pwLoading ? "default" : "pointer" }}>{pwLoading ? "..." : "Save"}</button>
            </div>
          </form>
        )}
      </DetailCard>

      <DetailCard>
        <button
          onClick={handleGlobalSignOut}
          disabled={globalSignoutState.loading}
          style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", textAlign: "left", cursor: globalSignoutState.loading ? "default" : "pointer" }}
        >
          <div style={{ fontSize: "14px", color: "var(--color-text-primary)", fontWeight: "500", marginBottom: "4px" }}>Sign Out All Devices</div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
            Ends active sessions on every device for this account.
          </div>
        </button>
        {(globalSignoutState.error || globalSignoutState.success) && (
          <div style={{ padding: "0 16px 12px", fontSize: "11px", color: globalSignoutState.error ? "var(--color-red)" : "var(--color-green)" }}>
            {globalSignoutState.error || globalSignoutState.success}
          </div>
        )}
      </DetailCard>

      <DetailCard style={{ borderColor: "rgba(224,92,92,0.32)" }}>
        <button
          onClick={() => { setDeleteText(""); setDeleteState({ error: null, loading: false }); setShowDeleteDialog(true); }}
          style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
        >
          <div style={{ fontSize: "14px", color: "var(--color-red)", fontWeight: "600", marginBottom: "4px" }}>Delete Account</div>
          <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
            This permanently deletes your account and dashboard data.
          </div>
        </button>
      </DetailCard>

      <button
        onClick={async () => { await supabase.auth.signOut({ scope: "local" }); }}
        style={{ width: "100%", padding: "14px 16px", background: "var(--color-bg-surface)", border: "1px solid rgba(224,92,92,0.3)", borderRadius: "12px", color: "var(--color-red)", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out (This Device)
      </button>

      {showDeleteDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
          <div style={{ width: "100%", maxWidth: "430px", background: "var(--color-bg-surface)", border: "1px solid rgba(224,92,92,0.4)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ fontSize: "16px", fontFamily: "var(--font-display)", color: "var(--color-red)" }}>Delete Account</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.55" }}>
              This action is irreversible. Your account, profile, and stored dashboard data will be permanently deleted.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lS}>Type DELETE to confirm</label>
              <input type="text" value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder="DELETE" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            {deleteState.error && (
              <div style={{ fontSize: "11px", color: "var(--color-red)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>{deleteState.error}</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setShowDeleteDialog(false)} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleDeleteAccount} disabled={deleteText.trim() !== "DELETE" || deleteState.loading} style={{ flex: 1, padding: "9px 0", background: "var(--color-red)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: deleteState.loading ? "default" : "pointer", opacity: deleteText.trim() !== "DELETE" ? 0.6 : 1 }}>{deleteState.loading ? "..." : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function EmploymentDetail({ config, setConfig, onSaveConfig, onBack }) {
  const isDHL = config.employerPreset === "DHL";

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

  const employer = isDHL ? "DHL / P&G" : (config.employerPreset || "Independent");

  return (
    <>
      <BackBar onBack={onBack} title="Employment" />

      <DetailCard>
        <DetailRow label="Employer" value={employer} />
        <DetailRow label="State"    value={config.userState || "—"} last={!isDHL && !!config.startDate} />
        {/* Start date — read-only if already set, editable if not */}
        {config.startDate ? (
          <DetailRow label="Job Start" value={fmt(config.startDate)} last={!isDHL} />
        ) : (
          <div style={{ padding: "13px 16px", borderTop: "1px solid #1e1e1e" }}>
            <label style={lS}>Job Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setStartDateDirty(true); }}
              style={iS}
            />
          </div>
        )}
        {/* DHL Team — always editable for DHL users */}
        {isDHL && (
          <div style={{ padding: "13px 16px", borderTop: "1px solid #1e1e1e" }}>
            <label style={lS}>DHL Team</label>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              {["A", "B"].map(t => (
                <button
                  key={t}
                  onClick={() => { setDhlTeam(t); setTeamDirty(t !== config.dhlTeam); }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "8px", border: "1px solid",
                    borderColor: dhlTeam === t ? "var(--color-gold)" : "var(--color-border-subtle)",
                    background: dhlTeam === t ? "rgba(0,200,150,0.10)" : "var(--color-bg-base)",
                    color: dhlTeam === t ? "var(--color-gold)" : "var(--color-text-secondary)",
                    fontWeight: "bold", fontSize: "14px", cursor: "pointer",
                  }}
                >
                  Team {t}
                </button>
              ))}
            </div>
            {teamDirty && (
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "6px" }}>
                Rotation will update — save to apply.
              </div>
            )}
          </div>
        )}
      </DetailCard>

      {canSave && (
        <button
          onClick={handleSave}
          style={{ width: "100%", padding: "13px 16px", background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
        >
          Save
        </button>
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

function PayDetail({ config, setConfig, onSaveConfig, onBack }) {
  const isDHL = config.employerPreset === "DHL";
  const scheduleLabel = config.scheduleIsVariable
    ? "Variable hours"
    : `${config.standardWeeklyHours || 40} hrs / week`;
  const [editing, setEditing] = useState(false);
  const [payDraft, setPayDraft] = useState(null);
  const [error, setError] = useState(null);

  const startEditing = () => {
    setPayDraft({
      userPaySchedule: config.userPaySchedule ?? "weekly",
      annualSalary: config.annualSalary != null ? String(config.annualSalary) : "",
      baseRate: config.baseRate != null ? String(config.baseRate) : "",
      shiftHours: config.shiftHours != null ? String(config.shiftHours) : "",
      diffRate: config.diffRate != null ? String(config.diffRate) : "",
      nightDiffRate: config.nightDiffRate != null ? String(config.nightDiffRate) : "",
      dhlNightShift: Boolean(config.dhlNightShift),
      otThreshold: config.otThreshold != null ? String(config.otThreshold) : "",
      otMultiplier: config.otMultiplier != null ? String(config.otMultiplier) : "",
      standardWeeklyHours: config.standardWeeklyHours != null ? String(config.standardWeeklyHours) : "",
    });
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setPayDraft(null);
    setError(null);
  };

  const handleDraftChange = (field, value) => {
    setPayDraft(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!payDraft) return;
    setError(null);

    const updates = {};
    const schedule = payDraft.userPaySchedule || "weekly";
    updates.userPaySchedule = schedule;

    if (schedule === "salary") {
      const annualSalary = parseFloat(payDraft.annualSalary);
      if (!Number.isFinite(annualSalary) || annualSalary <= 0) {
        setError("Enter a valid annual salary.");
        return;
      }
      updates.annualSalary = Math.round(annualSalary);
      updates.baseRate = parseFloat((annualSalary / 2080).toFixed(2));
    } else {
      const baseRate = parseFloat(payDraft.baseRate);
      if (!Number.isFinite(baseRate) || baseRate <= 0) {
        setError("Enter a valid base hourly rate.");
        return;
      }
      updates.baseRate = parseFloat(baseRate.toFixed(2));
      updates.annualSalary = null;
    }

    const shiftHours = parseFloat(payDraft.shiftHours);
    if (!Number.isFinite(shiftHours) || shiftHours <= 0) {
      setError("Enter a valid shift length.");
      return;
    }
    updates.shiftHours = parseFloat(shiftHours.toFixed(2));

    const diffRate = parseFloat(payDraft.diffRate);
    updates.diffRate = Number.isFinite(diffRate) ? parseFloat(diffRate.toFixed(2)) : 0;

    if (isDHL) {
      updates.dhlNightShift = !!payDraft.dhlNightShift;
      const nightDiffRate = parseFloat(payDraft.nightDiffRate);
      updates.nightDiffRate = Number.isFinite(nightDiffRate) ? parseFloat(nightDiffRate.toFixed(2)) : 0;
    }

    const otThreshold = parseFloat(payDraft.otThreshold);
    if (!Number.isFinite(otThreshold) || otThreshold <= 0) {
      setError("Enter a valid OT threshold.");
      return;
    }
    updates.otThreshold = parseFloat(otThreshold.toFixed(2));

    const otMultiplier = parseFloat(payDraft.otMultiplier);
    if (!Number.isFinite(otMultiplier) || otMultiplier < 1) {
      setError("Enter a valid OT multiplier (>= 1).");
      return;
    }
    updates.otMultiplier = parseFloat(otMultiplier.toFixed(2));

    if (!config.scheduleIsVariable) {
      const rawWeekly = payDraft.standardWeeklyHours;
      const weeklyValue = rawWeekly === "" ? config.standardWeeklyHours : parseFloat(rawWeekly);
      if (!Number.isFinite(weeklyValue) || weeklyValue <= 0) {
        setError("Enter weekly hours for your schedule.");
        return;
      }
      updates.standardWeeklyHours = parseFloat(weeklyValue.toFixed(1));
    }

    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    onSaveConfig?.(newConfig);
    setEditing(false);
    setPayDraft(null);
  };

  return (
    <>
      <BackBar onBack={onBack} title="Pay Structure" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", paddingLeft: "4px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Base Pay & Differentials</div>
        {!editing && (
          <button
            onClick={startEditing}
            style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", background: "transparent", color: "var(--color-gold)", border: "1px solid rgba(0,200,150,0.28)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <DetailCard>
          <DetailRow label="Pay Schedule"   value={PAY_SCHEDULE_LABELS[config.userPaySchedule] ?? "Weekly"} />
          <DetailRow label="Base Rate"      value={`$${config.baseRate}/hr`}  valueColor="var(--color-gold)" />
          {config.shiftHours > 0 && <DetailRow label="Shift Length" value={`${config.shiftHours}h`} />}
          <DetailRow label="Schedule" value={scheduleLabel} />
          <DetailRow label="Weekend Diff" value={config.diffRate > 0 ? `+$${config.diffRate}/hr` : "$0.00/hr"} />
          {isDHL && (
            <DetailRow
              label="Night Diff"
              value={config.dhlNightShift && config.nightDiffRate > 0 ? `+$${config.nightDiffRate}/hr` : "Off"}
            />
          )}
          <DetailRow label="OT Threshold"   value={`${config.otThreshold} hrs/wk`} />
          <DetailRow label="OT Multiplier"  value={`${config.otMultiplier}×`} last />
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={lS}>Pay Schedule</label>
                <select
                  value={payDraft.userPaySchedule}
                  onChange={e => handleDraftChange("userPaySchedule", e.target.value)}
                  style={{ ...iS, appearance: "none" }}
                >
                  {Object.entries(PAY_SCHEDULE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {payDraft.userPaySchedule === "salary" && (
                <div style={{ gridColumn: "span 2" }}>
                  <label style={lS}>Annual Salary ($)</label>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={payDraft.annualSalary}
                    onChange={e => handleDraftChange("annualSalary", e.target.value)}
                    style={iS}
                  />
                  <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                    Hourly base pay auto-derives from salary ÷ 2080.
                  </div>
                </div>
              )}

              <div>
                <label style={lS}>Base Hourly Rate ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={payDraft.baseRate}
                  disabled={payDraft.userPaySchedule === "salary"}
                  onChange={e => handleDraftChange("baseRate", e.target.value)}
                  style={{ ...iS, opacity: payDraft.userPaySchedule === "salary" ? 0.6 : 1 }}
                />
              </div>

              <div>
                <label style={lS}>Shift Length (hrs)</label>
                <input
                  type="number"
                  step="0.25"
                  min="1"
                  value={payDraft.shiftHours}
                  onChange={e => handleDraftChange("shiftHours", e.target.value)}
                  style={iS}
                />
                <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
                  Update this if you move to 10-hour shifts.
                </div>
              </div>

              <div>
                <label style={lS}>Weekend Differential ($/hr)</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={payDraft.diffRate}
                  onChange={e => handleDraftChange("diffRate", e.target.value)}
                  style={iS}
                />
              </div>

              {isDHL && (
                <div>
                  <label style={lS}>Night Differential ($/hr)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={payDraft.nightDiffRate}
                    disabled={!payDraft.dhlNightShift}
                    onChange={e => handleDraftChange("nightDiffRate", e.target.value)}
                    style={{ ...iS, opacity: payDraft.dhlNightShift ? 1 : 0.6 }}
                  />
                  <div style={{ marginTop: "6px", display: "flex", gap: "8px", alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={payDraft.dhlNightShift}
                      onChange={e => handleDraftChange("dhlNightShift", e.target.checked)}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>Night shift applies</span>
                  </div>
                </div>
              )}

              <div>
                <label style={lS}>OT Threshold (hrs/wk)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={payDraft.otThreshold}
                  onChange={e => handleDraftChange("otThreshold", e.target.value)}
                  style={iS}
                />
              </div>

              <div>
                <label style={lS}>OT Multiplier</label>
                <input
                  type="number"
                  step="0.05"
                  min="1"
                  value={payDraft.otMultiplier}
                  onChange={e => handleDraftChange("otMultiplier", e.target.value)}
                  style={iS}
                />
              </div>

              {!config.scheduleIsVariable && (
                <div>
                  <label style={lS}>Standard Weekly Hours</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={payDraft.standardWeeklyHours}
                    onChange={e => handleDraftChange("standardWeeklyHours", e.target.value)}
                    style={iS}
                  />
                </div>
              )}
            </div>

            {error && (
              <div style={{ fontSize: "11px", color: "var(--color-red)", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px", padding: "8px 12px" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleSave}
                style={{ flex: 1, padding: "10px 0", background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
              >
                Save Changes
              </button>
              <button
                onClick={cancelEditing}
                style={{ flex: 1, padding: "10px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "10px", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </DetailCard>
      )}

      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.6" }}>
        Saving recalculates every paycheck, projection, and budget automatically.
      </div>
    </>
  );
}

function BenefitsDetail({ config, setConfig, onSaveConfig, onBack }) {
  const isDHL     = config.employerPreset === "DHL";
  const has401k   = config.k401Rate > 0;
  const matchRate = isDHL ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);
  const effectiveK401Start = config.k401StartDate || config.benefitsStartDate || null;
  const k401StartSource = config.k401StartDate ? "k401" : (config.benefitsStartDate ? "benefits" : null);
  const k401StartLabel = effectiveK401Start
    ? `${fmt(effectiveK401Start)}${k401StartSource === "benefits" ? " (benefits start)" : ""}`
    : "—";
  const k401StartColor = k401StartSource === "benefits" ? "var(--color-gold)" : undefined;
  const enrolledConfig = Array.isArray(config.selectedBenefits) ? config.selectedBenefits : [];

  const [editing, setEditing]   = useState(true);
  const [selectedBenefits, setSelectedBenefits] = useState(new Set(enrolledConfig));
  const [k401Rate, setK401Rate] = useState(String(config.k401Rate ?? ""));
  const [k401Match, setK401Match] = useState(String(config.k401MatchRate ?? ""));
  const [k401Start, setK401Start] = useState(config.k401StartDate ?? "");
  const [benefitsStartDate, setBenefitsStartDate] = useState(config.benefitsStartDate ?? "");
  const [weeklyValues, setWeeklyValues] = useState(
    DHL_BENEFIT_OPTIONS
      .filter(b => b.type === "weekly")
      .reduce((acc, b) => ({ ...acc, [b.field]: String(config[b.field] ?? "") }), {})
  );

  function handleSave() {
    const nextSelected = [...selectedBenefits];
    const weeklyPatch = DHL_BENEFIT_OPTIONS
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
        <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", paddingLeft: "4px" }}>401k</div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", background: "transparent", color: "var(--color-gold)", border: "1px solid rgba(0,200,150,0.28)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}>Edit</button>
        )}
      </div>

      {!editing ? (
        <DetailCard>
          <DetailRow
            label="Employee Rate"
            value={has401k ? `${(config.k401Rate * 100).toFixed(0)}%` : "Not enrolled"}
            valueColor={has401k ? undefined : "var(--color-text-disabled)"}
          />
          {!isDHL && (
            <DetailRow
              label="Employer Match"
              value={has401k ? `${(matchRate * 100).toFixed(1)}%` : "—"}
              valueColor={has401k ? "var(--color-green)" : "var(--color-text-disabled)"}
            />
          )}
          {isDHL && has401k && (
            <DetailRow label="Employer Match" value="Tiered (DHL formula)" valueColor="var(--color-green)" />
          )}
          <DetailRow label="Contribution Start" value={k401StartLabel} valueColor={k401StartColor} last />
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>
              Payroll-Deduction Benefits ({DHL_BENEFIT_OPTIONS.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
              {DHL_BENEFIT_OPTIONS.map((benefit) => (
                <button
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
                </button>
              ))}
            </div>
            <div>
              <label style={lS}>Benefits Start Date</label>
              <input type="date" value={benefitsStartDate} onChange={e => setBenefitsStartDate(e.target.value)} style={iS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div>
                <label style={lS}>Employee % (decimal)</label>
                <input type="number" step="0.01" min="0" max="1" value={k401Rate} onChange={e => setK401Rate(e.target.value)} style={iS} />
              </div>
              {!isDHL && (
                <div>
                  <label style={lS}>Match % (decimal)</label>
                  <input type="number" step="0.01" min="0" max="1" value={k401Match} onChange={e => setK401Match(e.target.value)} style={iS} />
                </div>
              )}
              <div>
                <label style={lS}>Start Date</label>
                <input type="date" value={k401Start} onChange={e => setK401Start(e.target.value)} style={iS} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {DHL_BENEFIT_OPTIONS.filter(b => b.type === "weekly").map((benefit) => (
                <div key={benefit.id}>
                  <label style={lS}>{benefit.label} ($ / week)</label>
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
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "8px 0", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", color: "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleSave} style={{ flex: 1, padding: "8px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </DetailCard>
      )}

      {/* Benefits enrollment (read-only) */}
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px", paddingLeft: "4px", marginTop: "20px" }}>Benefits Enrollment</div>
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
        {enrolledConfig.length > 0 && (
          <div style={{ padding: "10px 16px 14px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {enrolledConfig.map(id => (
                <span key={id} style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "3px 10px", background: "rgba(76,175,125,0.08)", color: "var(--color-green)", border: "1px solid rgba(76,175,125,0.2)", borderRadius: "12px" }}>
                  {BENEFIT_LABELS[id] ?? id}
                </span>
              ))}
            </div>
          </div>
        )}
      </DetailCard>
    </>
  );
}

function PreferencesDetail({ config, onBack }) {
  return (
    <>
      <BackBar onBack={onBack} title="App Preferences" />
      <DetailCard>
        <DetailRow
          label="Paycheck Buffer"
          value={config.bufferEnabled ? `On — $${config.paycheckBuffer}/check` : "Off"}
          valueColor={config.bufferEnabled ? undefined : "var(--color-text-disabled)"}
        />
        <DetailRow
          label="Tax Exempt"
          value={config.taxExemptOptIn ? "Opted in" : "Standard withholding"}
          valueColor={config.taxExemptOptIn ? "var(--color-gold)" : "var(--color-text-secondary)"}
          last
        />
      </DetailCard>
      <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.6" }}>
        Buffer is managed in the Income panel. Tax settings are managed in Account → Tax Plan or via Life Events.
      </div>
    </>
  );
}

// ── TaxPlanDetail ────────────────────────────────────────────────────────────

function TaxPlanDetail({ config, setConfig, onSaveConfig, allWeeks, taxDerived, showExtra, setShowExtra, onBack, isAdmin = false }) {
  const { extraPerCheck, taxedWeekCount, fedLiability, moLiability, ficaTotal, fedWithheldBase, moWithheldBase, fedGap, moGap, totalGap, targetExtraTotal, fedAGI } = taxDerived;
  const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gN = w => computeNet(w, config, extraPerCheck, showExtra);
  const [taxDraft, setTaxDraft] = useState(null);

  const toggleWeek = (idx) => setConfig(prev => {
    const s = new Set(prev.taxedWeeks);
    s.has(idx) ? s.delete(idx) : s.add(idx);
    return { ...prev, taxedWeeks: [...s].sort((a, b) => a - b) };
  });

  const scheduleByMonth = MONTH_FULL.map((name, mi) => {
    const wks = allWeeks.filter(w => w.active && w.weekEnd.getFullYear() === 2026 && w.weekEnd.getMonth() === mi);
    return { name, wks };
  }).filter(m => m.wks.length > 0);

  return (
    <>
      <BackBar onBack={onBack} title="Tax Plan" />

      {/* Extra withholding quick-toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", padding: "10px 14px", background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "6px" }}>
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", flex: 1 }}>Apply extra withholding <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f2(extraPerCheck)}/check</span> on taxed weeks → ~{f(config.targetOwedAtFiling)} owed at filing</div>
        <button onClick={() => setShowExtra(v => !v)} style={{ fontSize: "9px", letterSpacing: "2px", padding: "5px 12px", borderRadius: "12px", cursor: "pointer", background: showExtra ? "rgba(0,200,150,0.10)" : "var(--color-bg-surface)", color: showExtra ? "var(--color-gold)" : "#aaa", border: "1px solid " + (showExtra ? "var(--color-gold)" : "var(--color-border-subtle)"), textTransform: "uppercase", flexShrink: 0 }}>{showExtra ? "ON" : "OFF"}</button>
      </div>

      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "10px" }}>
          <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1 }}>Tax Strategy & Planning</div>
          {taxDraft === null ? (
            <button onClick={() => setTaxDraft({
              fedStdDeduction: config.fedStdDeduction,
              moFlatRate: config.moFlatRate,
              targetOwedAtFiling: config.targetOwedAtFiling,
              firstActiveIdx: config.firstActiveIdx,
            })} style={{ background: "var(--color-gold)", color: "var(--color-bg-base)", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>Edit Tax Plan</button>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => { const nc = { ...config, ...taxDraft }; setConfig(nc); onSaveConfig?.(nc); setTaxDraft(null); }} style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontWeight: "bold" }}>Save</button>
              <button onClick={() => setTaxDraft(null)} style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", padding: "6px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
            </div>
          )}
        </div>

        {taxDraft === null ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
            {[{ l: "Federal Std Deduction", v: f(config.fedStdDeduction) }, ...(config.userState ? [] : [{ l: "State Rate (fallback)", v: `${(config.moFlatRate * 100).toFixed(1)}%` }]), { l: "Target Owed at Filing", v: f(config.targetOwedAtFiling) }, { l: "First Active Week Index", v: `idx ${config.firstActiveIdx}` }].map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}><span style={{ color: "#777" }}>{r.l}</span><span style={{ fontWeight: "bold", color: "var(--color-text-primary)" }}>{r.v}</span></div>)}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div><label style={lS}>Federal Std Deduction ($)</label><input type="number" step="100" value={taxDraft.fedStdDeduction} onChange={e => setTaxDraft(v => ({ ...v, fedStdDeduction: parseFloat(e.target.value) || 0 }))} style={iS} /></div>
            {!config.userState && <div><label style={lS}>State Rate (fallback)</label><input type="number" step="0.001" value={taxDraft.moFlatRate} onChange={e => setTaxDraft(v => ({ ...v, moFlatRate: parseFloat(e.target.value) || 0 }))} style={iS} /></div>}
            <div><label style={lS}>Target Owed at Filing ($)</label><input type="number" step="100" value={taxDraft.targetOwedAtFiling} onChange={e => setTaxDraft(v => ({ ...v, targetOwedAtFiling: parseFloat(e.target.value) || 0 }))} style={iS} /></div>
            <div><label style={lS}>First Active Week Index</label><input type="number" step="1" value={taxDraft.firstActiveIdx} onChange={e => setTaxDraft(v => ({ ...v, firstActiveIdx: parseFloat(e.target.value) || 0 }))} style={iS} /></div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "12px", marginBottom: "20px" }}>
        <Card label="Full Year Fed Liability" val={f(fedLiability)} rawVal={fedLiability} sub={`On ${f(fedAGI)} AGI`} color="var(--color-red)" size="20px" />
        <Card label="Full Year MO Liability" val={f(moLiability)} rawVal={moLiability} sub="4.7% flat" color="var(--color-gold)" size="20px" />
        <Card label="FICA (Always Paid)" val={f(ficaTotal)} rawVal={ficaTotal} sub="7.65% every check" color="#888" size="20px" />
      </div>

      {/* Tax gap analysis */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1, marginBottom: "12px" }}>Tax Gap Analysis</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
          {[{ l: "Fed withheld (taxed weeks)", v: f(fedWithheldBase), c: "var(--color-green)" }, { l: "MO withheld (taxed weeks)", v: f(moWithheldBase), c: "var(--color-green)" }, { l: "Federal gap", v: f(fedGap), c: "var(--color-red)" }, { l: "Missouri gap", v: f(moGap), c: "var(--color-red)" }, { l: "Total income tax gap", v: f(totalGap), c: "var(--color-red)" }, { l: "Target owed at filing", v: f(config.targetOwedAtFiling), c: "var(--color-gold)" }].map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}><span style={{ color: "#777" }}>{r.l}</span><span style={{ fontWeight: "bold", color: r.c }}>{r.v}</span></div>)}
        </div>
      </div>

      {/* Extra withholding plan */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-accent-primary)", borderRadius: "8px", padding: "20px", marginBottom: "28px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1, marginBottom: "12px" }}>Extra Withholding Plan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "12px", marginBottom: "16px" }}>
          {[{ l: "Extra Needed", v: f(targetExtraTotal), c: "var(--color-red)" }, { l: "Taxed Checks", v: taxedWeekCount, c: "var(--color-text-primary)" }, { l: "Extra Per Check", v: f2(extraPerCheck), c: "var(--color-gold)" }].map(c => <div key={c.l} style={{ textAlign: "center", padding: "12px", background: "var(--color-bg-base)", borderRadius: "6px" }}><div style={{ fontSize: "9px", letterSpacing: "2px", color: "#aaa", textTransform: "uppercase", marginBottom: "6px" }}>{c.l}</div><div style={{ fontSize: "20px", fontWeight: "bold", color: c.c }}>{c.v}</div></div>)}
        </div>
        <div style={{ fontSize: "11px", color: "#aaa", lineHeight: "1.8" }}>Add <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f2(extraPerCheck)}</span> extra federal withholding on each of your <span style={{ color: "var(--color-gold)" }}>{taxedWeekCount} taxed checks</span>.</div>
      </div>

      {/* Per-week toggle schedule */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ fontSize: "16px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.2px", lineHeight: 1 }}>Weekly Tax Schedule</div>
        <div style={{ display: "flex", gap: "10px", fontSize: "10px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "#7a8bbf", display: "inline-block" }} />Taxed weeks: <strong style={{ color: "var(--color-red)" }}>{config.taxedWeeks.length}</strong></span>
          <span style={{ display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "var(--color-green)", display: "inline-block" }} />Exempt weeks: <strong style={{ color: "var(--color-green)" }}>{allWeeks.filter(w => w.active).length - config.taxedWeeks.length}</strong></span>
        </div>
      </div>

      {scheduleByMonth.map(m => <div key={m.name} style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "8px" }}>{m.name.slice(0, 3)}</div>
        {m.wks.map(w => {
          const taxed = config.taxedWeeks.includes(w.idx);
          return <div key={w.idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--color-bg-surface)", border: `1px solid ${taxed ? "#7a8bbf22" : "rgba(76,175,125,0.13)"}`, borderRadius: "6px", marginBottom: "6px" }}>
            <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "bold" }}>Ends {w.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{formatRotationDisplay(w, { isAdmin })} · {w.totalHours}h · idx {w.idx}{w.has401k ? " · 401k✓" : ""}</div>
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>{f2(w.grossPay)} gross</div>
                <div style={{ fontSize: "11px", color: taxed ? "var(--color-text-primary)" : "var(--color-green)" }}>{f2(gN(w))} net</div>
              </div>
            </div>
            <div style={{ display: "flex", background: "var(--color-bg-base)", border: "1px solid #2a2a2a", borderRadius: "5px", overflow: "hidden" }}>
              <button onClick={() => !taxed && toggleWeek(w.idx)} style={{ padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", border: "none", cursor: taxed ? "default" : "pointer", background: taxed ? "#1e1e3a" : "transparent", color: taxed ? "#7a8bbf" : "var(--color-border-subtle)", fontWeight: taxed ? "bold" : "normal", transition: "all 0.12s" }}>Taxed</button>
              <div style={{ width: "1px", background: "var(--color-border-subtle)" }} />
              <button onClick={() => taxed && toggleWeek(w.idx)} style={{ padding: "5px 12px", fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", border: "none", cursor: !taxed ? "default" : "pointer", background: !taxed ? "#1e4a30" : "transparent", color: !taxed ? "var(--color-green)" : "var(--color-border-subtle)", fontWeight: !taxed ? "bold" : "normal", transition: "all 0.12s" }}>Exempt</button>
            </div>
          </div>;
        })}
      </div>)}
      <div style={{ padding: "12px", background: "var(--color-bg-surface)", borderRadius: "6px", fontSize: "10px", color: "#444", lineHeight: "1.9" }}>
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
    <button
      onClick={onPress}
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
        {summary && <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</div>}
      </div>
      <span style={{ fontSize: "18px", color: "#555", marginLeft: "12px", lineHeight: 1 }}>›</span>
    </button>
  );
}

// ── ProfilePanel ────────────────────────────────────────────────────────────

export function ProfilePanel({ authedUser, config, setConfig, saveConfigNow, allWeeks, taxDerived, showExtra, setShowExtra, isAdmin }) {
  const [activeSection, setActiveSection] = useState(null);

  const isDHL     = config.employerPreset === "DHL";
  const employer  = isDHL ? "DHL / P&G" : (config.employerPreset || "Independent");
  const has401k   = config.k401Rate > 0;
  const enrolled  = Array.isArray(config.selectedBenefits) ? config.selectedBenefits : [];
  const matchRate = isDHL ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);

  // Sub-view routing
  if (activeSection === "account") {
    return <AccountDetail authedUser={authedUser} config={config} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "employment") {
    return <EmploymentDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "pay") {
    return <PayDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "retirement") {
    return <BenefitsDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "preferences") {
    return <PreferencesDetail config={config} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "taxplan") {
    return <TaxPlanDetail config={config} setConfig={setConfig} onSaveConfig={saveConfigNow} allWeeks={allWeeks} taxDerived={taxDerived} showExtra={showExtra} setShowExtra={setShowExtra} onBack={() => setActiveSection(null)} isAdmin={isAdmin} />;
  }

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "520px" }}>
      <PanelHero eyebrow="Authority Finance">Account</PanelHero>

      {/* Work & Pay group */}
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px", paddingLeft: "4px" }}>Work & Pay</div>
      <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", overflow: "hidden", marginBottom: "20px" }}>
        <ListRow
          label="Employment"
          summary={`${employer}${config.startDate ? ` · Started ${fmt(config.startDate)}` : " · Start date not set"}`}
          onPress={() => setActiveSection("employment")}
        />
        <ListRow
          label="Pay Structure"
          summary={`$${config.baseRate}/hr${config.shiftHours ? ` · ${config.shiftHours}h shifts` : ""}`}
          onPress={() => setActiveSection("pay")}
        />
        <ListRow
          label="Retirement & Benefits"
          summary={has401k ? `401k ${(config.k401Rate * 100).toFixed(0)}% + ${(matchRate * 100).toFixed(1)}% match${enrolled.length ? ` · ${enrolled.length} benefit${enrolled.length !== 1 ? "s" : ""}` : ""}` : "No 401k enrolled"}
          onPress={() => setActiveSection("retirement")}
          last
        />
      </div>

      {/* App group */}
      <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px", paddingLeft: "4px" }}>App</div>
      <div style={{ background: "var(--color-bg-surface)", borderRadius: "12px", border: "1px solid var(--color-border-subtle)", overflow: "hidden", marginBottom: "20px" }}>
        <ListRow
          label="Account"
          summary={authedUser?.email ?? "—"}
          onPress={() => setActiveSection("account")}
        />
        <ListRow
          label="App Preferences"
          summary={config.bufferEnabled ? `Buffer $${config.paycheckBuffer}/check · ${config.taxExemptOptIn ? "Tax exempt on" : "Standard tax"}` : `Buffer off · ${config.taxExemptOptIn ? "Tax exempt on" : "Standard tax"}`}
          onPress={() => setActiveSection("preferences")}
          last={!isAdmin}
        />
        {isAdmin && (
          <ListRow
            label="Tax Plan"
            summary={`${config.taxedWeeks?.length ?? 0} taxed weeks · target $${config.targetOwedAtFiling} owed`}
            onPress={() => setActiveSection("taxplan")}
            last
          />
        )}
      </div>

    </div>
  );
}
