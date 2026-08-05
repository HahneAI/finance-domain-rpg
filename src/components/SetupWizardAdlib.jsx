import { useState } from "react";
import { Pressable, StepSlide } from "./ui.jsx";
import { DHL_PRESET } from "../constants/config.js";

// ─────────────────────────────────────────────────────────────────────────────
// SetupWizardAdlib.jsx — experimental "fill-in-the-blank" pilot for the first
// two SetupWizard steps (Welcome + Pay Structure). Admin-only preview, gated
// behind the "Ad-Lib Preview" toggle in App.jsx — never shown to real users.
//
// Each page is one big sentence with inline blanks (native <select>/<input>
// styled to sit inline in the text) instead of the usual stacked form fields.
// Reuses the exact same config fields and DHL-preset defaults the real
// SetupWizard.jsx Step0/Step1 apply, so onHandoff can seed the real wizard
// (via its initialStepId prop) for the remaining steps with zero drift
// between the two experiences — same fields, same defaults, just a different
// skin on the first two.
//
// MOCK ONLY — nothing from this preview, including the handed-off real-wizard
// continuation, is ever saved. App.jsx's onComplete for that hand-off skips
// handleWizardComplete entirely (no setConfig, no savePersistedStateNow) as
// long as adlibHandoff is set, so admins can click all the way through to
// tune the feel with zero risk to real account data.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_FONT = {
  fontSize: "26px", lineHeight: 1.7, fontWeight: 600,
  color: "var(--color-text-primary)", fontFamily: "var(--font-display)",
};

function InlineSelect({ value, onChange, options, placeholder = "___" }) {
  const hasValue = value != null && value !== "";
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      style={{
        appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
        display: "inline-block", background: "transparent",
        border: "none",
        borderBottom: hasValue ? "3px solid var(--color-teal)" : "3px dashed var(--color-text-disabled)",
        color: hasValue ? "var(--color-teal)" : "var(--color-text-disabled)",
        font: "inherit", fontWeight: 700, textAlign: "center",
        padding: "0 4px", margin: "0 2px", cursor: "pointer",
      }}
    >
      {!hasValue && <option value="" disabled>{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function InlineNumber({ value, onChange, placeholder = "___", width = "84px" }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <input
      type="number" inputMode="decimal"
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        display: "inline-block", width,
        background: "transparent", border: "none",
        borderBottom: hasValue ? "3px solid var(--color-teal)" : "3px dashed var(--color-text-disabled)",
        color: "var(--color-teal)", font: "inherit", fontWeight: 700,
        textAlign: "center", padding: "0 2px", margin: "0 2px",
      }}
    />
  );
}

// Mirrors real Step1's pickTeam() — same field set/defaults so a handed-off
// wizard resuming at Schedule sees an identical DHL config either way.
function pickTeamPatch(t) {
  const preset = DHL_PRESET.teams[t];
  const d = DHL_PRESET.defaults;
  return {
    dhlTeam: t,
    startingWeekIsLong: preset.startsLong,
    shiftHours: d.shiftHours,
    otThreshold: d.otThreshold,
    otMultiplier: d.otMultiplier,
    scheduleIsVariable: d.scheduleIsVariable,
    payPeriodEndDay: d.payPeriodEndDay,
    bucketStartBalance: d.bucketStartBalance,
    bucketCap: d.bucketCap,
    bucketPayoutRate: d.bucketPayoutRate,
  };
}

// ── Page 0: Welcome / employment status (mirrors real Step0's first-run seed) ──
function WelcomePage({ formData, onChange }) {
  return (
    <p style={BLANK_FONT}>
      Let's set you up. Right now, I am{" "}
      <InlineSelect
        value={formData.startedUnemployed === true ? "unemployed" : formData.startedUnemployed === false ? "employed" : ""}
        onChange={v => onChange({ startedUnemployed: v === "unemployed" })}
        options={[{ value: "employed", label: "employed" }, { value: "unemployed", label: "unemployed" }]}
      />.
    </p>
  );
}

