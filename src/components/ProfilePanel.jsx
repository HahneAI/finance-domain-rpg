import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { dhlEmployerMatchRate } from "../lib/finance.js";
import { DHL_PRESET } from "../constants/config.js";
import { iS, lS } from "./ui.jsx";

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

function BenefitsDetail({ config, onBack }) {
  const isDHL     = config.employerPreset === "DHL";
  const has401k   = config.k401Rate > 0;
  const matchRate = isDHL ? dhlEmployerMatchRate(config.k401Rate) : (config.k401MatchRate ?? 0);
  const enrolled  = Array.isArray(config.selectedBenefits) ? config.selectedBenefits : [];

  return (
    <>
      <BackBar onBack={onBack} title="Retirement & Benefits" />
      <DetailCard>
        <DetailRow
          label="401k Employee"
          value={has401k ? `${(config.k401Rate * 100).toFixed(0)}%` : "Not enrolled"}
          valueColor={has401k ? undefined : "var(--color-text-disabled)"}
        />
        {has401k && (
          <DetailRow
            label="Employer Match"
            value={`${(matchRate * 100).toFixed(1)}%${isDHL ? " (tiered)" : ""}`}
            valueColor="var(--color-green)"
          />
        )}
        {config.k401StartDate && (
          <DetailRow label="401k Active Since" value={fmt(config.k401StartDate)} />
        )}
        {config.benefitsStartDate && (
          <DetailRow label="Benefits Start" value={fmt(config.benefitsStartDate)} />
        )}
        <DetailRow
          label="Benefits"
          value={enrolled.length > 0 ? `${enrolled.length} enrolled` : "None enrolled"}
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

export function ProfilePanel({ authedUser, config, setConfig }) {
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
    return <BenefitsDetail config={config} onBack={() => setActiveSection(null)} />;
  }
  if (activeSection === "preferences") {
    return <PreferencesDetail config={config} onBack={() => setActiveSection(null)} />;
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
          last
        />
      </div>

    </div>
  );
}
