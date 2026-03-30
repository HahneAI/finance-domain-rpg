import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { dhlEmployerMatchRate, computeNet } from "../lib/finance.js";
import { DHL_PRESET, MONTH_FULL } from "../constants/config.js";
import { iS, lS, Card, SH } from "./ui.jsx";

const BENEFIT_LABELS = {
  health: "Health / Medical",
  dental: "Dental",
  vision: "Vision",
  ltd:    "LTD",
  std:    "STD",
  life:   "Life / AD&D",
  hsa:    "HSA",
  fsa:    "FSA",
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
  const setupBg     = config.setupComplete ? "rgba(76,175,125,0.12)"        : "rgba(201,168,76,0.10)";
  const setupBorder = config.setupComplete ? "rgba(76,175,125,0.3)"         : "rgba(201,168,76,0.3)";
  const setupLabel  = config.setupComplete ? "Setup complete"               : "Setup pending";

  const [showPwForm, setShowPwForm] = useState(false);
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [pwError, setPwError]       = useState(null);
  const [pwSaved, setPwSaved]       = useState(false);
  const [pwLoading, setPwLoading]   = useState(false);

  async function handleChangePw(e) {
    e.preventDefault();
    setPwError(null);
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    if (newPw.length < 6)    { setPwError("Must be at least 6 characters."); return; }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);
    if (error) { setPwError(error.message); return; }
    setPwSaved(true);
    setNewPw(""); setConfirmPw("");
    setTimeout(() => { setPwSaved(false); setShowPwForm(false); }, 2000);
  }

  return (
    <>
      <BackBar onBack={onBack} title="Account" />
      <DetailCard>
        <DetailRow label="Email" value={authedUser?.email ?? "—"} />
        <DetailRow label="Setup" last value={
          <span style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", padding: "3px 10px", background: setupBg, color: setupColor, border: `1px solid ${setupBorder}`, borderRadius: "12px" }}>
            {setupLabel}
          </span>
        } />
      </DetailCard>

      {/* Change password */}
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
              <label style={lS}>New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="At least 6 characters" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={lS}>Confirm Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" required autoComplete="new-password" style={{ ...iS, borderRadius: "8px" }} />
            </div>
            {pwError && (
              <div style={{ fontSize: "11px", color: "var(--color-red)", padding: "8px 12px", background: "rgba(224,92,92,0.08)", border: "1px solid rgba(224,92,92,0.25)", borderRadius: "6px" }}>{pwError}</div>
            )}
            {pwSaved && (
              <div style={{ fontSize: "11px", color: "var(--color-green)" }}>Password updated.</div>
            )}
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={() => { setShowPwForm(false); setPwError(null); setNewPw(""); setConfirmPw(""); }} style={{ flex: 1, padding: "9px 0", background: "var(--color-bg-raised)", border: "1px solid #333", borderRadius: "8px", color: "var(--color-text-secondary)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={pwLoading} style={{ flex: 1, padding: "9px 0", background: "var(--color-green)", border: "none", borderRadius: "8px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: pwLoading ? "default" : "pointer" }}>{pwLoading ? "..." : "Save"}</button>
            </div>
          </form>
        )}
      </DetailCard>

      <button
        onClick={async () => { await supabase.auth.signOut(); }}
        style={{ width: "100%", padding: "14px 16px", background: "var(--color-bg-surface)", border: "1px solid rgba(224,92,92,0.3)", borderRadius: "12px", color: "var(--color-red)", fontSize: "13px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign Out
      </button>
    </>
  );
}

