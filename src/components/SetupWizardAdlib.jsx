import { useState, useEffect } from "react";
import { Pressable, StepSlide } from "./ui.jsx";
import { DHL_PRESET, BENEFIT_OPTIONS, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { STATE_TAX_TABLE, STATE_NAMES } from "../constants/stateTaxTable.js";
import { FISCAL_WEEKS_PER_YEAR, dateToWeekIdx } from "../lib/fiscalWeek.js";
import { estimateWeeklyNet } from "../lib/finance.js";
import { finalizeWizardConfig, FREEDOM_ALLOWANCE_MAX } from "../lib/wizardComplete.js";
// LIFE_EVENTS/DIFF_FIELDS/StructureChangeDiff are shared with SetupWizard.jsx rather than
// duplicated (drift-app-warden §7 F7's "these two lists must never diverge" note — DIFF_FIELDS
// specifically) — see drift-app-warden §7 F140.
import { LIFE_EVENTS, StructureChangeDiff } from "./SetupWizard.jsx";

// ─────────────────────────────────────────────────────────────────────────────
// SetupWizardAdlib.jsx — the REAL production wizard for first-run onboarding
// AND (as of drift-app-warden §7 F139) the `lost_job`/`commission_job`
// life-event re-entry paths: Welcome + Pay Structure collapsed onto one
// cascading page, then Schedule, Deductions, Tax Rates, and (first-run only)
// Wrap Up each as their own page, all in the same "fill-in-the-blank"
// mad-libs style. Mounted by App.jsx whenever `wizardEntry === false`
// (first-run, `lifeEvent={null}`) with no in-progress jobless hand-off
// (`adlibHandoff`), OR `wizardEntry === "lost_job" | "commission_job"`
// (`lifeEvent` threaded through as that same string) — see App.jsx's wizard
// mount block. `SetupWizard.jsx` stays mounted, completely unchanged, for
// `structure_change` and `changed_jobs` re-entry (a later round) and for the
// jobless mini-flow continuation (`initialStepId`).
//
// Each page is one continuous mad-libs sentence with inline blanks (native
// <select>/<input> styled to sit inline in the text). Within a page, each new
// clause rolls in — a crisp stepped typewriter reveal on the text, then a
// quick fade-in on the blank that follows it — the moment the answer it
// depends on is given. Between pages it's a real Next/Back page transition
// (StepSlide), same as the real wizard. Reuses the exact same config fields
// and DHL-preset defaults the real SetupWizard.jsx Step0/Step1/Step2 apply,
// so the jobless mini-flow hand-off (via `initialStepId`) has zero drift
// between the two experiences.
//
// `lifeEvent` prop (default `null`) — see the exported component's own header
// comment just above its definition for the full contract. In short: `null`
// keeps every existing first-run behavior unchanged (BLANK_PAY_FIELDS, the
// employment-status question, all five pages); `"lost_job"`/`"commission_job"`
// pre-fill formData from the real account config instead of blanking it, skip
// the employment-status question entirely, and drop Wrap Up from the page set
// (both paths commit through `finalizeWizardConfig()` at the end of Tax Rates
// instead) — mirrors real `STEP_DEFS`' `showIf`/`isValid` gating for those two
// life events exactly (drift-app-warden §7.3's gate matrix).
//
// Save path: on a finish (Wrap Up for first-run, Tax Rates for lost_job/
// commission_job), `formData` is run through the same `finalizeWizardConfig()`
// helper (`src/lib/wizardComplete.js`) real `SetupWizard.jsx`'s
// `handleComplete()` calls, then handed to the `onComplete(finalConfig)` prop
// — App.jsx wires that straight to `handleWizardComplete()`, the same
// function every real SetupWizard completion uses (eager save, configHistory
// tagging, food-seed logic). The jobless mini-flow still hands off into the
// real `SetupWizard` at `initialStepId: 10`, which owns its own
// `handleComplete()` call.
//
// Investor first-run support (`isInvestor` prop) mirrors `SetupWizard.jsx`
// field-for-field: Welcome reads `formData.investorName`, "Do you work for
// DHL?" is hidden entirely (investors are always base users).
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_FONT = {
  fontSize: "clamp(18px, 4.2vw, 26px)", lineHeight: 1.9, fontWeight: 600,
  color: "var(--color-text-primary)", fontFamily: "var(--font-display)",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Mirrors SetupWizard.jsx's own local OT_MULTIPLIERS exactly (not exported there, so
// duplicated here rather than importing — same reasoning as the rest of this file's
// field/behavior mirrors, kept in sync manually per drift-app-warden §7's own convention).
const OT_MULTIPLIERS = [1.5, 2];

const cardShellStyle = {
  border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
  background: "var(--color-bg-raised)", overflow: "hidden", marginTop: "14px",
};
const cardHeaderStyle = {
  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
  gap: "12px", padding: "12px 14px", background: "transparent", border: "none",
  cursor: "pointer", textAlign: "left",
};
const cardLabelStyle = {
  letterSpacing: "1px", textTransform: "uppercase",
  color: "var(--color-text-secondary)", marginBottom: "6px",
};

// Typing speed for the stepped typewriter reveal — clamped so a short word
// doesn't feel instant and a long clause doesn't feel sluggish.
function typeDuration(text) {
  return Math.min(Math.max(text.length * 0.014, 0.18), 0.7);
}

// Types `text` in via a stepped clip-path reveal (adlibType, index.css — discrete
// jumps, not a smooth wipe, for a "crisp" typewriter look) while fading + lifting
// in at the same time, so a newly-revealed clause both rolls onto the page and
// types itself out. All TypedText in the same clause share delay=0 (the default)
// since they mount together the instant the clause becomes eligible — only the
// blank a given text introduces waits on that text's own duration (see FadeIn).
//
// Applied PER WORD, not to the whole clause as one inline-block span — a single
// inline-block with white-space:"pre" cannot wrap internally, so a long clause
// (e.g. Deductions' "Does my employer track attendance…?") overflowed
// horizontally on narrow viewports (§19.1.F, drift-app-warden §7 F129). Each
// word gets its own small inline-block (never itself long enough to need
// wrapping) separated by an ordinary breakable space, so the browser wraps
// between words exactly like normal text — while each word still steps in via
// the same adlibType keyframe, staggered so the words appear to type in
// left-to-right, in order. Total duration across all words equals
// typeDuration(text), so external delay math (`typeDuration(clauseText)` used
// by a following FadeIn) is unchanged — callers don't need to know this is
// word-chunked internally.
function TypedText({ text, delay = 0 }) {
  const totalDuration = typeDuration(text);
  const totalChars = Math.max(text.length, 1);
  const words = text.split(" ");
  // Build (chunk, duration, startDelay) tuples without mutating a shared accumulator
  // during the render-time .map — a bare running-total variable reassigned inside a
  // map callback is the exact "mutation after render" shape the React Compiler
  // flags (drift-app-warden §12.4's known trigger class), so this reduces into an
  // immutable array first instead.
  const chunks = words.reduce((acc, word, i) => {
    const chunk = i === words.length - 1 ? word : `${word} `;
    const chunkDur = Math.max((chunk.length / totalChars) * totalDuration, 0.04);
    const prevEnd = i === 0 ? 0 : acc[i - 1].end;
    return [...acc, { chunk, chunkDur, start: prevEnd, end: prevEnd + chunkDur }];
  }, []);
  return (
    <span style={{ whiteSpace: "normal", overflowWrap: "break-word" }}>
      {chunks.map(({ chunk, start }, i) => {
        const wordDelay = delay + start;
        return (
          <span
            key={i}
            className="adlib-typed-word"
            style={{
              display: "inline-block", whiteSpace: "pre", maxWidth: "100%",
              animation: `fadeSlideUp 0.3s ease-out ${wordDelay}s both`,
            }}
          >
            {chunk}
          </span>
        );
      })}
    </span>
  );
}

// Fades a blank in right after the text immediately preceding it finishes typing.
function FadeIn({ children, delay = 0 }) {
  return (
    <span className="adlib-fade-in" style={{ display: "inline-block", maxWidth: "100%", animation: `fadeSlideUp 0.3s ease-out ${delay}s both` }}>
      {children}
    </span>
  );
}

// Shared "↑ Required" tail — mirrors real SetupWizard.jsx's Field/errBorder pattern
// (red label + red border + inline required text once a field is `attempted` and still
// empty), adapted to an inline mad-libs blank instead of a labeled form field: the red
// border carries the same signal as errBorder(), and this small tail supplies the same
// "why is this red" text real Field's error message gives, right next to the blank
// instead of below a separate label.
function RequiredNote({ show }) {
  if (!show) return null;
  return (
    <span style={{
      display: "inline-block", fontSize: "0.5em", fontWeight: 700, letterSpacing: "0.5px",
      textTransform: "uppercase", color: "var(--color-deduction)", verticalAlign: "super",
      margin: "0 2px",
    }}>
      ↑ Required
    </span>
  );
}

function InlineSelect({ value, onChange, options, placeholder = "(select)", ariaLabel, error = false }) {
  const hasValue = value != null && value !== "";
  return (
    <>
      <select
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        style={{
          appearance: "none", WebkitAppearance: "none", MozAppearance: "none",
          display: "inline-block", maxWidth: "100%", boxSizing: "border-box", background: "transparent",
          border: "none",
          borderBottom: error ? "3px solid var(--color-deduction)" : hasValue ? "3px solid var(--color-teal)" : "3px dashed var(--color-text-disabled)",
          color: hasValue ? "var(--color-teal)" : "var(--color-text-disabled)",
          font: "inherit", fontWeight: 700, fontStyle: hasValue ? "normal" : "italic",
          textAlign: "center", padding: "0 4px", margin: "0 2px", cursor: "pointer",
        }}
      >
        {/* Kept as a real (non-disabled) option, not just a pre-selection placeholder — lets the
            user explicitly pick back to blank after choosing something, same as any other option. */}
        <option value="" disabled={false}>{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <RequiredNote show={error} />
    </>
  );
}

function InlineNumber({ value, onChange, placeholder = "___", width = "84px", ariaLabel, error = false }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <>
      <input
        type="number" inputMode="decimal"
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        style={{
          display: "inline-block", width, maxWidth: "100%", boxSizing: "border-box",
          background: "transparent", border: "none",
          borderBottom: error ? "3px solid var(--color-deduction)" : hasValue ? "3px solid var(--color-teal)" : "3px dashed var(--color-text-disabled)",
          color: "var(--color-teal)", font: "inherit", fontWeight: 700,
          textAlign: "center", padding: "0 2px", margin: "0 2px",
        }}
      />
      <RequiredNote show={error} />
    </>
  );
}

function InlineDate({ value, onChange, width = "168px", label = "Start date", error = false }) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <>
      <input
        type="date"
        aria-label={label}
        aria-invalid={error || undefined}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        style={{
          display: "inline-block", width, maxWidth: "100%", minWidth: 0, boxSizing: "border-box",
          background: "transparent", border: "none",
          borderBottom: error ? "3px solid var(--color-deduction)" : hasValue ? "3px solid var(--color-teal)" : "3px dashed var(--color-text-disabled)",
          color: hasValue ? "var(--color-teal)" : "var(--color-text-disabled)",
          font: "inherit", fontWeight: 700,
          textAlign: "center", padding: "0 2px", margin: "0 2px",
          colorScheme: "dark",
        }}
      />
      <RequiredNote show={error} />
    </>
  );
}

