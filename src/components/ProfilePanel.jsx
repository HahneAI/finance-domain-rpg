import { supabase } from "../lib/supabase.js";
import { dhlEmployerMatchRate } from "../lib/finance.js";
import { SH } from "./ui.jsx";

// Human-readable labels for benefit IDs stored in config.selectedBenefits
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

// Simple label + value row used throughout the panel
function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1a1a1a" }}>
      <span style={{ fontSize: "11px", letterSpacing: "1px", color: "var(--color-text-secondary)", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: "bold", color: valueColor || "var(--color-text-primary)", textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "28px" }}>
      <SH>{title}</SH>
      {children}
    </div>
  );
}

export function ProfilePanel({ authedUser, config }) {
  const isDHL    = config.employerPreset === "DHL";
  const employer = isDHL ? "DHL / P&G" : (config.employerPreset || "Independent");

  // 401k
  const has401k    = config.k401Rate > 0;
  const matchRate  = isDHL
    ? dhlEmployerMatchRate(config.k401Rate)
    : (config.k401MatchRate ?? 0);
  const k401Label  = has401k
    ? `${(config.k401Rate * 100).toFixed(0)}% employee · ${(matchRate * 100).toFixed(1)}% match`
    : "Not enrolled";

  // Schedule
  const scheduleLabel = config.scheduleIsVariable
    ? "Variable hours"
    : `${config.standardWeeklyHours || 40} hrs / week`;

  // Benefits
  const enrolled = Array.isArray(config.selectedBenefits) ? config.selectedBenefits : [];
  const hasBenefits = enrolled.length > 0;

  // Setup badge
  const setupColor  = config.setupComplete ? "var(--color-green)" : "var(--color-gold)";
  const setupBg     = config.setupComplete ? "rgba(76,175,125,0.12)" : "rgba(201,168,76,0.10)";
  const setupBorder = config.setupComplete ? "rgba(76,175,125,0.3)" : "rgba(201,168,76,0.3)";
  const setupLabel  = config.setupComplete ? "Setup complete" : "Setup pending";

  return (
    <div style={{ maxWidth: "520px" }}>

      {/* ── Account ── */}
      <Section title="Account">
        <Row label="Email" value={authedUser?.email ?? "—"} />
        <Row label="Setup status" value={
          <span style={{ fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", padding: "3px 10px", background: setupBg, color: setupColor, border: `1px solid ${setupBorder}`, borderRadius: "12px" }}>
            {setupLabel}
          </span>
        } />
        <div style={{ marginTop: "16px" }}>
          <button
            onClick={async () => { await supabase.auth.signOut(); }}
            style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid #333", borderRadius: "12px", padding: "8px 18px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
          >
            Sign Out
          </button>
        </div>
      </Section>

      {/* ── Employment ── */}
      <Section title="Employment">
        <Row label="Employer"   value={employer} />
        <Row label="State"      value={config.userState || "—"} />
        <Row label="Start date" value={fmt(config.startDate) || "Not set"} valueColor={config.startDate ? undefined : "var(--color-text-disabled)"} />
        {isDHL && config.dhlTeam && (
          <Row label="DHL Team" value={`Team ${config.dhlTeam}`} />
        )}
      </Section>

      {/* ── Pay Structure ── */}
      <Section title="Pay Structure">
        <Row label="Base rate" value={`$${config.baseRate}/hr`} valueColor="var(--color-gold)" />
        {config.shiftHours > 0 && (
          <Row label="Shift length" value={`${config.shiftHours}h shifts`} />
        )}
        <Row label="Schedule" value={scheduleLabel} />
        {config.diffRate > 0 && (
          <Row label="Weekend differential" value={`+$${config.diffRate}/hr`} />
        )}
        {isDHL && config.dhlNightShift && config.nightDiffRate > 0 && (
          <Row label="Night differential" value={`+$${config.nightDiffRate}/hr`} />
        )}
      </Section>

      {/* ── Retirement & Benefits ── */}
      <Section title="Retirement & Benefits">
        <Row
          label="401k"
          value={k401Label}
          valueColor={has401k ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        />
        {config.k401StartDate && (
          <Row label="401k active since" value={fmt(config.k401StartDate)} />
        )}
        {hasBenefits && (
          <>
            {config.benefitsStartDate && (
              <Row label="Benefits start" value={fmt(config.benefitsStartDate)} />
            )}
            <div style={{ paddingTop: "10px", paddingBottom: "4px" }}>
              <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase", marginBottom: "8px" }}>Enrolled</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {enrolled.map(id => (
                  <span key={id} style={{ fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase", padding: "3px 10px", background: "rgba(76,175,125,0.08)", color: "var(--color-green)", border: "1px solid rgba(76,175,125,0.2)", borderRadius: "12px" }}>
                    {BENEFIT_LABELS[id] ?? id}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
        {!hasBenefits && (
          <Row label="Benefits" value="None enrolled" valueColor="var(--color-text-disabled)" />
        )}
      </Section>

      {/* ── App Preferences ── */}
      <Section title="App Preferences">
        <Row
          label="Paycheck buffer"
          value={config.bufferEnabled ? `On — $${config.paycheckBuffer}/check` : "Off"}
          valueColor={config.bufferEnabled ? "var(--color-text-primary)" : "var(--color-text-disabled)"}
        />
        <Row
          label="Tax exempt"
          value={config.taxExemptOptIn ? "Opted in" : "Standard withholding"}
          valueColor={config.taxExemptOptIn ? "var(--color-gold)" : "var(--color-text-secondary)"}
        />
      </Section>

    </div>
  );
}
