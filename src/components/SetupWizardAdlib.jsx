import { useState } from "react";
import { Pressable } from "./ui.jsx";
import { DHL_PRESET } from "../constants/config.js";

// ─────────────────────────────────────────────────────────────────────────────
// SetupWizardAdlib.jsx — experimental "fill-in-the-blank" pilot for the first
// two SetupWizard steps (Welcome + Pay Structure), collapsed onto one page.
// Admin-only preview, gated behind the "Ad-Lib Preview" toggle in App.jsx —
// never shown to real users.
//
// One continuous mad-libs sentence with inline blanks (native <select>/<input>
// styled to sit inline in the text). Each new clause rolls onto the page — a
// crisp stepped typewriter reveal on the text, then a quick fade-in on the
// blank that follows it — the moment the answer it depends on is given,
// instead of the usual Next-button-per-page navigation. Reuses the exact same
// config fields and DHL-preset defaults the real SetupWizard.jsx Step0/Step1
// apply, so onHandoff can seed the real wizard (via its initialStepId prop)
// for the remaining steps with zero drift between the two experiences.
//
// MOCK ONLY — nothing from this preview, including the handed-off real-wizard
// continuation, is ever saved. App.jsx's onComplete for that hand-off skips
// handleWizardComplete entirely (no setConfig, no savePersistedStateNow) as
// long as adlibHandoff is set, so admins can click all the way through to
// tune the feel with zero risk to real account data.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK_FONT = {
  fontSize: "26px", lineHeight: 1.9, fontWeight: 600,
  color: "var(--color-text-primary)", fontFamily: "var(--font-display)",
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
function TypedText({ text, delay = 0 }) {
  const duration = typeDuration(text);
  return (
    <span
      style={{
        display: "inline-block", whiteSpace: "pre", overflow: "hidden",
        animation: `adlibType ${duration}s steps(${Math.max(text.length, 1)}, end) ${delay}s both, fadeSlideUp 0.3s ease-out ${delay}s both`,
      }}
    >
      {text}
    </span>
  );
}

// Fades a blank in right after the text immediately preceding it finishes typing.
function FadeIn({ children, delay = 0 }) {
  return (
    <span style={{ display: "inline-block", animation: `fadeSlideUp 0.3s ease-out ${delay}s both` }}>
      {children}
    </span>
  );
}

function InlineSelect({ value, onChange, options, placeholder = "(select)" }) {
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
        font: "inherit", fontWeight: 700, fontStyle: hasValue ? "normal" : "italic",
        textAlign: "center", padding: "0 4px", margin: "0 2px", cursor: "pointer",
      }}
    >
      {/* Kept as a real (non-disabled) option, not just a pre-selection placeholder — lets the
          user explicitly pick back to blank after choosing something, same as any other option. */}
      <option value="" disabled={false}>{placeholder}</option>
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

// Combined mandatory-field gate for the single merged page — mirrors STEP_DEFS
// id 0 (Welcome) + id 1 (Pay Structure) in SetupWizard.jsx exactly.
function isFormValid(d) {
  if (d.startedUnemployed !== true && d.startedUnemployed !== false) return false;
  if (d.startedUnemployed === true) return true;
  if (!d.userPaySchedule) return false;
  if (d.employerPreset === "DHL" && !d.dhlTeam) return false;
  if (d.userPaySchedule === "salary") return (d.annualSalary ?? 0) > 0;
  return (d.baseRate ?? 0) > 0 && (d.shiftHours ?? 0) > 0;
}

// Fields this single merged page asks about — blanked on a fresh open (below)
// rather than carried over from the admin's real config, so isFormValid's
// mandatory-field gate actually has something to gate. Pre-filling from `config`
// (the admin's own real answers) made every field already "answered" before
// the admin touched anything, silently bypassing both the blank look and the
// required-field check.
const BLANK_PAY_FIELDS = {
  startedUnemployed: null, employerPreset: null, dhlTeam: null,
  dhlNightShift: null, nightDiffRate: null, userPaySchedule: null,
  annualSalary: null, baseRate: null, shiftHours: null,
  otThreshold: null, otMultiplier: null, payPeriodEndDay: null,
  scheduleIsVariable: null, bucketStartBalance: null, bucketCap: null,
  bucketPayoutRate: null, diffRate: null, startingWeekIsLong: null,
};