// ── Page 1: Pay Structure (mirrors real Step1's core required fields) ──
function PayStructurePage({ formData, onChange }) {
  // employerPreset is only ever "DHL" | null in this app's real model — null alone
  // can't distinguish "hasn't answered yet" from "explicitly chose someone else",
  // so track which blank the user picked as local UI state (mirrors real Step1's
  // gateTouched flag). The userPaySchedule heuristic below re-derives "OTHER" if
  // this page remounts (e.g. Back then Next again) after it was already answered.
  const [employerChoice, setEmployerChoice] = useState(() =>
    formData.employerPreset === "DHL" ? "DHL" : formData.userPaySchedule ? "OTHER" : ""
  );
  const isEmployerDHL = employerChoice === "DHL";
  const isSalary = formData.userPaySchedule === "salary";

  function setEmployer(v) {
    setEmployerChoice(v);
    if (v === "DHL") {
      onChange({
        employerPreset: "DHL", otThreshold: 40, otMultiplier: 1.5, payPeriodEndDay: 0,
        scheduleIsVariable: true, bucketStartBalance: 64, bucketCap: 128, bucketPayoutRate: 9.825,
        diffRate: formData.diffRate ?? 1.75,
        baseRate: formData.baseRate ?? DHL_PRESET.defaults.baseRate,
        shiftHours: formData.shiftHours ?? DHL_PRESET.defaults.shiftHours,
        userPaySchedule: null, dhlTeam: null,
      });
    } else {
      onChange({ employerPreset: null, userPaySchedule: null, diffRate: 0, scheduleIsVariable: false, baseRate: null, shiftHours: null });
    }
  }

  return (
    <p style={BLANK_FONT}>
      I work for{" "}
      <InlineSelect
        value={employerChoice}
        onChange={setEmployer}
        options={[{ value: "DHL", label: "DHL" }, { value: "OTHER", label: "someone else" }]}
      />.
      {isEmployerDHL && (
        <>
          {" "}I'm on Team{" "}
          <InlineSelect
            value={formData.dhlTeam ?? ""}
            onChange={t => onChange(pickTeamPatch(t))}
            options={[{ value: "A", label: "A" }, { value: "B", label: "B" }]}
          />
          {formData.dhlTeam && (
            <>
              , working the{" "}
              <InlineSelect
                value={formData.dhlNightShift === false ? "morning" : formData.dhlNightShift === true ? "night" : ""}
                onChange={v => onChange({ dhlNightShift: v === "night", nightDiffRate: v === "night" ? 1.50 : 0 })}
                options={[{ value: "night", label: "night" }, { value: "morning", label: "morning" }]}
              />{" "}shift, paid{" "}
              <InlineSelect
                value={formData.userPaySchedule ?? ""}
                onChange={v => onChange({ userPaySchedule: v, annualSalary: null })}
                options={[{ value: "weekly", label: "weekly" }, { value: "salary", label: "every two weeks" }]}
              />.
            </>
          )}
        </>
      )}
      {employerChoice === "OTHER" && (
        <>
          {" "}I get paid{" "}
          <InlineSelect
            value={formData.userPaySchedule ?? ""}
            onChange={v => onChange({ userPaySchedule: v, annualSalary: null })}
            options={[
              { value: "weekly", label: "weekly" },
              { value: "biweekly", label: "every two weeks" },
              { value: "monthly", label: "monthly" },
              { value: "salary", label: "on salary" },
            ]}
          />.
          {formData.userPaySchedule && (isSalary ? (
            <>
              {" "}My salary is ${" "}
              <InlineNumber
                value={formData.annualSalary ?? ""}
                onChange={v => {
                  const sal = v === "" ? null : parseFloat(v);
                  onChange({ annualSalary: sal, baseRate: sal != null ? Math.round((sal / 2080) * 100) / 100 : null, shiftHours: 8 });
                }}
                placeholder="52,000"
              />{" "}a year.
            </>
          ) : (
            <>
              {" "}My rate is ${" "}
              <InlineNumber
                value={formData.baseRate ?? ""}
                onChange={v => onChange({ baseRate: v === "" ? null : parseFloat(v) })}
                placeholder="19.65"
                width="72px"
              />{" "}an hour, and my shifts run{" "}
              <InlineNumber
                value={formData.shiftHours ?? ""}
                onChange={v => onChange({ shiftHours: v === "" ? null : parseFloat(v) })}
                placeholder="10"
                width="52px"
              />{" "}hours.
            </>
          ))}
        </>
      )}
    </p>
  );
}