function EmploymentDetail({ config, setConfig, onBack }) {
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
    setConfig(prev => {
      const next = { ...prev };
      if (startDateDirty && startDate) {
        next.startDate = startDate;
      }
      if (teamDirty && dhlTeam) {
        next.dhlTeam = dhlTeam;
        // Re-derive startingWeekIsLong from the new team unless user has a custom schedule
        if (!prev.dhlCustomSchedule) {
          next.startingWeekIsLong = DHL_PRESET.teams[dhlTeam]?.startsLong ?? prev.startingWeekIsLong;
        }
      }
      return next;
    });
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
                    background: dhlTeam === t ? "rgba(201,168,76,0.12)" : "var(--color-bg-base)",
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

function PayDetail({ config, onBack }) {
  const isDHL = config.employerPreset === "DHL";
  const scheduleLabel = config.scheduleIsVariable
    ? "Variable hours"
    : `${config.standardWeeklyHours || 40} hrs / week`;

  return (
    <>
      <BackBar onBack={onBack} title="Pay Structure" />
      <DetailCard>
        <DetailRow label="Base Rate"      value={`$${config.baseRate}/hr`}  valueColor="var(--color-gold)" />
        {config.shiftHours > 0 && <DetailRow label="Shift Length" value={`${config.shiftHours}h`} />}
        <DetailRow label="Schedule" value={scheduleLabel} />
        {config.diffRate > 0 && <DetailRow label="Weekend Diff" value={`+$${config.diffRate}/hr`} />}
        {isDHL && config.dhlNightShift && config.nightDiffRate > 0 && (
          <DetailRow label="Night Diff" value={`+$${config.nightDiffRate}/hr`} />
        )}
        <DetailRow label="OT Threshold"   value={`${config.otThreshold} hrs/wk`} />
        <DetailRow label="OT Multiplier"  value={`${config.otMultiplier}×`} last />
      </DetailCard>
      <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.6" }}>
        To edit pay rates, use the Income panel's Config tab or re-run your setup via Life Events.
      </div>
    </>
  );
}

function BenefitsDetail({ config, setConfig, onBack }) {
  const isDHL     = config.employerPreset === "DHL";
  const has401k   = config.k401Rate > 0;
  const matchRate = isDHL ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);
  const enrolled  = Array.isArray(config.selectedBenefits) ? config.selectedBenefits : [];

  const [editing, setEditing]   = useState(false);
  const [k401Rate, setK401Rate] = useState(String(config.k401Rate ?? ""));
  const [k401Match, setK401Match] = useState(String(config.k401MatchRate ?? ""));
  const [k401Start, setK401Start] = useState(config.k401StartDate ?? "");

  function handleSave() {
    setConfig(prev => ({
      ...prev,
      k401Rate:      parseFloat(k401Rate)  || 0,
      k401MatchRate: parseFloat(k401Match) || 0,
      k401StartDate: k401Start || prev.k401StartDate,
    }));
    setEditing(false);
  }

  return (
    <>
      <BackBar onBack={onBack} title="Retirement & Benefits" />

      {/* 401k section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <div style={{ fontSize: "10px", letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", paddingLeft: "4px" }}>401k</div>
        {!editing && (
          <button onClick={() => setEditing(true)} style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", background: "transparent", color: "var(--color-gold)", border: "1px solid rgba(201,168,76,0.4)", borderRadius: "8px", padding: "4px 10px", cursor: "pointer" }}>Edit</button>
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
          <DetailRow label="Active Since" value={config.k401StartDate ? fmt(config.k401StartDate) : "—"} last />
        </DetailCard>
      ) : (
        <DetailCard>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
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
          value={enrolled.length > 0 ? `${enrolled.length} plan${enrolled.length !== 1 ? "s" : ""}` : "None enrolled"}
          valueColor={enrolled.length > 0 ? undefined : "var(--color-text-disabled)"}
          last={enrolled.length === 0}
        />
        {enrolled.length > 0 && (
          <div style={{ padding: "10px 16px 14px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {enrolled.map(id => (
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
        Buffer and tax settings can be adjusted in the Income panel or via Life Events.
      </div>
    </>
  );
}

// ── TaxPlanDetail ────────────────────────────────────────────────────────────

function TaxPlanDetail({ config, setConfig, allWeeks, taxDerived, showExtra, setShowExtra, onBack }) {
  const { extraPerCheck, taxedWeekCount, fedLiability, moLiability, ficaTotal, fedWithheldBase, moWithheldBase, fedGap, moGap, totalGap, targetExtraTotal, fedAGI } = taxDerived;
  const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gN = w => computeNet(w, config, extraPerCheck, showExtra);

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
        <button onClick={() => setShowExtra(v => !v)} style={{ fontSize: "9px", letterSpacing: "2px", padding: "5px 12px", borderRadius: "12px", cursor: "pointer", background: showExtra ? "#3a3210" : "var(--color-bg-surface)", color: showExtra ? "var(--color-gold)" : "#aaa", border: "1px solid " + (showExtra ? "var(--color-gold)" : "var(--color-border-subtle)"), textTransform: "uppercase", flexShrink: 0 }}>{showExtra ? "ON" : "OFF"}</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "12px", marginBottom: "20px" }}>
        <Card label="Full Year Fed Liability" val={f(fedLiability)} sub={`On ${f(fedAGI)} AGI`} color="var(--color-red)" size="20px" />
        <Card label="Full Year MO Liability" val={f(moLiability)} sub="4.7% flat" color="var(--color-gold)" size="20px" />
        <Card label="FICA (Always Paid)" val={f(ficaTotal)} sub="7.65% every check" color="#888" size="20px" />
      </div>

      {/* Tax gap analysis */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "20px", marginBottom: "16px" }}>
        <SH>Tax Gap Analysis</SH>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
          {[{ l: "Fed withheld (taxed weeks)", v: f(fedWithheldBase), c: "var(--color-green)" }, { l: "MO withheld (taxed weeks)", v: f(moWithheldBase), c: "var(--color-green)" }, { l: "Federal gap", v: f(fedGap), c: "var(--color-red)" }, { l: "Missouri gap", v: f(moGap), c: "var(--color-red)" }, { l: "Total income tax gap", v: f(totalGap), c: "var(--color-red)" }, { l: "Target owed at filing", v: f(config.targetOwedAtFiling), c: "var(--color-gold)" }].map(r => <div key={r.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #222" }}><span style={{ color: "#777" }}>{r.l}</span><span style={{ fontWeight: "bold", color: r.c }}>{r.v}</span></div>)}
        </div>
      </div>

      {/* Extra withholding plan */}
      <div style={{ background: "var(--color-bg-surface)", border: "1px solid #c8a84b", borderRadius: "8px", padding: "20px", marginBottom: "28px" }}>
        <SH>Extra Withholding Plan</SH>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: "12px", marginBottom: "16px" }}>
          {[{ l: "Extra Needed", v: f(targetExtraTotal), c: "var(--color-red)" }, { l: "Taxed Checks", v: taxedWeekCount, c: "var(--color-text-primary)" }, { l: "Extra Per Check", v: f2(extraPerCheck), c: "var(--color-gold)" }].map(c => <div key={c.l} style={{ textAlign: "center", padding: "12px", background: "var(--color-bg-base)", borderRadius: "6px" }}><div style={{ fontSize: "9px", letterSpacing: "2px", color: "#aaa", textTransform: "uppercase", marginBottom: "6px" }}>{c.l}</div><div style={{ fontSize: "20px", fontWeight: "bold", color: c.c }}>{c.v}</div></div>)}
        </div>
        <div style={{ fontSize: "11px", color: "#aaa", lineHeight: "1.8" }}>Add <span style={{ color: "var(--color-gold)", fontWeight: "bold" }}>{f2(extraPerCheck)}</span> extra federal withholding on each of your <span style={{ color: "var(--color-gold)" }}>{taxedWeekCount} taxed checks</span>.</div>
      </div>

      {/* Per-week toggle schedule */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <SH>Weekly Tax Schedule</SH>
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
                <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>{w.rotation} · {w.totalHours}h · idx {w.idx}{w.has401k ? " · 401k✓" : ""}</div>
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

export function ProfilePanel({ authedUser, config, setConfig, allWeeks, taxDerived, showExtra, setShowExtra, isAdmin }) {
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
    return <EmploymentDetail config={config} setConfig={setConfig} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "pay") {
    return <PayDetail config={config} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "retirement") {
    return <BenefitsDetail config={config} setConfig={setConfig} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "preferences") {
    return <PreferencesDetail config={config} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "taxplan") {
    return <TaxPlanDetail config={config} setConfig={setConfig} allWeeks={allWeeks} taxDerived={taxDerived} showExtra={showExtra} setShowExtra={setShowExtra} onBack={() => setActiveSection(null)} />;
  }

  // ── Main list ─────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: "520px" }}>

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