// The single merged sentence — Welcome + Pay Structure cascading onto one page,
// each clause rolling in as soon as the answer it depends on is given.
function IntakePage({ formData, onChange }) {
  // employerPreset is only ever "DHL" | null in this app's real model — null alone
  // can't distinguish "hasn't answered yet" from "explicitly chose someone else",
  // so track which blank the user picked as local UI state (mirrors real Step1's
  // gateTouched flag). Re-derives "OTHER" on a resumed formData that already has
  // userPaySchedule answered without employerPreset === "DHL".
  const [employerChoice, setEmployerChoice] = useState(() =>
    formData.employerPreset === "DHL" ? "DHL" : formData.userPaySchedule ? "OTHER" : ""
  );
  const isEmployerDHL = employerChoice === "DHL";
  const isSalary = formData.userPaySchedule === "salary";
  const isEmployed = formData.startedUnemployed === false;

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

  const introText = "Let's set you up. Right now, I am";
  const workForText = "I work for";
  const onTeamText = "I'm on Team";
  const workingTheText = "working the";
  const shiftPaidText = "shift, paid";
  const iGetPaidText = "I get paid";
  const mySalaryText = "My salary is $";
  const aYearText = "a year.";
  const myRateText = "My rate is $";
  const shiftsRunText = "an hour, and my shifts run";
  const hoursText = "hours.";

  return (
    <p style={BLANK_FONT}>
      <TypedText text={introText} />{" "}
      <FadeIn delay={typeDuration(introText)}>
        <InlineSelect
          value={formData.startedUnemployed === true ? "unemployed" : formData.startedUnemployed === false ? "employed" : ""}
          onChange={v => onChange({ startedUnemployed: v === "" ? null : v === "unemployed" })}
          options={[{ value: "employed", label: "employed" }, { value: "unemployed", label: "unemployed" }]}
        />
      </FadeIn>.
      {isEmployed && (
        <>
          {" "}<TypedText text={workForText} />{" "}
          <FadeIn delay={typeDuration(workForText)}>
            <InlineSelect
              value={employerChoice}
              onChange={setEmployer}
              options={[{ value: "DHL", label: "DHL" }, { value: "OTHER", label: "someone else" }]}
            />
          </FadeIn>.
          {isEmployerDHL && (
            <>
              {" "}<TypedText text={onTeamText} />{" "}
              <FadeIn delay={typeDuration(onTeamText)}>
                <InlineSelect
                  value={formData.dhlTeam ?? ""}
                  onChange={t => onChange(t === "" ? { dhlTeam: null } : pickTeamPatch(t))}
                  options={[{ value: "A", label: "A" }, { value: "B", label: "B" }]}
                />
              </FadeIn>
              {formData.dhlTeam && (
                <>
                  , <TypedText text={workingTheText} />{" "}
                  <FadeIn delay={typeDuration(workingTheText)}>
                    <InlineSelect
                      value={formData.dhlNightShift === false ? "morning" : formData.dhlNightShift === true ? "night" : ""}
                      onChange={v => onChange(v === "" ? { dhlNightShift: null, nightDiffRate: null } : { dhlNightShift: v === "night", nightDiffRate: v === "night" ? 1.50 : 0 })}
                      options={[{ value: "night", label: "night" }, { value: "morning", label: "morning" }]}
                    />
                  </FadeIn>{" "}
                  <TypedText text={shiftPaidText} />{" "}
                  <FadeIn delay={typeDuration(shiftPaidText)}>
                    <InlineSelect
                      value={formData.userPaySchedule ?? ""}
                      onChange={v => onChange({ userPaySchedule: v === "" ? null : v, annualSalary: null })}
                      options={[{ value: "weekly", label: "weekly" }, { value: "salary", label: "every two weeks" }]}
                    />
                  </FadeIn>.
                </>
              )}
            </>
          )}
          {employerChoice === "OTHER" && (
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
                    />
                  </FadeIn>{" "}
                  <TypedText text={shiftsRunText} />{" "}
                  <FadeIn delay={typeDuration(shiftsRunText)}>
                    <InlineNumber
                      value={formData.shiftHours ?? ""}
                      onChange={v => onChange({ shiftHours: v === "" ? null : parseFloat(v) })}
                      placeholder="10"
                      width="52px"
                    />
                  </FadeIn>{" "}
                  <TypedText text={hoursText} />
                </>
              ))}
            </>
          )}
        </>
      )}
    </p>
  );
}

// onHandoff(mergedFormData, initialStepId) — called once the page is fully
// answered. initialStepId targets the real SetupWizard's jobless mini-flow
// (id 10) when unemployed, else Schedule (id 2) — see SetupWizard.jsx's
// initialStepId prop.
//
// resumeFormData (optional): when the admin already answered this page, handed off
// into the real wizard, and then hit Back at the real wizard's very first step, App.jsx
// reopens this component with the in-progress answers instead of the blanked defaults
// — so Back lands them where they left off in the ad-lib UI, not on the real wizard's
// stacked-field view of the same steps.
export function SetupWizardAdlib({ config, onHandoff, onCancel, resumeFormData = null }) {
  const [formData, setFormData] = useState(() => resumeFormData ?? { ...config, ...BLANK_PAY_FIELDS });
  const canProceed = isFormValid(formData);

  function update(patch) {
    setFormData(prev => ({ ...prev, ...patch }));
  }

  function handleContinue() {
    if (!canProceed) return;
    onHandoff(formData, formData.startedUnemployed === true ? 10 : 2);
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
        <div style={{ padding: "24px 28px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-teal)" }}>
              Ad-Lib Preview
            </div>
            <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-warning)", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "6px", padding: "2px 8px" }}>
              Admin Only · Not Saved
            </div>
          </div>
        </div>

        <div style={{ flex: "1 1 0", minHeight: 0, overflowY: "auto", display: "flex", alignItems: "center", padding: "28px 32px" }}>
          <IntakePage formData={formData} onChange={update} />
        </div>

        <div style={{ padding: "14px 24px 20px", flexShrink: 0, display: "flex", gap: "10px", justifyContent: "flex-end", borderTop: "1px solid var(--color-border-subtle)" }}>
          <Pressable
            onClick={onCancel}
            style={{ marginRight: "auto", background: "var(--color-bg-raised)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "7px 14px", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
          >
            Exit Preview
          </Pressable>
          <Pressable
            onClick={handleContinue}
            disabled={!canProceed}
            style={{
              background: canProceed ? "var(--color-teal)" : "var(--color-bg-raised)",
              color: canProceed ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 22px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold",
              cursor: canProceed ? "pointer" : "not-allowed",
            }}
          >
            Continue Setup →
          </Pressable>
        </div>
      </div>
    </div>
  );
}