const PAGES = [
  {
    id: "welcome", title: "Welcome",
    isValid: d => d.startedUnemployed === true || d.startedUnemployed === false,
    Component: WelcomePage,
  },
  {
    id: "pay", title: "Pay Structure",
    isValid: d => {
      if (!d.userPaySchedule) return false;
      if (d.employerPreset === "DHL" && !d.dhlTeam) return false;
      if (d.userPaySchedule === "salary") return (d.annualSalary ?? 0) > 0;
      return (d.baseRate ?? 0) > 0 && (d.shiftHours ?? 0) > 0;
    },
    Component: PayStructurePage,
  },
];

// onHandoff(mergedFormData, initialStepId) — called once the pilot pages are
// answered. initialStepId targets the real SetupWizard's jobless mini-flow
// (id 10) when unemployed, else Schedule (id 2) — see SetupWizard.jsx's
// initialStepId prop.
export function SetupWizardAdlib({ config, onHandoff, onCancel }) {
  const [pageIdx, setPageIdx] = useState(0);
  const [stepDir, setStepDir] = useState(1);
  const [formData, setFormData] = useState({ ...config });

  // Skipping straight to a single-page flow once "unemployed" is chosen —
  // Pay Structure is irrelevant for the jobless mini-flow, same as the real
  // wizard's isFirstRunJobless gate skipping it entirely.
  const activePages = formData.startedUnemployed === true ? [PAGES[0]] : PAGES;
  const current = activePages[pageIdx];
  const isLast = pageIdx === activePages.length - 1;
  const canProceed = current?.isValid(formData) ?? false;
  const progressPct = ((pageIdx + 1) / activePages.length) * 100;

  function update(patch) {
    setFormData(prev => ({ ...prev, ...patch }));
  }

  function handleNext() {
    if (!canProceed) return;
    if (!isLast) { setStepDir(1); setPageIdx(i => i + 1); return; }
    onHandoff(formData, formData.startedUnemployed === true ? 10 : 2);
  }

  function handleBack() {
    if (pageIdx > 0) { setStepDir(-1); setPageIdx(i => i - 1); }
  }

  return (
    <div className="fold-lift" data-fold="entering" style={{
      position: "fixed", inset: 0, background: "var(--color-bg-base)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      paddingLeft: "16px", paddingRight: "16px", zIndex: 100,
    }}>
      <div style={{
        width: "100%", maxWidth: "560px",
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-accent)",
        borderRadius: "20px",
        display: "flex", flexDirection: "column",
        flex: 1, minHeight: 0, maxHeight: "560px",
        overflow: "hidden",
      }}>
        <div style={{ padding: "24px 28px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-teal)" }}>
              Ad-Lib Preview · {pageIdx + 1} of {activePages.length}
            </div>
            <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-warning)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "6px", padding: "2px 8px" }}>
              Admin Only · Not Saved
            </div>
          </div>
          <div style={{ marginTop: "10px", height: "3px", borderRadius: "2px", background: "var(--color-border-subtle)" }}>
            <div style={{ height: "100%", borderRadius: "2px", background: "var(--color-teal)", width: `${progressPct}%`, transition: "width 0.3s ease" }} />
          </div>
        </div>

        <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", display: "flex", alignItems: "center", padding: "28px 32px" }}>
          <StepSlide stepKey={pageIdx} direction={stepDir}>
            {current && <current.Component formData={formData} onChange={update} />}
          </StepSlide>
        </div>

        <div style={{ padding: "14px 24px 20px", flexShrink: 0, display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid var(--color-border-subtle)" }}>
          <Pressable
            onClick={onCancel}
            style={{ marginRight: "auto", background: "var(--color-bg-raised)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
          >
            Exit Preview
          </Pressable>
          {pageIdx > 0 && (
            <Pressable
              onClick={handleBack}
              style={{ background: "var(--color-bg-raised)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "8px 16px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
            >
              Back
            </Pressable>
          )}
          <Pressable
            onClick={handleNext}
            disabled={!canProceed}
            style={{
              background: canProceed ? "var(--color-teal)" : "var(--color-bg-raised)",
              color: canProceed ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 22px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold",
              cursor: canProceed ? "pointer" : "not-allowed",
            }}
          >
            {isLast ? "Continue Setup →" : "Next"}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