// A toggleable inline tag — the multi-select equivalent of InlineSelect/InlineNumber
// for benefit picking, where "one value per blank" doesn't fit (any subset of the 9
// BENEFIT_OPTIONS can be on at once). Not a real form blank, so no placeholder/(select)
// state — just on/off, styled to sit inline in the sentence like the other controls.
function InlineChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}${active ? " (selected)" : ""}`}
      style={{
        display: "inline-flex", alignItems: "center", cursor: "pointer",
        margin: "3px 4px", padding: "3px 11px",
        borderRadius: "999px", font: "inherit", fontSize: "0.62em",
        fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase",
        border: active ? "1px solid var(--color-teal)" : "1px dashed var(--color-text-disabled)",
        background: active ? "rgba(0,200,150,0.12)" : "transparent",
        color: active ? "var(--color-teal)" : "var(--color-text-disabled)",
      }}
    >
      {active ? "✓ " : "+ "}{label}
    </button>
  );
}

// Mirrors real Step1's pickTeam() — same field set/defaults so a handed-off
// wizard resuming at Schedule sees an identical DHL config either way. Plant only.
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

// Mirrors real Step1's pickWarehouseTeam() — otThreshold/otMultiplier/payPeriodEndDay/
// bucket/diffRate are already seeded by setEmployer's DHL branch below the moment DHL
// is chosen (same values for either site), so only dhlTeam + scheduleIsVariable differ.
function pickWarehouseTeamPatch(t) {
  return { dhlTeam: t, scheduleIsVariable: false, userPaySchedule: null };
}

// Combined mandatory-field gate for the Intake page — mirrors STEP_DEFS id 0
// (Welcome) + id 1 (Pay Structure) in SetupWizard.jsx exactly. For a life-event
// re-entry (lifeEvent !== null) real STEP_DEFS id 0's own isValid is
// unconditionally true (`ev !== null || ...`) — there's no employment-status
// question on re-entry at all, so that check is skipped entirely here too.
function isIntakeValid(d, lifeEvent = null) {
  if (lifeEvent === null) {
    if (d.startedUnemployed !== true && d.startedUnemployed !== false) return false;
    if (d.startedUnemployed === true) return true;
  }
  if (!d.userPaySchedule) return false;
  if (d.employerPreset === "DHL" && !d.dhlSite) return false;
  if (d.employerPreset === "DHL" && !d.dhlTeam) return false;
  // DHL Plant custom-rotation hours (DhlRotationCard) — mirrors real STEP_DEFS id 1's
  // customWeeklyHours checks exactly.
  if (d.customWeeklyHours != null && (d.customWeeklyHoursLong === 0 || d.customWeeklyHoursShort === 0)) return false;
  if (d.customWeeklyHours === 0) return false;
  // Base-user custom OT threshold (otChoice === "custom") must be a positive number once
  // entered — mirrors real STEP_DEFS id 1's otCustom-required-positive rule exactly.
  if (d.employerPreset !== "DHL" && d.otThreshold !== null && !((d.otThreshold ?? 0) > 0)) return false;
  if (d.userPaySchedule === "salary") return (d.annualSalary ?? 0) > 0;
  return (d.baseRate ?? 0) > 0 && (d.shiftHours ?? 0) > 0;
}

// Mandatory-field gate for the Schedule page — mirrors STEP_DEFS id 2
// (Schedule) in SetupWizard.jsx exactly.
function isScheduleValid(d) {
  if (!d.startDate) return false;
  if ((d.firstActiveIdx ?? 0) < 0 || (d.firstActiveIdx ?? 0) >= FISCAL_WEEKS_PER_YEAR) return false;
  if (d.employerPreset === "DHL") return true;
  if (!((d.maxWeeklyHours ?? 0) > 0) || (d.maxWeeklyHours ?? 0) > 168) return false;
  if (!d.hoursUnderstood) return false;
  if (!Number.isInteger(d.payPeriodEndDay) || d.payPeriodEndDay < 0 || d.payPeriodEndDay > 6) return false;
  if ((d.userPaySchedule === "biweekly" || d.userPaySchedule === "salary") && d.biweeklyPayWeekParity == null) return false;
  return true;
}

// Mandatory-field gate for the Deductions page — mirrors STEP_DEFS id 3
// (Deductions) in SetupWizard.jsx exactly.
function isDeductionsValid(d) {
  if (d.employerPreset !== "DHL" && d.attendanceBucketEnabled === null) return false;
  const sel = new Set(d.selectedBenefits ?? []);
  if (sel.has("k401")) {
    if (!((d.k401Rate ?? 0) > 0)) return false;
    if (!d.k401StartDate) return false;
  }
  for (const def of BENEFIT_OPTIONS.filter(b => b.type === "weekly")) {
    if (sel.has(def.id) && !((d[def.field] ?? 0) > 0)) return false;
  }
  return true;
}

// Mandatory-field gate for the Tax Rates page — mirrors STEP_DEFS id 4
// (Tax Rates) in SetupWizard.jsx exactly.
function isTaxRatesValid(d) {
  return d.fedRateLow > 0 && d.userState != null;
}

// Wrap Up has no required fields at all — mirrors STEP_DEFS id 7's
// `isValid: () => true` exactly. It's a live summary plus two optional,
// non-blocking settings, not a form to fill in.
function isWrapUpValid() {
  return true;
}

// Fields these five pilot pages ask about — blanked on a fresh open (below)
// rather than carried over from the admin's real config, so isIntakeValid/
// isScheduleValid/isDeductionsValid/isTaxRatesValid's mandatory-field gates
// actually have something to gate. Pre-filling from `config` (the admin's own
// real answers) made every field already "answered" before the admin touched
// anything, silently bypassing both the blank look and the required-field check.
const BLANK_PAY_FIELDS = {
  startedUnemployed: null, employerPreset: null, dhlSite: null, dhlTeam: null,
  dhlNightShift: null, nightDiffRate: null, userPaySchedule: null,
  annualSalary: null, baseRate: null, shiftHours: null,
  otThreshold: null, otMultiplier: null, payPeriodEndDay: null,
  scheduleIsVariable: null, bucketStartBalance: null, bucketCap: null,
  bucketPayoutRate: null, diffRate: null, startingWeekIsLong: null,
  startDate: null, firstActiveIdx: null, maxWeeklyHours: null,
  hoursUnderstood: null, biweeklyPayWeekParity: null,
  tipsOrCommissionEnabled: null, tipsOrCommissionLabel: null, tipsCommissionOnlyPosition: null,
  nightDiffEnabled: null, customWeeklyHours: null, customWeeklyHoursLong: null,
  customWeeklyHoursShort: null, dhlCustomSchedule: null,
  // Deductions page
  selectedBenefits: null, attendanceBucketEnabled: null,
  healthPremium: null, dentalPremium: null, visionPremium: null,
  ltd: null, stdWeekly: null, lifePremium: null, hsaWeekly: null, fsaWeekly: null,
  k401Rate: null, k401MatchRate: null, k401StartDate: null,
  benefitsStartDate: null, otherDeductions: null,
  attendanceUnit: null, attendanceWarnThreshold: null, attendanceTerminateThreshold: null,
  attendanceCurrentBalance: null, attendanceIncrement: null,
  ptoEnabled: null, ptoAccrualMethod: null, ptoAccrualRate: null,
  ptoCurrentBalance: null, ptoCap: null,
  // Tax Rates page
  filingStatus: null, fedStdDeduction: null, userState: null,
  fedRateLow: null, fedRateHigh: null, stateRateLow: null, stateRateHigh: null,
  taxRatesEstimated: null,
  // Wrap Up page
  freedomAllowanceEnabled: null, freedomAllowance: null, taxExemptOptIn: null,
};

// ── Page 0: Welcome + Pay Structure merged onto one cascading sentence — each
// clause rolls in as soon as the answer it depends on is given. ──
// Advanced Pay Rules — mirrors real Step1's `AdvancedPayRules` component exactly (same
// three fields, same defaults/clear-on-toggle behavior), reshaped from labeled Field/Pill
// form controls into this file's card-and-chip idiom (InlineChip standing in for Pill) since
// there's no page-level equivalent already in this file. Rendered as a collapsible card
// below the sentence, same as it is in the real wizard, rather than forced into inline
// mad-libs prose — none of these three fields gate isIntakeValid on either wizard (except
// the custom-OT-threshold-must-be-positive-if-set rule already enforced in isIntakeValid).
function AdvancedPayRulesCard({ formData, onChange }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={cardShellStyle}>
      <Pressable onClick={() => setExpanded(e => !e)} style={cardHeaderStyle}>
        <div>
          <div className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>Advanced Pay Rules</div>
          <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>
            OT multiplier, night differential, weekend rate — defaults work for most.
          </div>
        </div>
        <div className="text-xs" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}>{expanded ? "▾" : "▸"}</div>
      </Pressable>
      {expanded && (
        <div style={{ padding: "4px 14px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div className="text-2xs" style={cardLabelStyle}>OT Multiplier</div>
            <div style={{ display: "flex", gap: "8px" }}>
              {OT_MULTIPLIERS.map(m => (
                <InlineChip key={m} label={`${m}×`} active={formData.otMultiplier === m} onClick={() => onChange({ otMultiplier: m })} />
              ))}
            </div>
          </div>
          <div>
            <div className="text-2xs" style={cardLabelStyle}>Night Differential?</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <InlineChip label="Yes" active={formData.nightDiffEnabled === true} onClick={() => onChange({ nightDiffEnabled: true })} />
              <InlineChip label="No" active={formData.nightDiffEnabled === false} onClick={() => onChange({ nightDiffEnabled: false, nightDiffRate: 0 })} />
            </div>
            {formData.nightDiffEnabled === true && (
              <div style={{ marginTop: "10px" }}>
                <div className="text-2xs" style={cardLabelStyle}>Night Diff Rate ($/hr)</div>
                <InlineNumber
                  value={formData.nightDiffRate ?? ""}
                  onChange={v => onChange({ nightDiffRate: v === "" ? null : parseFloat(v) })}
                  placeholder="1.50"
                  width="72px"
                  ariaLabel="Night differential rate, dollars per hour"
                />
              </div>
            )}
          </div>
          <div>
            <div className="text-2xs" style={cardLabelStyle}>Weekend Differential ($/hr, 0 = none)</div>
            <InlineNumber
              value={formData.diffRate ?? ""}
              onChange={v => onChange({ diffRate: v === "" ? null : parseFloat(v) })}
              placeholder="0"
              width="72px"
              ariaLabel="Weekend differential, dollars per hour"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// DHL Plant custom-rotation question — mirrors real Step1's inline `Field` block
// (`SetupWizard.jsx` ~560–639) field-for-field: Standard vs. Custom schedule choice,
// with long/short-week hour inputs (draft strings so a blank displays while typing, same
// as the real page's `longHoursDraft`/`shortHoursDraft`) once Custom is picked. Plant-only
// — Warehouse has no rotation to override. `customWeeklyHoursLong === 0` /
// `customWeeklyHoursShort === 0` are real Step1's own "entered but blank" sentinels, and
// isIntakeValid's mirror of real Step1's own gate on them.
function DhlRotationCard({ formData, onChange, attempted = false }) {
  const [expanded, setExpanded] = useState(formData.customWeeklyHours != null);
  const [longDraft, setLongDraft] = useState(formData.customWeeklyHoursLong > 0 ? String(formData.customWeeklyHoursLong) : "");
  const [shortDraft, setShortDraft] = useState(formData.customWeeklyHoursShort > 0 ? String(formData.customWeeklyHoursShort) : "");
  const isCustom = formData.customWeeklyHours != null;
  const hoursMissing = attempted && (formData.customWeeklyHoursLong === 0 || formData.customWeeklyHoursShort === 0);

  return (
    <div style={cardShellStyle}>
      <Pressable onClick={() => setExpanded(e => !e)} style={cardHeaderStyle}>
        <div>
          <div className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>DHL Rotation</div>
          <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>
            {isCustom ? "Custom long/short-week hours" : "Standard rotation — tap to override"}
          </div>
        </div>
        <div className="text-xs" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}>{expanded ? "▾" : "▸"}</div>
      </Pressable>
      {expanded && (
        <div style={{ padding: "4px 14px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <InlineChip
              label="Standard rotation" active={!isCustom}
              onClick={() => {
                onChange({ customWeeklyHours: null, customWeeklyHoursLong: null, customWeeklyHoursShort: null, dhlCustomSchedule: false });
                setLongDraft(""); setShortDraft("");
              }}
            />
            <InlineChip
              label="Custom schedule" active={isCustom}
              onClick={() => {
                const fallback = (formData.customWeeklyHours ?? 0) > 0 ? formData.customWeeklyHours : 60;
                const longV = (formData.customWeeklyHoursLong ?? 0) > 0 ? formData.customWeeklyHoursLong : fallback;
                const shortV = (formData.customWeeklyHoursShort ?? 0) > 0 ? formData.customWeeklyHoursShort : fallback;
                onChange({ customWeeklyHours: fallback, customWeeklyHoursLong: longV, customWeeklyHoursShort: shortV, dhlCustomSchedule: false });
                setLongDraft(String(longV)); setShortDraft(String(shortV));
              }}
            />
          </div>
          {isCustom ? (
            <div>
              <div className="text-2xs" style={{ ...cardLabelStyle, color: hoursMissing ? "var(--color-deduction)" : cardLabelStyle.color }}>Hours per week</div>
              <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>Long week</div>
              <InlineNumber
                value={longDraft}
                onChange={v => {
                  setLongDraft(v);
                  const n = parseFloat(v);
                  onChange({ customWeeklyHoursLong: (!isNaN(n) && n > 0) ? n : 0, dhlCustomSchedule: false });
                }}
                placeholder="60"
                width="64px"
                ariaLabel="Long week hours"
                error={attempted && formData.customWeeklyHoursLong === 0}
              />
              <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "8px" }}>Short week</div>
              <InlineNumber
                value={shortDraft}
                onChange={v => {
                  setShortDraft(v);
                  const n = parseFloat(v);
                  onChange({ customWeeklyHoursShort: (!isNaN(n) && n > 0) ? n : 0, dhlCustomSchedule: false });
                }}
                placeholder="40"
                width="64px"
                ariaLabel="Short week hours"
                error={attempted && formData.customWeeklyHoursShort === 0}
              />
              <div className="text-xs" style={{ marginTop: "8px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                Projections use long/short targets by week type. DHL rotation still shows scheduled days in weekly confirmation.
              </div>
            </div>
          ) : (
            <div className="text-xs" style={{ color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              Override per-week from Income for extra shifts.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Life-event pivot picker (drift-app-warden §7 F140) — ported from real
// SetupWizard.jsx's Step0 re-entry picker (~line 40-178). Only ever rendered when this
// wizard's ORIGINAL entry point was "structure_change" (the only real entry point,
// App.jsx item 5) — `onLifeEventChange` is only threaded down by the parent in that case,
// so its mere presence is the render gate IntakePage checks. `curLifeEvent` is the
// pivoted-or-not life event currently in effect; `onLifeEventChange` updates it.
//
// Two branches, mirroring real Step0 exactly for their respective states:
//   - curLifeEvent === "structure_change" (not yet pivoted): the structure_change-specific
//     intro copy (item 2, ported verbatim from SetupWizard.jsx:109-136), PLUS the picker
//     below it — real Step0 returns early here with no picker at all, but since ad-lib has
//     no separate "step" to advance into first, the picker has to live on this same screen
//     or pivoting would be permanently unreachable. This is the one deliberate deviation
//     from a line-for-line Step0 port — see the session report's judgment-call note.
//   - curLifeEvent is one of the other three (already pivoted): the generic "What changed?"
//     picker only, active option highlighted — a verbatim port of real Step0's else branch.
// Matches real LIFE_EVENTS' own filter: the list never includes "structure_change" as a
// selectable option (no way to pivot back once moved away, same as the real wizard).
function LifeEventPivot({ curLifeEvent, onLifeEventChange }) {
  const picker = (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {LIFE_EVENTS.filter(ev => ev.value !== "structure_change").map(ev => {
        const active = curLifeEvent === ev.value;
        return (
          <Pressable
            key={ev.value}
            onClick={() => onLifeEventChange(ev.value)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              gap: "3px", textAlign: "left",
              background: active ? "rgba(0,200,150,0.08)" : "var(--color-bg-raised)",
              border: `1px solid ${active ? "rgba(0,200,150,0.28)" : "var(--color-border-subtle)"}`,
              borderRadius: "12px", padding: "12px 14px", cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <span className="text-base" style={{ fontWeight: "600", color: active ? "var(--color-teal)" : "var(--color-text-primary)" }}>
              {active && "✓ "}{ev.label}
            </span>
            <span className="text-xs" style={{ color: "var(--color-text-primary)" }}>{ev.sub}</span>
          </Pressable>
        );
      })}
    </div>
  );

  if (curLifeEvent === "structure_change") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "24px" }}>
        <p className="text-md" style={{ lineHeight: "1.6", color: "var(--color-text-primary)", margin: 0, fontWeight: 600 }}>
          Update your pay structure.
        </p>
        <p className="text-base" style={{ lineHeight: "1.6", color: "var(--color-text-primary)", margin: 0 }}>
          The next steps are pre-filled with your current settings — only edit what actually
          changed (rate, schedule, employer, deductions, or tax setup). Goals, expenses, logs,
          and historical week confirmations stay put.
        </p>
        <p className="text-sm" style={{ lineHeight: "1.6", color: "var(--color-text-primary)", margin: 0 }}>
          On the Schedule step, set the start date to the day your new pay structure takes
          effect. Forward-looking projections recalculate from that week onward.
        </p>
        <div>
          <p className="text-xs" style={{ color: "var(--color-text-secondary)", margin: "4px 0 8px" }}>
            Something else changed instead?
          </p>
          {picker}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "24px" }}>
      <p className="text-base" style={{ color: "var(--color-text-primary)", margin: "0 0 12px" }}>
        What changed? Only the affected steps will be updated — everything else stays as-is.
      </p>
      {picker}
    </div>
  );
}

function IntakePage({ formData, onChange, isInvestor = false, attempted = false, lifeEvent = null, onLifeEventChange = null }) {
  // employerPreset is only ever "DHL" | null in this app's real model — null alone
  // can't distinguish "hasn't answered yet" from "explicitly chose someone else",
  // so track which blank the user picked as local UI state (mirrors real Step1's
  // gateTouched flag). Re-derives "OTHER" on a resumed formData that already has
  // userPaySchedule answered without employerPreset === "DHL". Investors are always
  // base users — the "who do you work for" clause is skipped entirely for them,
  // mirroring real Step1's `!isInvestor` gate.
  const [employerChoice, setEmployerChoice] = useState(() =>
    isInvestor ? "OTHER" : formData.employerPreset === "DHL" ? "DHL" : formData.userPaySchedule ? "OTHER" : ""
  );
  const isEmployerDHL = !isInvestor && employerChoice === "DHL";
  const isBaseUser = !isEmployerDHL;
  const isSalary = formData.userPaySchedule === "salary";
  // Life-event re-entry has no employment-status question at all (real STEP_DEFS id 0's
  // isValid is unconditionally true for ev !== null) — always employed from the moment the
  // page mounts, mirroring isIntakeValid's own lifeEvent-gated skip of this check.
  const isEmployed = lifeEvent !== null ? true : formData.startedUnemployed === false;
  const investorFirstName = isInvestor ? (formData?.investorName ?? "").split(" ")[0] : "";

  // Commission toggle (lifeEvent === "commission_job" only) — mirrors real Step1's
  // hasCommission local state exactly (commissionMonthly is the only stored field; the
  // on/off state itself is UI-local, same as real Step1's own useState). Also re-synced
  // via useEffect (not just the lazy initializer) — a pivot from "structure_change" to
  // "commission_job" (drift-app-warden §7 F140's pivot mechanism) changes `lifeEvent` well
  // after mount, when the lazy initializer has already run and evaluated false.
  const [hasCommission, setHasCommission] = useState(
    lifeEvent === "commission_job" && (formData.commissionMonthly ?? 0) > 0
  );
  useEffect(() => {
    if (lifeEvent === "commission_job") setHasCommission((formData.commissionMonthly ?? 0) > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifeEvent]);

  // Overtime Threshold local UI choice — mirrors real Step1's otCustom flag, plus a
  // separate "have they answered at all" tracked as its own string state so a
  // resumed/blank `otThreshold === null` (which real Step1 also uses for "Exempt")
  // doesn't get misread as already-answered. otThreshold doesn't gate isIntakeValid
  // either here or on real STEP_DEFS id 1, so this ambiguity is cosmetic only — see
  // docs/drift-app-warden.md §7 F129's sibling entry for this round's field-parity
  // additions.
  const [otChoice, setOtChoice] = useState(() => {
    if (formData.otThreshold === 40) return "40";
    if (formData.otThreshold === 48) return "48";
    if (formData.otThreshold != null) return "custom";
    return "";
  });
  function pickOtThreshold(v) {
    setOtChoice(v);
    if (v === "40") onChange({ otThreshold: 40 });
    else if (v === "48") onChange({ otThreshold: 48 });
    else if (v === "custom") onChange({ otThreshold: null });
    else if (v === "exempt") onChange({ otThreshold: null });
    else onChange({ otThreshold: null });
  }

  function setEmployer(v) {
    setEmployerChoice(v);
    if (v === "DHL") {
      onChange({
        employerPreset: "DHL", otThreshold: 40, otMultiplier: 1.5, payPeriodEndDay: 0,
        scheduleIsVariable: true, bucketStartBalance: 64, bucketCap: 128, bucketPayoutRate: 9.825,
        diffRate: formData.diffRate ?? 1.75,
        baseRate: formData.baseRate ?? DHL_PRESET.defaults.baseRate,
        shiftHours: formData.shiftHours ?? DHL_PRESET.defaults.shiftHours,
        userPaySchedule: null, dhlTeam: null, dhlSite: null,
      });
    } else {
      onChange({ employerPreset: null, userPaySchedule: null, diffRate: 0, scheduleIsVariable: false, baseRate: null, shiftHours: null });
    }
  }

  // Mirrors real Step1's pickSite() — clears the cross-site team value (A/B vs MT/WS are
  // meaningless on the other site) and flips scheduleIsVariable (Warehouse has no rotation,
  // so pay is constant week-to-week, unlike Plant's alternating long/short weeks).
  function pickSite(site) {
    onChange({
      dhlSite: site,
      dhlTeam: null,
      scheduleIsVariable: site === "WAREHOUSE" ? false : true,
      shiftHours: site === "WAREHOUSE" ? null : (formData.shiftHours ?? DHL_PRESET.defaults.shiftHours),
    });
  }

  const isEmployerWarehouse = formData.dhlSite === "WAREHOUSE";
  const isEmployerPlant = formData.dhlSite === "PLANT";
  // Warehouse's shared "working the [shift], paid [schedule]" clause additionally needs the
  // shift-length blank answered first — Plant's team pick alone is enough.
  const dhlTeamReady = isEmployerPlant
    ? !!formData.dhlTeam
    : isEmployerWarehouse
      ? !!formData.dhlTeam && (formData.shiftHours ?? 0) > 0
      : false;

  // "Pay structure fully answered" gate — real Step1's Advanced Pay Rules/OT
  // Threshold/tips-commission opt-in all appear once the core rate/schedule
  // questions are answered; same threshold used here for the trailing clauses below
  // (DHL Weekend Differential, base-user OT Threshold, Tips/Commission opt-in).
  const payStructureComplete = isEmployerDHL
    ? dhlTeamReady && !!formData.userPaySchedule
    : (employerChoice === "OTHER" || isInvestor) && !!formData.userPaySchedule &&
      (isSalary ? (formData.annualSalary ?? 0) > 0 : (formData.baseRate ?? 0) > 0 && (formData.shiftHours ?? 0) > 0);

  const introText = "Let's set you up. Right now, I am";
  // Life-event re-entry intro copy — there's no real Step0 branch specific to lost_job/
  // commission_job to port field-for-field (only structure_change gets its own Step0
  // copy in the real wizard; the generic re-entry branch there is the LIFE_EVENTS picker
  // itself, out of scope this round per docs/drift-app-warden.md §7 F139) — this is new
  // copy written in the same tone as structure_change's own re-entry intro.
  const introTextLostJob = "Let's rebuild your pay for the new job.";
  const introTextCommission = "Let's add your commission job to your pay structure.";
  // changed_jobs has no bespoke real-Step0 copy either (same as lost_job/commission_job) —
  // new copy in the same tone, distinct wording so it doesn't read as a lost-job re-hire.
  const introTextChangedJobs = "Let's set up your pay for the new job.";
  const workForText = "I work for";
  const siteText = "I work at the";
  const onTeamText = "I'm on Team";
  const warehouseTeamText = "I'm on the";
  const teamShiftsText = "team, on";
  const shiftsWordText = "shifts";
  const workingTheText = "working the";
  const shiftPaidText = "shift, paid";
  const iGetPaidText = "I get paid";
  const mySalaryText = "My salary is $";
  const aYearText = "a year.";
  const myRateText = "My rate is $";
  const shiftsRunText = "an hour, and my shifts run";
  const hoursText = "hours.";
  const weekendDiffText = "My weekend differential is $";
  const perHourText = "an hour.";
  const otLeadText = "My overtime kicks in at";
  const otCustomLeadText = "specifically";
  const otHoursWordText = "hours a week.";
  const tipsLeadText = "On top of that, I";
  const commissionOnlyLeadText = "This is";
  const commissionOnlyTailText = "commission-only position.";
  // Commission Income (lifeEvent === "commission_job" only) — mirrors real Step1's
  // Commission Income Field exactly (Pill toggle + Monthly Average, gated on gateTouched
  // only, applies to both DHL and base users): src/components/SetupWizard.jsx ~782-808.
  const commissionLeadText = "My pay also";
  const commissionAmountText = "averaging $";

  return (
    <>
    {/* Life-event pivot picker (drift-app-warden §7 F140) — only rendered when the
        wizard's original entry point was "structure_change" (the sole real entry point,
        App.jsx item 5); onLifeEventChange is only threaded down in that case. */}
    {onLifeEventChange && (
      <LifeEventPivot curLifeEvent={lifeEvent} onLifeEventChange={onLifeEventChange} />
    )}
    <p style={BLANK_FONT}>
      {isInvestor && investorFirstName && (
        <>
          <TypedText text={`Welcome, ${investorFirstName}.`} />
          <br />
        </>
      )}
      {lifeEvent === null ? (
        <>
          <TypedText text={introText} />{" "}
          <FadeIn delay={typeDuration(introText)}>
            <InlineSelect
              value={formData.startedUnemployed === true ? "unemployed" : formData.startedUnemployed === false ? "employed" : ""}
              onChange={v => onChange({ startedUnemployed: v === "" ? null : v === "unemployed" })}
              options={[{ value: "employed", label: "employed" }, { value: "unemployed", label: "unemployed" }]}
              ariaLabel="Employment status"
              error={attempted && formData.startedUnemployed !== true && formData.startedUnemployed !== false}
            />
          </FadeIn>.
        </>
      ) : lifeEvent === "lost_job" ? (
        <TypedText text={introTextLostJob} />
      ) : lifeEvent === "commission_job" ? (
        <TypedText text={introTextCommission} />
      ) : lifeEvent === "changed_jobs" ? (
        <TypedText text={introTextChangedJobs} />
      ) : null /* structure_change: intro already rendered above via LifeEventPivot */}
      {isEmployed && (
        <>
          {!isInvestor && (
            <>
              {" "}<TypedText text={workForText} />{" "}
              <FadeIn delay={typeDuration(workForText)}>
                <InlineSelect
                  value={employerChoice}
                  onChange={setEmployer}
                  options={[{ value: "DHL", label: "DHL" }, { value: "OTHER", label: "someone else" }]}
                  ariaLabel="Employer"
                />
              </FadeIn>.
            </>
          )}
          {isEmployerDHL && (
            <>
              {" "}<TypedText text={siteText} />{" "}
              <FadeIn delay={typeDuration(siteText)}>
                <InlineSelect
                  value={formData.dhlSite ?? ""}
                  onChange={v => v === "" ? onChange({ dhlSite: null, dhlTeam: null }) : pickSite(v)}
                  options={[{ value: "WAREHOUSE", label: "Warehouse" }, { value: "PLANT", label: "Plant" }]}
                  ariaLabel="DHL site"
                  error={attempted && !formData.dhlSite}
                />
              </FadeIn>.
              {isEmployerPlant && (
                <>
                  {" "}<TypedText text={onTeamText} />{" "}
                  <FadeIn delay={typeDuration(onTeamText)}>
                    <InlineSelect
                      value={formData.dhlTeam ?? ""}
                      onChange={t => onChange(t === "" ? { dhlTeam: null } : pickTeamPatch(t))}
                      options={[{ value: "A", label: "A" }, { value: "B", label: "B" }]}
                      ariaLabel="DHL team"
                      error={attempted && !formData.dhlTeam}
                    />
                  </FadeIn>
                </>
              )}
              {isEmployerWarehouse && (
                <>
                  {" "}<TypedText text={warehouseTeamText} />{" "}
                  <FadeIn delay={typeDuration(warehouseTeamText)}>
                    <InlineSelect
                      value={formData.dhlTeam ?? ""}
                      onChange={t => onChange(t === "" ? { dhlTeam: null } : pickWarehouseTeamPatch(t))}
                      options={Object.entries(DHL_PRESET.warehouseTeams).map(([t, meta]) => ({ value: t, label: meta.label }))}
                      ariaLabel="DHL warehouse team"
                      error={attempted && !formData.dhlTeam}
                    />
                  </FadeIn>
                  {formData.dhlTeam && (
                    <>
                      {" "}<TypedText text={teamShiftsText} />{" "}
                      <FadeIn delay={typeDuration(teamShiftsText)}>
                        <InlineSelect
                          value={formData.shiftHours === 10 ? "10" : formData.shiftHours === 12 ? "12" : ""}
                          onChange={v => onChange({ shiftHours: v === "" ? null : parseInt(v, 10) })}
                          options={[{ value: "10", label: "10-hour" }, { value: "12", label: "12-hour" }]}
                          ariaLabel="Shift length"
                          error={attempted && !((formData.shiftHours ?? 0) > 0)}
                        />
                      </FadeIn>{" "}
                      <TypedText text={shiftsWordText} />
                    </>
                  )}
                </>
              )}
              {dhlTeamReady && (
                <>
                  , <TypedText text={workingTheText} />{" "}
                  <FadeIn delay={typeDuration(workingTheText)}>
                    <InlineSelect
                      value={formData.dhlNightShift === false ? "morning" : formData.dhlNightShift === true ? "night" : ""}
                      onChange={v => onChange(v === "" ? { dhlNightShift: null, nightDiffRate: null } : { dhlNightShift: v === "night", nightDiffRate: v === "night" ? 1.50 : 0 })}
                      options={[{ value: "night", label: "night" }, { value: "morning", label: "morning" }]}
                      ariaLabel="Shift time"
                    />
                  </FadeIn>{" "}
                  <TypedText text={shiftPaidText} />{" "}
                  <FadeIn delay={typeDuration(shiftPaidText)}>
                    <InlineSelect
                      value={formData.userPaySchedule ?? ""}
                      onChange={v => onChange({ userPaySchedule: v === "" ? null : v, annualSalary: null })}
                      options={[{ value: "weekly", label: "weekly" }, { value: "salary", label: "every two weeks" }]}
                      ariaLabel="Pay schedule"
                      error={attempted && !formData.userPaySchedule}
                    />
                  </FadeIn>.
                  {formData.userPaySchedule && (
                    <>
                      {" "}<TypedText text={weekendDiffText} />
                      <FadeIn delay={typeDuration(weekendDiffText)}>
                        <InlineNumber
                          value={formData.diffRate ?? ""}
                          onChange={v => onChange({ diffRate: v === "" ? null : parseFloat(v) })}
                          placeholder="1.75"
                          width="56px"
                          ariaLabel="Weekend differential, dollars per hour"
                        />
                      </FadeIn>{" "}
                      <TypedText text={perHourText} />
                    </>
                  )}
                </>
              )}
            </>
          )}
          {(employerChoice === "OTHER" || isInvestor) && (
            <>
              {" "}<TypedText text={iGetPaidText} />{" "}
              <FadeIn delay={typeDuration(iGetPaidText)}>
                <InlineSelect
                  value={formData.userPaySchedule ?? ""}
                  onChange={v => onChange({ userPaySchedule: v === "" ? null : v, annualSalary: null })}
                  options={[
                    { value: "weekly", label: "weekly" },
                    { value: "biweekly", label: "every two weeks" },
                    { value: "monthly", label: "monthly" },
                    { value: "salary", label: "on salary" },
                  ]}
                  ariaLabel="Pay schedule"
                  error={attempted && !formData.userPaySchedule}
                />
              </FadeIn>.
              {formData.userPaySchedule && (isSalary ? (
                <>
                  {" "}<TypedText text={mySalaryText} />
                  <FadeIn delay={typeDuration(mySalaryText)}>
                    <InlineNumber
                      value={formData.annualSalary ?? ""}
                      onChange={v => {
                        const sal = v === "" ? null : parseFloat(v);
                        onChange({ annualSalary: sal, baseRate: sal != null ? Math.round((sal / 2080) * 100) / 100 : null, shiftHours: 8 });
                      }}
                      placeholder="52,000"
                      ariaLabel="Annual salary, dollars"
                      error={attempted && !((formData.annualSalary ?? 0) > 0)}
                    />
                  </FadeIn>{" "}
                  <TypedText text={aYearText} />
                </>
              ) : (
                <>
                  {" "}<TypedText text={myRateText} />
                  <FadeIn delay={typeDuration(myRateText)}>
                    <InlineNumber
                      value={formData.baseRate ?? ""}
                      onChange={v => onChange({ baseRate: v === "" ? null : parseFloat(v) })}
                      placeholder="19.65"
                      width="72px"
                      ariaLabel="Hourly rate, dollars"
                      error={attempted && !((formData.baseRate ?? 0) > 0)}
                    />
                  </FadeIn>{" "}
                  <TypedText text={shiftsRunText} />{" "}
                  <FadeIn delay={typeDuration(shiftsRunText)}>
                    <InlineNumber
                      value={formData.shiftHours ?? ""}
                      onChange={v => onChange({ shiftHours: v === "" ? null : parseFloat(v) })}
                      placeholder="10"
                      width="52px"
                      ariaLabel="Shift length, hours"
                      error={attempted && !((formData.shiftHours ?? 0) > 0)}
                    />
                  </FadeIn>{" "}
                  <TypedText text={hoursText} />
                </>
              ))}
            </>
          )}

          {/* ── Base-user Overtime Threshold (real Step1 ~741–776) — DHL always uses the
               40h/1.5x override applied in setEmployer, so this only appears for base
               users. Doesn't gate isIntakeValid on either wizard. ── */}
          {isBaseUser && payStructureComplete && (
            <>
              {" "}<TypedText text={otLeadText} />{" "}
              <FadeIn delay={typeDuration(otLeadText)}>
                <InlineSelect
                  value={otChoice}
                  onChange={pickOtThreshold}
                  options={[
                    { value: "40", label: "40 hours" },
                    { value: "48", label: "48 hours" },
                    { value: "custom", label: "a custom number" },
                    { value: "exempt", label: "I'm exempt" },
                  ]}
                  ariaLabel="Overtime threshold"
                />
              </FadeIn>
              {otChoice === "custom" && (
                <>
                  , <TypedText text={otCustomLeadText} />{" "}
                  <FadeIn delay={typeDuration(otCustomLeadText)}>
                    <InlineNumber
                      value={formData.otThreshold ?? ""}
                      onChange={v => onChange({ otThreshold: v === "" ? null : parseInt(v, 10) })}
                      placeholder="45"
                      width="52px"
                      ariaLabel="Custom overtime threshold, hours per week"
                      error={attempted && !((formData.otThreshold ?? 0) > 0)}
                    />
                  </FadeIn>{" "}
                  <TypedText text={otHoursWordText} />
                </>
              )}
              {otChoice !== "custom" && <TypedText text="." />}
            </>
          )}

          {/* ── Commission Income (real Step1 ~782–809, lifeEvent === "commission_job" only)
               — applies to both DHL and base users, gated only on payStructureComplete
               (mirrors real Step1's gateTouched gate). ── */}
          {lifeEvent === "commission_job" && payStructureComplete && (
            <>
              {" "}<TypedText text={commissionLeadText} />{" "}
              <FadeIn delay={typeDuration(commissionLeadText)}>
                <InlineSelect
                  value={hasCommission ? "yes" : "no"}
                  onChange={v => {
                    const next = v === "yes";
                    setHasCommission(next);
                    if (!next) onChange({ commissionMonthly: 0 });
                  }}
                  options={[{ value: "yes", label: "includes commission" }, { value: "no", label: "doesn't include commission" }]}
                  ariaLabel="Commission income"
                />
              </FadeIn>
              {hasCommission ? (
                <>
                  , <TypedText text={commissionAmountText} />
                  <FadeIn delay={typeDuration(commissionAmountText)}>
                    <InlineNumber
                      value={formData.commissionMonthly ?? ""}
                      onChange={v => onChange({ commissionMonthly: v === "" ? null : parseFloat(v) })}
                      placeholder="800"
                      width="72px"
                      ariaLabel="Commission monthly average, dollars"
                    />
                  </FadeIn>{" "}
                  <TypedText text="a month." />
                </>
              ) : (
                <TypedText text="." />
              )}
            </>
          )}

          {/* ── Tips/Commission daily check-in opt-in (real Step1 ~811–843) — every
               employed user, DHL or base, can opt in. Stamps tipsOrCommissionEnabledAt
               at finish time via finalizeWizardConfig() (src/lib/wizardComplete.js),
               same as the real wizard's handleComplete(). ── */}
          {payStructureComplete && (
            <>
              {" "}<TypedText text={tipsLeadText} />{" "}
              <FadeIn delay={typeDuration(tipsLeadText)}>
                <InlineSelect
                  value={
                    formData.tipsOrCommissionEnabled === null || formData.tipsOrCommissionEnabled === undefined
                      ? ""
                      : formData.tipsOrCommissionEnabled === false
                        ? "no"
                        : formData.tipsOrCommissionLabel === "tips" ? "tips" : formData.tipsOrCommissionLabel === "commission" ? "commission" : ""
                  }
                  onChange={v => {
                    if (v === "" || v === "no") onChange({ tipsOrCommissionEnabled: false, tipsOrCommissionLabel: null, tipsCommissionOnlyPosition: null });
                    else if (v === "tips") onChange({ tipsOrCommissionEnabled: true, tipsOrCommissionLabel: "tips", tipsCommissionOnlyPosition: null });
                    else onChange({ tipsOrCommissionEnabled: true, tipsOrCommissionLabel: "commission" });
                  }}
                  options={[
                    { value: "no", label: "don't earn tips or commission" },
                    { value: "tips", label: "earn tips" },
                    { value: "commission", label: "earn commission" },
                  ]}
                  ariaLabel="Tips or commission"
                />
              </FadeIn>.
              {formData.tipsOrCommissionEnabled && (
                <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "6px" }}>
                  We&rsquo;ll ask a quick daily check-in — did you make any {formData.tipsOrCommissionLabel} that day?
                </div>
              )}
              {formData.tipsOrCommissionEnabled && formData.tipsOrCommissionLabel === "commission" && (
                <>
                  {" "}<TypedText text={commissionOnlyLeadText} />{" "}
                  <FadeIn delay={typeDuration(commissionOnlyLeadText)}>
                    <InlineSelect
                      value={formData.tipsCommissionOnlyPosition === true ? "yes" : formData.tipsCommissionOnlyPosition === false ? "no" : ""}
                      onChange={v => onChange({ tipsCommissionOnlyPosition: v === "" ? null : v === "yes" })}
                      options={[{ value: "yes", label: "a" }, { value: "no", label: "not a" }]}
                      ariaLabel="Commission-only position"
                    />
                  </FadeIn>{" "}
                  <TypedText text={commissionOnlyTailText} />
                </>
              )}
            </>
          )}
        </>
      )}
    </p>

    {isEmployed && isEmployerDHL && isEmployerPlant && dhlTeamReady && (
      <DhlRotationCard formData={formData} onChange={onChange} attempted={attempted} />
    )}
    {isEmployed && isBaseUser && payStructureComplete && (
      <AdvancedPayRulesCard formData={formData} onChange={onChange} />
    )}
    </>
  );
}

// ── Page 1: Schedule (mirrors real Step2's core required fields) — a second
// cascading sentence, only shown for employed users (jobless skips Schedule
// entirely, same as the real wizard's isFirstRunJobless gate). ──
function SchedulePage({ formData, onChange, attempted = false }) {
  const isEmployerDHL = formData.employerPreset === "DHL";
  const isBiweekly = formData.userPaySchedule === "biweekly" || formData.userPaySchedule === "salary";

  function handleDateChange(dateStr) {
    onChange(dateStr === "" ? { startDate: null, firstActiveIdx: null } : { startDate: dateStr, firstActiveIdx: dateToWeekIdx(dateStr) });
  }

  // Mirrors real Step2's payday-parity helper exactly, so "this Xday / next Xday"
  // maps to the same biweeklyPayWeekParity value either UI produces.
  const todayWeekIdx = (() => {
    const t = new Date();
    const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    return dateToWeekIdx(iso);
  })();
  const payDayName = Number.isInteger(formData.payPeriodEndDay) ? DAY_LABELS[formData.payPeriodEndDay] : "";
  const parityThisWeek = todayWeekIdx % 2;
  const parityNextWeek = (todayWeekIdx + 1) % 2;

  const startedText = "I started on";
  const shortLongText = "Right now I'm on my";
  const hoursText = "I work up to";
  const hoursPerWeekText = "hours a week.";
  const iText = "I";
  const forecastText = "understand this hours number drives my whole forecast.";
  const payPeriodText = "My pay period closes on";
  const paydayQuestionText = `Is this ${payDayName} one of my paydays?`;

  return (
    <p style={BLANK_FONT}>
      <TypedText text={startedText} />{" "}
      <FadeIn delay={typeDuration(startedText)}>
        <InlineDate value={formData.startDate} onChange={handleDateChange} error={attempted && !formData.startDate} />
      </FadeIn>.
      {formData.startDate && (
        isEmployerDHL ? (
          // Warehouse has no rotation — nothing to ask here beyond the start date above,
          // same as SetupWizard.jsx's Step2.
          formData.dhlSite !== "WAREHOUSE" && (
            <>
              {" "}<TypedText text={shortLongText} />{" "}
              <FadeIn delay={typeDuration(shortLongText)}>
                <InlineSelect
                  value={formData.startingWeekIsLong === true ? "long" : formData.startingWeekIsLong === false ? "short" : ""}
                  onChange={v => onChange({ startingWeekIsLong: v === "" ? null : v === "long" })}
                  options={[{ value: "short", label: "Short Week" }, { value: "long", label: "Long Week" }]}
                  ariaLabel="Starting week"
                />
              </FadeIn>.
            </>
          )
        ) : (
          <>
            {" "}<TypedText text={hoursText} />{" "}
            <FadeIn delay={typeDuration(hoursText)}>
              <InlineNumber
                value={formData.maxWeeklyHours ?? ""}
                onChange={v => onChange({ maxWeeklyHours: v === "" ? null : parseFloat(v) })}
                placeholder="40"
                width="56px"
                ariaLabel="Max weekly hours"
                error={attempted && !((formData.maxWeeklyHours ?? 0) > 0 && (formData.maxWeeklyHours ?? 0) <= 168)}
              />
            </FadeIn>{" "}
            <TypedText text={hoursPerWeekText} />
            {(formData.maxWeeklyHours ?? 0) > 0 && (
              <>
                {" "}<TypedText text={iText} />{" "}
                <FadeIn delay={typeDuration(iText)}>
                  <InlineSelect
                    value={formData.hoursUnderstood === true ? "do" : formData.hoursUnderstood === false ? "dont" : ""}
                    onChange={v => onChange({ hoursUnderstood: v === "" ? null : v === "do" })}
                    options={[{ value: "do", label: "do" }, { value: "dont", label: "don't" }]}
                    ariaLabel="Hours understood acknowledgment"
                    error={attempted && !formData.hoursUnderstood}
                  />
                </FadeIn>{" "}
                <TypedText text={forecastText} />
                {formData.hoursUnderstood === true && (
                  <>
                    {" "}<TypedText text={payPeriodText} />{" "}
                    <FadeIn delay={typeDuration(payPeriodText)}>
                      <InlineSelect
                        value={Number.isInteger(formData.payPeriodEndDay) ? String(formData.payPeriodEndDay) : ""}
                        onChange={v => onChange({ payPeriodEndDay: v === "" ? null : parseInt(v, 10), biweeklyPayWeekParity: null })}
                        options={DAY_LABELS.map((label, i) => ({ value: String(i), label }))}
                        ariaLabel="Pay period closing day"
                        error={attempted && !Number.isInteger(formData.payPeriodEndDay)}
                      />
                    </FadeIn>.
                    {isBiweekly && Number.isInteger(formData.payPeriodEndDay) && (
                      <>
                        {" "}<TypedText text={paydayQuestionText} />{" "}
                        <FadeIn delay={typeDuration(paydayQuestionText)}>
                          <InlineSelect
                            value={formData.biweeklyPayWeekParity === parityThisWeek ? "this" : formData.biweeklyPayWeekParity === parityNextWeek ? "next" : ""}
                            onChange={v => onChange({ biweeklyPayWeekParity: v === "" ? null : v === "this" ? parityThisWeek : parityNextWeek })}
                            options={[
                              { value: "this", label: `Yes, this ${payDayName}` },
                              { value: "next", label: `No, next ${payDayName}` },
                            ]}
                            ariaLabel="Pay week timing"
                            error={attempted && formData.biweeklyPayWeekParity == null}
                          />
                        </FadeIn>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )
      )}
    </p>
  );
}

// ── Page 2: Deductions (mirrors real Step3's core required fields) — benefit
// selection is a multi-select (any subset of BENEFIT_OPTIONS can be on at once),
// which doesn't fit the "one blank" mad-libs shape, so it's a row of toggleable
// InlineChip tags instead. Each toggled-on benefit cascades in its own required
// sub-blank(s) right after, same required-field set as real Step3's isValid —
// benefitsStartDate/otherDeductions/attendance-detail-sub-fields/PTO are all
// skipped (v1 scope, matching Warehouse's custom-hours precedent): none of them
// gate isValid, and this pilot only asks what's actually required to proceed. ──
function DeductionsPage({ formData, onChange, attempted = false }) {
  const isBaseUser = formData.employerPreset !== "DHL";
  // Local-only gate (mirrors real Step3's own benefitsGate state) — never enters
  // isValid, purely reveals/hides the benefit chips. Defaults to "answered Yes"
  // when resumed formData already has a selection, same seeding as the real page.
  const [benefitsGate, setBenefitsGate] = useState(() =>
    (formData.selectedBenefits ?? []).length > 0 ? true : null
  );

  function toggleBenefit(id) {
    const next = new Set(formData.selectedBenefits ?? []);
    const def = BENEFIT_OPTIONS.find(b => b.id === id);
    if (next.has(id)) {
      next.delete(id);
      if (def?.type === "weekly") onChange({ [def.field]: 0 });
      if (def?.type === "k401") onChange({ k401Rate: 0, k401MatchRate: 0, k401StartDate: null });
    } else {
      next.add(id);
    }
    onChange({ selectedBenefits: [...next] });
  }

  const others = formData.otherDeductions ?? [];
  function addOtherRow() {
    const id = Date.now().toString(36);
    onChange({ otherDeductions: [...others, { id, label: "", perCheckAmount: 0 }] });
  }
  function updateOtherRow(id, patch) {
    onChange({ otherDeductions: others.map(r => r.id === id ? { ...r, ...patch } : r) });
  }
  function removeOtherRow(id) {
    onChange({ otherDeductions: others.filter(r => r.id !== id) });
  }

  const selected = new Set(formData.selectedBenefits ?? []);
  const gateText = "Right now, I";
  const paycheckText = "benefits or deductions taken from my paycheck.";
  const enrolledText = "I'm enrolled in:";
  const benefitsStartText = "Benefits start on";
  const attendanceLeadText = "My employer";
  const attendanceTailText = "my attendance with a formal points or hours system.";
  const ptoLeadText = "My employer";
  const ptoTailText = "PTO.";

  return (
    <>
    <p style={BLANK_FONT}>
      <TypedText text={gateText} />{" "}
      <FadeIn delay={typeDuration(gateText)}>
        <InlineSelect
          value={benefitsGate === true ? "yes" : benefitsGate === false ? "no" : ""}
          onChange={v => setBenefitsGate(v === "" ? null : v === "yes")}
          options={[{ value: "yes", label: "have" }, { value: "no", label: "don't have" }]}
          ariaLabel="Benefits enrollment"
        />
      </FadeIn>{" "}
      <TypedText text={paycheckText} />
      {benefitsGate === true && (
        <>
          {" "}<TypedText text={enrolledText} />{" "}
          <FadeIn delay={typeDuration(enrolledText)}>
            {BENEFIT_OPTIONS.map(def => (
              <InlineChip key={def.id} label={def.label} active={selected.has(def.id)} onClick={() => toggleBenefit(def.id)} />
            ))}
          </FadeIn>
          {BENEFIT_OPTIONS.filter(def => selected.has(def.id)).map(def => {
            const leadText = def.type === "k401" ? "I put" : `${def.label} costs $`;
            return (
              <span key={def.id}>
                {" "}<TypedText text={leadText} />{" "}
                <FadeIn delay={typeDuration(leadText)}>
                  {def.type === "k401" ? (
                    <InlineNumber
                      value={formData.k401Rate != null ? +(formData.k401Rate * 100).toFixed(2) : ""}
                      onChange={v => onChange({ k401Rate: v === "" ? null : parseFloat(v) / 100 })}
                      placeholder="6"
                      width="44px"
                      ariaLabel="401k contribution percentage"
                      error={attempted && !((formData.k401Rate ?? 0) > 0)}
                    />
                  ) : (
                    <InlineNumber
                      value={formData[def.field] ?? ""}
                      onChange={v => onChange({ [def.field]: v === "" ? null : parseFloat(v) })}
                      placeholder={def.placeholder?.replace("e.g. ", "") ?? "0"}
                      width="64px"
                      ariaLabel={`${def.label} weekly cost, dollars`}
                      error={attempted && !((formData[def.field] ?? 0) > 0)}
                    />
                  )}
                </FadeIn>
                {def.type === "k401" ? (
                  <>
                    {" "}<TypedText text="% into 401k, starting" />{" "}
                    <FadeIn delay={typeDuration("% into 401k, starting")}>
                      <InlineDate
                        value={formData.k401StartDate}
                        onChange={v => onChange({ k401StartDate: v === "" ? null : v })}
                        width="140px"
                        label="401k enrollment date"
                        error={attempted && !formData.k401StartDate}
                      />
                    </FadeIn>
                  </>
                ) : (
                  <TypedText text="a week." />
                )}
              </span>
            );
          })}
          {" "}<TypedText text={benefitsStartText} />{" "}
          <FadeIn delay={typeDuration(benefitsStartText)}>
            <InlineDate
              value={formData.benefitsStartDate}
              onChange={v => onChange({ benefitsStartDate: v === "" ? null : v })}
              width="168px"
              label="Benefits start date"
            />
          </FadeIn>
          <TypedText text="(leave blank if coverage is already active)." />
        </>
      )}
      {isBaseUser && benefitsGate !== null && (
        <>
          {" "}<TypedText text={attendanceLeadText} />{" "}
          <FadeIn delay={typeDuration(attendanceLeadText)}>
            <InlineSelect
              value={formData.attendanceBucketEnabled === true ? "yes" : formData.attendanceBucketEnabled === false ? "no" : ""}
              onChange={v => onChange({ attendanceBucketEnabled: v === "" ? null : v === "yes" })}
              options={[{ value: "yes", label: "tracks" }, { value: "no", label: "doesn't track" }]}
              ariaLabel="Attendance tracking policy"
              error={attempted && formData.attendanceBucketEnabled === null}
            />
          </FadeIn>{" "}
          <TypedText text={attendanceTailText} />{" "}
          <TypedText text={ptoLeadText} />{" "}
          <FadeIn delay={typeDuration(ptoLeadText)}>
            <InlineSelect
              value={formData.ptoEnabled === true ? "yes" : formData.ptoEnabled === false ? "no" : ""}
              onChange={v => onChange({ ptoEnabled: v === "" ? null : v === "yes" })}
              options={[{ value: "yes", label: "offers" }, { value: "no", label: "doesn't offer" }]}
              ariaLabel="PTO offered"
            />
          </FadeIn>{" "}
          <TypedText text={ptoTailText} />
        </>
      )}
    </p>

    {benefitsGate === true && <OtherDeductionsList others={others} onAdd={addOtherRow} onUpdate={updateOtherRow} onRemove={removeOtherRow} />}
    {isBaseUser && formData.attendanceBucketEnabled === true && (
      <AttendanceDetailsCard formData={formData} onChange={onChange} />
    )}
    {isBaseUser && formData.ptoEnabled === true && (
      <PtoDetailsCard formData={formData} onChange={onChange} />
    )}
    </>
  );
}

// Other Recurring Deductions — mirrors real Step3's dynamic list exactly (union dues, parking,
// equipment, etc.), a repeating label+amount row that doesn't fit the "one blank" mad-libs
// shape, so it's a plain block-level list below the sentence, same as the paystub calculator's
// own block-level treatment on the Tax Rates page.
function OtherDeductionsList({ others, onAdd, onUpdate, onRemove }) {
  return (
    <div style={{ ...cardShellStyle, marginTop: "18px", padding: "14px" }}>
      <div className="text-2xs" style={cardLabelStyle}>Other Recurring Deductions (per paycheck)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {others.length === 0 && (
          <div className="text-xs" style={{ color: "var(--color-text-secondary)", padding: "4px 0" }}>
            Nothing added — examples: union dues, parking, equipment.
          </div>
        )}
        {others.map(row => (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 32px", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              className="text-base"
              placeholder="Label (e.g. Union Dues)"
              aria-label="Deduction label"
              value={row.label}
              onChange={e => onUpdate(row.id, { label: e.target.value })}
              style={{
                background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)",
                borderRadius: "8px", padding: "8px 10px", color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
              }}
            />
            <input
              type="number" min="0" step="0.01"
              className="text-base"
              placeholder="$/check"
              aria-label="Deduction amount per paycheck, dollars"
              value={row.perCheckAmount ?? row.weeklyAmount ?? ""}
              onChange={e => onUpdate(row.id, { perCheckAmount: e.target.value === "" ? null : parseFloat(e.target.value) })}
              style={{
                background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)",
                borderRadius: "8px", padding: "8px 10px", color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
              }}
            />
            <Pressable
              onClick={() => onRemove(row.id)}
              aria-label={`Remove ${row.label || "deduction"}`}
              className="text-md"
              style={{
                background: "transparent", color: "var(--color-text-primary)",
                border: "1px solid var(--color-border-subtle)", borderRadius: "8px",
                width: "32px", height: "36px", cursor: "pointer", lineHeight: 1,
              }}
            >×</Pressable>
          </div>
        ))}
        <Pressable
          onClick={onAdd}
          className="text-2xs"
          style={{
            background: "transparent", color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-subtle)", borderRadius: "10px",
            padding: "7px 14px", letterSpacing: "1.5px",
            textTransform: "uppercase", cursor: "pointer", alignSelf: "flex-start",
          }}
        >
          + Add Deduction
        </Pressable>
      </div>
    </div>
  );
}

// Attendance Policy Details — mirrors real Step3's DetailsDisclosure sub-fields exactly
// (unit, warn/terminate thresholds, current balance, per-event increment). Defaults expanded
// if any sub-field already has a value (mirrors real DetailsDisclosure's defaultExpanded),
// same re-entry-friendly precedent as DhlRotationCard's own expanded-by-default check.
function AttendanceDetailsCard({ formData, onChange }) {
  const [expanded, setExpanded] = useState(() =>
    formData.attendanceUnit != null || formData.attendanceWarnThreshold != null ||
    formData.attendanceTerminateThreshold != null || formData.attendanceCurrentBalance != null
  );
  return (
    <div style={{ ...cardShellStyle, marginTop: "12px" }}>
      <Pressable onClick={() => setExpanded(e => !e)} style={cardHeaderStyle}>
        <div>
          <div className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>Attendance Policy Details</div>
          <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Unit, thresholds, current balance — set these up once.
          </div>
        </div>
        <div className="text-xs" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}>{expanded ? "▾" : "▸"}</div>
      </Pressable>
      {expanded && (
        <div style={{ padding: "4px 14px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div className="text-2xs" style={cardLabelStyle}>What unit does your policy use?</div>
            <input
              type="text" placeholder="e.g. points, hours, occurrences"
              aria-label="Attendance policy unit"
              className="text-base"
              value={formData.attendanceUnit ?? ""}
              onChange={e => onChange({ attendanceUnit: e.target.value || null })}
              style={{
                width: "100%", maxWidth: "260px", background: "var(--color-bg-base)",
                border: "1px solid var(--color-border-subtle)", borderRadius: "8px",
                padding: "8px 10px", color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <div>
              <div className="text-2xs" style={cardLabelStyle}>Warning Threshold</div>
              <InlineNumber
                value={formData.attendanceWarnThreshold ?? ""}
                onChange={v => onChange({ attendanceWarnThreshold: v === "" ? null : parseFloat(v) })}
                placeholder="6" width="64px"
                ariaLabel="Attendance warning threshold"
              />
            </div>
            <div>
              <div className="text-2xs" style={cardLabelStyle}>Termination Threshold</div>
              <InlineNumber
                value={formData.attendanceTerminateThreshold ?? ""}
                onChange={v => onChange({ attendanceTerminateThreshold: v === "" ? null : parseFloat(v) })}
                placeholder="12" width="64px"
                ariaLabel="Attendance termination threshold"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <div>
              <div className="text-2xs" style={cardLabelStyle}>Current Balance</div>
              <InlineNumber
                value={formData.attendanceCurrentBalance ?? ""}
                onChange={v => onChange({ attendanceCurrentBalance: v === "" ? null : parseFloat(v) })}
                placeholder="2" width="64px"
                ariaLabel="Attendance current balance"
              />
            </div>
            <div>
              <div className="text-2xs" style={cardLabelStyle}>Per-Event Increment</div>
              <InlineNumber
                value={formData.attendanceIncrement ?? ""}
                onChange={v => onChange({ attendanceIncrement: v === "" ? 1 : parseFloat(v) })}
                placeholder="1" width="64px"
                ariaLabel="Attendance per-event increment"
              />
              <div className="text-2xs" style={{ marginTop: "4px", color: "var(--color-text-secondary)" }}>Default 1 per absence</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// PTO Policy Details — mirrors real Step3's PTO DetailsDisclosure sub-fields exactly (accrual
// method via InlineChip standing in for Pill, rate, current balance, cap).
function PtoDetailsCard({ formData, onChange }) {
  const [expanded, setExpanded] = useState(() =>
    formData.ptoAccrualMethod != null || formData.ptoAccrualRate != null ||
    formData.ptoCurrentBalance != null || formData.ptoCap != null
  );
  const accrualLabel =
    formData.ptoAccrualMethod === "per_hour" ? "Accrual Rate (hrs per hour worked)" :
    formData.ptoAccrualMethod === "per_period" ? "Accrual Rate (hrs per pay period)" :
    "Annual Total (hrs)";
  return (
    <div style={{ ...cardShellStyle, marginTop: "12px" }}>
      <Pressable onClick={() => setExpanded(e => !e)} style={cardHeaderStyle}>
        <div>
          <div className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>PTO Policy Details</div>
          <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>
            Accrual method, rate, current balance — set these up once.
          </div>
        </div>
        <div className="text-xs" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}>{expanded ? "▾" : "▸"}</div>
      </Pressable>
      {expanded && (
        <div style={{ padding: "4px 14px 16px", borderTop: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <div className="text-2xs" style={cardLabelStyle}>How does your PTO accrue?</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <InlineChip label="Per Hour Worked" active={formData.ptoAccrualMethod === "per_hour"} onClick={() => onChange({ ptoAccrualMethod: "per_hour" })} />
              <InlineChip label="Per Pay Period" active={formData.ptoAccrualMethod === "per_period"} onClick={() => onChange({ ptoAccrualMethod: "per_period" })} />
              <InlineChip label="Lump Sum (Annual)" active={formData.ptoAccrualMethod === "lump_sum"} onClick={() => onChange({ ptoAccrualMethod: "lump_sum" })} />
            </div>
          </div>
          {formData.ptoAccrualMethod && (
            <div>
              <div className="text-2xs" style={cardLabelStyle}>{accrualLabel}</div>
              <InlineNumber
                value={formData.ptoAccrualRate ?? ""}
                onChange={v => onChange({ ptoAccrualRate: v === "" ? null : parseFloat(v) })}
                placeholder={formData.ptoAccrualMethod === "per_hour" ? "0.05" : "4"}
                width="64px"
                ariaLabel={accrualLabel}
              />
            </div>
          )}
          <div style={{ display: "flex", gap: "14px", flexWrap: "wrap" }}>
            <div>
              <div className="text-2xs" style={cardLabelStyle}>Current Balance (hrs)</div>
              <InlineNumber
                value={formData.ptoCurrentBalance ?? ""}
                onChange={v => onChange({ ptoCurrentBalance: v === "" ? null : parseFloat(v) })}
                placeholder="40" width="64px"
                ariaLabel="PTO current balance, hours"
              />
            </div>
            <div>
              <div className="text-2xs" style={cardLabelStyle}>Cap (hrs, optional)</div>
              <InlineNumber
                value={formData.ptoCap ?? ""}
                onChange={v => onChange({ ptoCap: v === "" ? null : parseFloat(v) })}
                placeholder="120" width="64px"
                ariaLabel="PTO cap, hours"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const calcBoxStyle = {
  background: "var(--color-bg-raised)", borderRadius: "10px",
  padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
};
const calcHdrStyle = {
  letterSpacing: "2px", textTransform: "uppercase",
  color: "var(--color-text-secondary)",
};

// A plain labeled number input for the paystub mini-calculator — not a
// sentence blank like InlineNumber, so it doesn't share that styling.
function CalcField({ label, value, onChange }) {
  return (
    <label className="text-2xs" style={{
      display: "flex", flexDirection: "column", gap: "4px",
      letterSpacing: "1px", textTransform: "uppercase",
      color: "var(--color-text-secondary)",
    }}>
      {label}
      <input
        type="number" inputMode="decimal" min="0" step="0.01"
        className="text-base"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "110px", padding: "6px 8px", borderRadius: "8px",
          border: "1px solid var(--color-border-subtle)", background: "var(--color-bg-base)",
          color: "var(--color-text-primary)", fontFamily: "var(--font-mono)",
        }}
      />
    </label>
  );
}

// ── Page 3: Tax Rates. Just the two selectors the sentence asks for — filing
// status and state — then, once both are answered, a single "Recalculate
// Using Paystub" button fades in last. Clicking it reveals the same
// gross/withheld inputs real Step4's PaystubCalc uses (dr() below is a
// straight copy of PaystubCalc's own withheld÷gross math) so "Apply These
// Rates" writes real fedRateLow/stateRateLow (and the long-week pair, for a
// variable schedule) — satisfying isTaxRatesValid the same way the real
// wizard's paystub path does. ──
function TaxRatesPage({ formData, onChange, attempted = false }) {
  const isVariable = formData.scheduleIsVariable;
  const isEmployerDHL = formData.employerPreset === "DHL";
  const stateConfig = formData.userState ? STATE_TAX_TABLE[formData.userState] : null;
  const isNoTax = stateConfig?.model === "NONE";
  const hasRates = formData.fedRateLow > 0;
  const [showCalc, setShowCalc] = useState(false);
  const [g1, setG1] = useState(""); const [f1, setF1] = useState(""); const [s1, setS1] = useState("");
  const [g2, setG2] = useState(""); const [f2, setF2] = useState(""); const [s2, setS2] = useState("");

  function dr(gross, withheld) {
    const g = parseFloat(gross) || 0;
    if (!g) return null;
    return +((parseFloat(withheld) || 0) / g).toFixed(4);
  }
  const fed1 = dr(g1, f1);
  const sta1 = dr(g1, s1);
  const fed2 = isVariable ? dr(g2, f2) : null;
  const sta2 = isVariable ? dr(g2, s2) : null;
  const canApply = fed1 !== null;
  const pct = n => n != null ? (n * 100).toFixed(2) + "%" : "—";

  function pickFilingStatus(v) {
    const deductions = { single: 15000, mfj: 30000, hoh: 22500 };
    onChange({ filingStatus: v || null, fedStdDeduction: v ? deductions[v] : null });
  }

  function applyRates() {
    if (!canApply) return;
    onChange({
      fedRateLow: fed1,
      stateRateLow: sta1 ?? 0,
      fedRateHigh: isVariable && fed2 != null ? fed2 : fed1,
      stateRateHigh: isVariable && sta2 != null ? sta2 : (sta1 ?? 0),
      taxRatesEstimated: false,
    });
    setShowCalc(false);
  }

  // Mirrors real Step4's handleEstimate() exactly — flat-rate fallback for a user without a
  // paystub handy. Flags taxRatesEstimated: true (unlike applyRates()'s false), same as real.
  function handleEstimate() {
    const stateEst = isNoTax ? 0 : (stateConfig?.flatRate ?? stateConfig?.midpointRate ?? 0.05);
    onChange({
      fedRateLow: 0.10,
      fedRateHigh: isVariable ? 0.12 : 0.10,
      stateRateLow: stateEst,
      stateRateHigh: stateEst,
      taxRatesEstimated: true,
    });
    setShowCalc(false);
  }

  // Mirrors real Step4's loadDHLPreset() exactly — DHL Missouri reference rates,
  // paystub-derived, flagged estimated until the user confirms with their own stub.
  function loadDHLPreset() {
    const d = DHL_PRESET.defaults;
    onChange({
      fedRateLow: d.fedRateLow,
      fedRateHigh: d.fedRateHigh,
      stateRateLow: d.stateRateLow,
      stateRateHigh: d.stateRateHigh,
      userState: formData.userState || d.userState,
      taxRatesEstimated: true,
    });
    setShowCalc(false);
  }

  const fileText = "I officially file";
  const stateText = "living in the state of";

  return (
    <>
      <p style={BLANK_FONT}>
        <TypedText text={fileText} />{" "}
        <FadeIn delay={typeDuration(fileText)}>
          <InlineSelect
            value={formData.filingStatus ?? ""}
            onChange={pickFilingStatus}
            options={[
              { value: "single", label: "single" },
              { value: "mfj", label: "married filing jointly" },
              { value: "hoh", label: "head of household" },
            ]}
            ariaLabel="Filing status"
            error={attempted && !formData.filingStatus}
          />
        </FadeIn>
        {", "}
        <TypedText text={stateText} />{" "}
        <FadeIn delay={typeDuration(stateText)}>
          <InlineSelect
            value={formData.userState ?? ""}
            onChange={v => onChange({ userState: v || null })}
            options={STATE_NAMES.map(({ code, name }) => ({ value: code, label: name }))}
            ariaLabel="State"
            error={attempted && formData.userState == null}
          />
        </FadeIn>.
      </p>

      {formData.filingStatus && formData.userState && (
        <FadeIn delay={0}>
          <div style={{ marginTop: "18px" }}>
            {isEmployerDHL && formData.dhlSite !== "WAREHOUSE" && !hasRates && formData.userState === "MO" && (
              <div style={{
                marginBottom: "12px", padding: "12px 14px",
                background: "rgba(0,200,150,0.05)", border: "1px solid rgba(0,200,150,0.15)",
                borderRadius: "10px",
              }}>
                <div className="text-sm" style={{ color: "var(--color-text-primary)", marginBottom: "4px" }}>
                  Load DHL Missouri supply chain reference rates
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-secondary)", lineHeight: 1.5, marginBottom: "10px" }}>
                  Night shift paystub-derived. Flagged as estimated until you confirm with your own stub.
                </div>
                <Pressable
                  onClick={loadDHLPreset}
                  className="text-2xs"
                  style={{
                    background: "rgba(0,200,150,0.10)", color: "var(--color-teal)",
                    border: "1px solid rgba(0,200,150,0.28)", borderRadius: "10px",
                    padding: "7px 14px", letterSpacing: "1.5px",
                    textTransform: "uppercase", cursor: "pointer",
                  }}
                >
                  Load DHL MO Preset
                </Pressable>
              </div>
            )}
            {!showCalc ? (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Pressable
                  onClick={() => setShowCalc(true)}
                  className="text-2xs"
                  style={{
                    background: "transparent", color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
                    padding: "7px 14px", letterSpacing: "1.5px",
                    textTransform: "uppercase", cursor: "pointer",
                  }}
                >
                  Recalculate Using Paystub
                </Pressable>
                <Pressable
                  onClick={handleEstimate}
                  className="text-2xs"
                  style={{
                    background: "transparent", color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
                    padding: "7px 14px", letterSpacing: "1.5px",
                    textTransform: "uppercase", cursor: "pointer",
                  }}
                >
                  Use Estimate for Now
                </Pressable>
              </div>
            ) : null}
            {!showCalc && attempted && !(formData.fedRateLow > 0) && (
              <div className="text-2xs" style={{ marginTop: "8px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--color-deduction)" }}>
                ↑ Required — set your tax rates from a paystub, an estimate, or the DHL preset above
              </div>
            )}
            {showCalc && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={calcBoxStyle}>
                  <div className="text-2xs" style={calcHdrStyle}>{isVariable ? "Shorter Week Paystub" : "Typical Paycheck"}</div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <CalcField label="Gross Pay ($)" value={g1} onChange={setG1} />
                    <CalcField label="Fed Withheld ($)" value={f1} onChange={setF1} />
                    {!isNoTax && <CalcField label="State Withheld ($)" value={s1} onChange={setS1} />}
                  </div>
                  {fed1 !== null && (
                    <div className="text-xs" style={{ color: "var(--color-green)" }}>
                      → Fed {pct(fed1)}{!isNoTax && sta1 != null ? `  ·  State ${pct(sta1)}` : ""}
                    </div>
                  )}
                </div>
                {isVariable && (
                  <div style={calcBoxStyle}>
                    <div className="text-2xs" style={calcHdrStyle}>Longer Week Paystub</div>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <CalcField label="Gross Pay ($)" value={g2} onChange={setG2} />
                      <CalcField label="Fed Withheld ($)" value={f2} onChange={setF2} />
                      {!isNoTax && <CalcField label="State Withheld ($)" value={s2} onChange={setS2} />}
                    </div>
                    {fed2 !== null && (
                      <div className="text-xs" style={{ color: "var(--color-green)" }}>
                        → Fed {pct(fed2)}{!isNoTax && sta2 != null ? `  ·  State ${pct(sta2)}` : ""}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {canApply && (
                    <Pressable
                      onClick={applyRates}
                      className="text-2xs"
                      style={{
                        background: "var(--color-green)", color: "var(--color-bg-base)",
                        border: "none", borderRadius: "12px", padding: "8px 16px",
                        letterSpacing: "2px", textTransform: "uppercase",
                        fontWeight: "bold", cursor: "pointer",
                      }}
                    >
                      Apply These Rates
                    </Pressable>
                  )}
                  <Pressable
                    onClick={handleEstimate}
                    className="text-2xs"
                    style={{
                      background: "transparent", color: "var(--color-text-primary)",
                      border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
                      padding: "8px 14px", letterSpacing: "1.5px",
                      textTransform: "uppercase", cursor: "pointer",
                    }}
                  >
                    Use Estimate for Now
                  </Pressable>
                </div>
              </div>
            )}
          </div>
        </FadeIn>
      )}
    </>
  );
}

// ── Page 4 (final): Wrap Up. STEP_DEFS id 7's isValid is always true — there's
// nothing to gate here, just a live paycheck summary plus the two optional,
// non-blocking settings real Step 7 offers (Paycheck Buffer, in the same
// inline-blank sentence style as every other page; the Tax-Exempt Week
// Projections opt-in gate is scoped out — like every other v1 scope-out on
// this pilot, it doesn't touch isValid, so omitting it can't break parity).
// estimateWeeklyNet() is the same authoritative function the real Wrap Up
// (and Home/Income) reads, so the numbers shown here are never a parallel
// approximation — see docs/active-systems.md §6 on why that matters. ──
// Straight copies of real StepWrapUp's TAX_EXEMPT_DISCLAIMER text and TaxExemptPreview
// placeholder component — see docs/active-systems.md §6's grounding rule for why this is a
// copy, not a re-derivation: there's no live data to ground here, just static disclosure
// copy, unlike every other Wrap Up figure on this page (estimateWeeklyNet()).
const TAX_EXEMPT_DISCLAIMER = (
  <>
    Tax-exempt weeks show your projected gross as the full net — no federal or state withholding is
    deducted. This is a <strong>timing benefit only</strong>. You still owe taxes at filing; these
    weeks do not represent extra income. The dashboard will flag them clearly so you can set aside
    the difference.
  </>
);

function TaxExemptPreview() {
  return (
    <div style={{
      background: "var(--color-bg-raised)", borderRadius: "12px", padding: "18px 16px",
      border: "1px solid var(--color-border-subtle)",
      display: "flex", flexDirection: "column", gap: "8px",
    }}>
      <div className="text-xs" style={{ color: "var(--color-text-primary)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
        Tax-Exempt Projections — Coming Soon
      </div>
      <div className="text-base" style={{ color: "var(--color-text-primary)", lineHeight: "1.6" }}>
        Thanks — we&rsquo;ve noted that you&rsquo;d like tax-exempt week projections. The feature is
        being finalized and will be turned on for your account once it&rsquo;s ready. Until then,
        your paychecks use standard withholding and nothing here changes.
      </div>
    </div>
  );
}

function WrapUpPage({ formData, onChange, lifeEvent = null, originalConfig = null }) {
  const { gross, fica, k401k, benefits, other, fed, state, net } = estimateWeeklyNet(formData);
  const checksPerYear = PAYCHECKS_PER_YEAR[formData.userPaySchedule ?? "weekly"] ?? 52;
  const perCheckFactor = 52 / checksPerYear;
  const fmt = n => `$${Math.abs(n).toFixed(2)}`;
  const bufferOn = formData.freedomAllowanceEnabled ?? true;
  const taxExemptAccepted = formData.taxExemptOptIn === true;

  const payScheduleLabel =
    formData.userPaySchedule === "biweekly" || formData.userPaySchedule === "salary"
      ? "per-check net"
      : formData.userPaySchedule === "monthly"
        ? "monthly net"
        : "weekly net";

  const rows = [
    { label: "Gross Pay", val: gross * perCheckFactor, sign: "" },
    { label: "Federal Tax", val: fed * perCheckFactor, sign: "−" },
    { label: "State Tax", val: state * perCheckFactor, sign: "−" },
    { label: "FICA", val: fica * perCheckFactor, sign: "−" },
    { label: "401(k)", val: k401k * perCheckFactor, sign: "−" },
    { label: "Benefits", val: benefits * perCheckFactor, sign: "−" },
    { label: "Other Deduct.", val: other * perCheckFactor, sign: "−" },
  ];

  const introText = "Here's my estimated";
  const bufferLeadText = "I";
  const bufferAmountText = "of $";

  return (
    <>
      {/* ── Structure-change diff (drift-app-warden §7 F140) — shown only on the
           structure_change flow, ported from real SetupWizard.jsx's own StepWrapUp gate
           (`lifeEvent === "structure_change"`). Never shows for changed_jobs, which reaches
           Wrap Up too but has no diff summary per the gate matrix. Reuses the exact same
           StructureChangeDiff component/DIFF_FIELDS list the real wizard renders — see this
           file's top-of-module import comment. ── */}
      {lifeEvent === "structure_change" && (
        <div style={{ marginBottom: "22px" }}>
          <StructureChangeDiff originalConfig={originalConfig} formData={formData} />
        </div>
      )}

      <p style={BLANK_FONT}>
        <TypedText text={introText} />{" "}
        <FadeIn delay={typeDuration(introText)}>
          <span style={{ color: "var(--color-teal)", fontWeight: 700 }}>{payScheduleLabel}</span>
        </FadeIn>.
      </p>

      <FadeIn delay={0}>
        <div style={calcBoxStyle}>
          {rows.map(r => (
            <div key={r.label} className="text-sm" style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-primary)" }}>
              <span>{r.label}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{r.sign} {fmt(r.val)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", marginTop: "4px", borderTop: "1px solid var(--color-border-subtle)" }}>
            <span className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>Net</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700,
              color: net >= 0 ? "var(--color-green)" : "var(--color-deduction)",
            }}>
              {fmt(net * perCheckFactor)}
            </span>
          </div>
        </div>

        <p style={{ ...BLANK_FONT, marginTop: "16px" }}>
          <TypedText text={bufferLeadText} />{" "}
          <FadeIn delay={typeDuration(bufferLeadText)}>
            <InlineSelect
              value={bufferOn ? "on" : "off"}
              onChange={v => onChange({ freedomAllowanceEnabled: v === "on" })}
              options={[{ value: "on", label: "want" }, { value: "off", label: "don't want" }]}
              ariaLabel="Paycheck buffer preference"
            />
          </FadeIn>{" "}
          <TypedText text="a paycheck buffer" />
          {bufferOn && (
            <>
              {" "}<TypedText text={bufferAmountText} />
              <FadeIn delay={typeDuration(bufferAmountText)}>
                <InlineNumber
                  value={formData.freedomAllowance ?? ""}
                  onChange={v => onChange({ freedomAllowance: v === "" ? null : Math.min(parseFloat(v) || 0, FREEDOM_ALLOWANCE_MAX) })}
                  placeholder="50"
                  width="56px"
                  ariaLabel="Paycheck buffer amount, dollars"
                />
              </FadeIn>{" "}
              <TypedText text="per check." />
            </>
          )}
          {!bufferOn && <TypedText text="." />}
        </p>

        {/* ── Tax-Exempt Week Projections — optional, non-blocking, mirrors real
             StepWrapUp's gate exactly (does not gate isWrapUpValid on either wizard). ── */}
        <div style={{ marginTop: "16px" }}>
          <div className="text-2xs" style={{ ...cardLabelStyle, marginBottom: "8px" }}>Tax-Exempt Week Projections</div>
          {!taxExemptAccepted ? (
            <div style={{
              background: "var(--color-bg-raised)", borderRadius: "12px", padding: "16px",
              border: "1px dashed rgba(0,200,150,0.3)",
              display: "flex", flexDirection: "column", gap: "10px",
            }}>
              <p className="text-sm" style={{ margin: 0, color: "var(--color-text-primary)", lineHeight: 1.6 }}>
                {TAX_EXEMPT_DISCLAIMER}
              </p>
              <Pressable
                onClick={() => onChange({ taxExemptOptIn: true })}
                className="text-2xs"
                style={{
                  background: "rgba(0,200,150,0.12)", color: "var(--color-teal)",
                  border: "1px solid rgba(0,200,150,0.4)", borderRadius: "10px",
                  padding: "7px 14px", letterSpacing: "1.5px",
                  fontWeight: 700, textTransform: "uppercase", cursor: "pointer",
                  alignSelf: "flex-start",
                }}
              >
                Request access
              </Pressable>
            </div>
          ) : (
            <TaxExemptPreview />
          )}
        </div>
      </FadeIn>
    </>
  );
}

// Jobless users skip Schedule, Deductions, Tax Rates, and Wrap Up entirely —
// same as the real wizard's isFirstRunJobless gate skipping STEP_DEFS id
// 2/3/4/7 outright.
const PAGES = [
  { id: "intake", isValid: isIntakeValid, Component: IntakePage },
  { id: "schedule", isValid: isScheduleValid, Component: SchedulePage },
  // skippable: true mirrors real STEP_DEFS id 3 (Deductions) — the only step the real
  // wizard lets a user bypass entirely (benefits/attendance answers are all optional to
  // the account, unlike Pay Structure/Schedule/Tax Rates). Missing this affordance was a
  // functional regression vs. the real wizard — see docs/TODO.md §19.1.A.
  { id: "deductions", isValid: isDeductionsValid, Component: DeductionsPage, skippable: true },
  { id: "taxRates", isValid: isTaxRatesValid, Component: TaxRatesPage },
  { id: "wrapUp", isValid: isWrapUpValid, Component: WrapUpPage },
];

// Which pages are shown for a given formData + lifeEvent — mirrors real STEP_DEFS'
// showIf/isFirstRunJobless gating (drift-app-warden §7 F139's gate-matrix extension):
//   - lifeEvent === null && startedUnemployed === true → jobless mini-flow hand-off,
//     Intake only (real wizard: STEP_DEFS id 0 → 10/11/12). Gated on lifeEvent === null
//     specifically — a lost_job/commission_job re-entry account can carry a stale
//     startedUnemployed: true from a prior first-run jobless answer without that meaning
//     anything on THIS re-entry (that field isn't asked/touched on any life-event path).
//   - lost_job / commission_job → every page except Wrap Up (real wizard: STEP_DEFS id
//     7's showIf excludes both — §7.3's gate matrix, "No" Wrap Up column).
//   - everything else (first-run employed, and — not yet ad-libbed — structure_change/
//     changed_jobs) → all five pages.
function computeActivePages(d, lifeEvent) {
  if (lifeEvent === null && d.startedUnemployed === true) return [PAGES[0]];
  if (lifeEvent === "lost_job" || lifeEvent === "commission_job") return PAGES.filter(p => p.id !== "wrapUp");
  return PAGES;
}

// onHandoff(mergedFormData, initialStepId) — used ONLY for the jobless mini-flow now.
// initialStepId is always 10 (Unemployment Benefits) when it fires — the only real-wizard
// steps left, since Welcome and Pay Structure are the only ones a jobless first-run even
// shows. App.jsx mounts the real SetupWizard at that step id; SetupWizard's own
// handleComplete() (which also runs through finalizeWizardConfig) owns the eventual save.
//
// onComplete(finalConfig) — fires once an EMPLOYED user finishes Wrap Up. formData is run
// through the same finalizeWizardConfig() helper SetupWizard.jsx's handleComplete() calls
// (src/lib/wizardComplete.js) before this fires, so App.jsx can hand finalConfig straight to
// handleWizardComplete() — no re-normalization needed on the App.jsx side.
//
// resumeFormData (optional): when the user already answered these pages, handed off into the
// real wizard's jobless mini-flow, and then hit Back at the real wizard's very first step,
// App.jsx reopens this component with the in-progress answers instead of the blanked
// defaults, and resumes on the last page instead of page 0 — so Back lands them where they
// left off in the ad-lib UI, not on the real wizard's stacked-field view of the same steps.
//
// isInvestor (optional): mirrors SetupWizard.jsx's investor handling field-for-field — see
// this file's header comment and IntakePage's isInvestor branches.
//
// lifeEvent (optional, default null): null (first-run) | "structure_change" | "lost_job" |
// "changed_jobs" | "commission_job" — mirrors SetupWizard.jsx's own lifeEvent prop contract
// (drift-app-warden §7 F139). Only null, "lost_job", and "commission_job" are wired through
// App.jsx to this component today — "structure_change"/"changed_jobs" still route to the real
// SetupWizard.jsx unchanged (a later round). Passing a non-null lifeEvent changes formData
// init (no BLANK_PAY_FIELDS — pre-filled from the real config, matching SetupWizard.jsx's own
// re-entry behavior), skips the employment-status question entirely (isIntakeValid/IntakePage
// both gate on lifeEvent === null for that check), and excludes Wrap Up from activePages for
// lost_job/commission_job specifically (both end after Tax Rates per the gate matrix).
//
// onCancel (optional): pass undefined for a real first-run, non-investor signup — no escape
// hatch, matching SetupWizard's own uncancelable-first-run rule (drift-app-warden §7.3). Every
// life-event re-entry (lifeEvent !== null) IS cancelable, same as the real wizard — App.jsx
// must pass a real closing function, not undefined, for those. The Cancel button only renders
// when onCancel is provided.
export function SetupWizardAdlib({ config, onHandoff, onComplete, onCancel, resumeFormData = null, isInvestor = false, lifeEvent = null }) {
  // Internal life-event pivot (drift-app-warden §7 F140) — mirrors real SetupWizard.jsx's own
  // local `[lifeEvent, setLifeEvent]` state (there seeded from its own `initialLifeEvent` prop).
  // `lifeEvent` (the prop above) never changes after mount — it's the wizard's original entry
  // point, used only for formData init (pre-fill vs. blank) and the jobless-mini-flow gates
  // below, both of which are invariant across a pivot. `curLifeEvent` is what every page/gate
  // downstream actually reacts to once the wizard is open — it starts equal to `lifeEvent` and
  // changes only via LifeEventPivot's picker (IntakePage, gated on `onLifeEventChange` being
  // passed at all, which only happens when the original entry was "structure_change").
  const [curLifeEvent, setCurLifeEvent] = useState(lifeEvent);
  // Frozen baseline for the structure_change "What's Changing" diff (item 3) — captured once
  // at mount, before any edits, exactly like real SetupWizard.jsx's `originalConfig` useMemo.
  // Irrelevant (never read) for any other lifeEvent value.
  const [originalConfig] = useState(() => config);
  const [formData, setFormData] = useState(() => {
    if (resumeFormData) return resumeFormData;
    if (lifeEvent !== null) {
      // Re-entry: pre-filled from the account's real existing config — NOT blanked. Mirrors
      // real SetupWizard.jsx's own re-entry formData init exactly, including its
      // firstActiveIdx recompute (real wizard does this unconditionally on every open; a
      // no-op here for first-run since BLANK_PAY_FIELDS already nulls startDate).
      const base = isInvestor
        ? { ...config, employerPreset: null, otThreshold: config.otThreshold || 40, maxWeeklyHours: config.maxWeeklyHours || config.standardWeeklyHours || 40 }
        : { ...config };
      if (base.startDate) base.firstActiveIdx = dateToWeekIdx(base.startDate);
      return base;
    }
    const base = isInvestor
      ? { ...config, ...BLANK_PAY_FIELDS, employerPreset: null, otThreshold: config.otThreshold || 40, maxWeeklyHours: config.maxWeeklyHours || config.standardWeeklyHours || 40 }
      : { ...config, ...BLANK_PAY_FIELDS };
    return base;
  });
  const [pageIdx, setPageIdx] = useState(() => {
    if (!resumeFormData) return 0;
    const pages = computeActivePages(resumeFormData, lifeEvent);
    return pages.length - 1;
  });
  const [stepDir, setStepDir] = useState(1);
  const [attempted, setAttempted] = useState(false);

  // Skipping straight to a single-page flow once "unemployed" is chosen —
  // Schedule is irrelevant for the jobless mini-flow, same as the real
  // wizard's isFirstRunJobless gate skipping it entirely. lost_job/commission_job
  // exclude Wrap Up instead — see computeActivePages. Gated on curLifeEvent, not the
  // original lifeEvent prop, so a structure_change → lost_job/commission_job pivot
  // immediately reshapes the page set (drift-app-warden §7 F140).
  const activePages = computeActivePages(formData, curLifeEvent);
  const current = activePages[pageIdx];
  const isLast = pageIdx === activePages.length - 1;
  const canProceed = current?.isValid(formData, curLifeEvent) ?? false;
  const progressPct = ((pageIdx + 1) / activePages.length) * 100;

  function update(patch) {
    setFormData(prev => ({ ...prev, ...patch }));
  }

  function finishEmployed() {
    // Shared normalizer (src/lib/wizardComplete.js) — see docs/drift-app-warden.md §7 F5/F13.
    // config is the prior/original config (undefined for a real first-run account, which is
    // correct — finalizeWizardConfig treats a missing priorConfig as "tips were never on").
    onComplete(finalizeWizardConfig(formData, config));
  }

  function handleNext() {
    if (!canProceed) { setAttempted(true); return; }
    setAttempted(false);
    if (!isLast) { setStepDir(1); setPageIdx(i => i + 1); return; }
    // Jobless hand-off is first-run only (lifeEvent === null) — see computeActivePages'
    // own comment on why this check can't just read startedUnemployed alone.
    if (lifeEvent === null && formData.startedUnemployed === true) { onHandoff(formData, 10); return; }
    finishEmployed();
  }

  // Mirrors real STEP_DEFS id 3's skippable:true — only the Deductions page offers this.
  // Bypasses the current page's required-field gate entirely (unlike handleNext, which
  // enforces it) since a skipped page's answers are, by definition, optional.
  function handleSkip() {
    setAttempted(false);
    if (!isLast) { setStepDir(1); setPageIdx(i => i + 1); return; }
    if (lifeEvent === null && formData.startedUnemployed === true) { onHandoff(formData, 10); return; }
    finishEmployed();
  }

  function handleBack() {
    setAttempted(false);
    if (pageIdx > 0) { setStepDir(-1); setPageIdx(i => i - 1); }
  }

  return (
    <div className="fold-lift" data-fold="entering" style={{
      position: "fixed", inset: 0, background: "var(--color-bg-base)",
      display: "flex", flexDirection: "column", alignItems: "stretch",
      paddingTop: "max(16px, env(safe-area-inset-top))", paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      zIndex: 100,
    }}>
      <div style={{ padding: "20px max(16px, env(safe-area-inset-left)) 0 max(16px, env(safe-area-inset-right))", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: "720px", margin: "0 auto" }}>
          <div className="text-2xs" style={{ letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-teal)" }}>
            {curLifeEvent === null ? "Setup" : "Life Event"} · {pageIdx + 1} of {activePages.length}
          </div>
        </div>
        <div style={{ marginTop: "10px", height: "3px", borderRadius: "2px", background: "var(--color-border-subtle)", maxWidth: "720px", margin: "10px auto 0" }}>
          <div style={{ height: "100%", borderRadius: "2px", background: "var(--color-teal)", width: `${progressPct}%`, transition: "width 0.3s ease" }} />
        </div>
      </div>

      <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "28px max(16px, env(safe-area-inset-left)) 28px max(16px, env(safe-area-inset-right))" }}>
        <div style={{ width: "100%", maxWidth: "720px" }}>
          <StepSlide stepKey={pageIdx} direction={stepDir}>
            {current && (
              <current.Component
                formData={formData}
                onChange={update}
                isInvestor={isInvestor}
                attempted={attempted}
                lifeEvent={curLifeEvent}
                onLifeEventChange={lifeEvent === "structure_change" ? setCurLifeEvent : null}
                originalConfig={originalConfig}
              />
            )}
          </StepSlide>
        </div>
      </div>

      <div style={{ padding: "14px max(16px, env(safe-area-inset-left)) 20px max(16px, env(safe-area-inset-right))", flexShrink: 0, display: "flex", gap: "10px", justifyContent: "center", borderTop: "1px solid var(--color-border-subtle)" }}>
        <div style={{ display: "flex", gap: "10px", width: "100%", maxWidth: "720px" }}>
          {onCancel && (
            <Pressable
              onClick={onCancel}
              className="text-xs" style={{ marginRight: "auto", background: "var(--color-bg-raised)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "7px 14px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
            >
              Cancel
            </Pressable>
          )}
          {pageIdx > 0 && (
            <Pressable
              onClick={handleBack}
              className="text-xs" style={{ marginLeft: onCancel ? 0 : "auto", background: "var(--color-bg-raised)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "8px 16px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
            >
              Back
            </Pressable>
          )}
          {current?.skippable && (
            <Pressable
              onClick={handleSkip}
              className="text-xs" style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "8px 16px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
            >
              Skip
            </Pressable>
          )}
          <Pressable
            onClick={handleNext}
            disabled={!canProceed}
            className="text-xs" style={{
              background: canProceed ? "var(--color-teal)" : "var(--color-bg-raised)",
              color: canProceed ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 22px",
              letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold",
              cursor: canProceed ? "pointer" : "not-allowed",
              marginLeft: (!onCancel && pageIdx === 0 && !current?.skippable) ? "auto" : 0,
            }}
          >
            {!isLast ? "Next" : (lifeEvent === null && formData.startedUnemployed === true) ? "Continue Setup →" : "Finish Setup"}
          </Pressable>
        </div>
      </div>
    </div>
  );
}
