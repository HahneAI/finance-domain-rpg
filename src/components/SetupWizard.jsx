// ─────────────────────────────────────────────────────────────────────────────
// SetupWizard.jsx — multi-step onboarding wizard
//
// BUILD STATUS (as of 2026-03-24)
//
// 6-step wizard (consolidated from original 10):
//   Step 0  Welcome / Life Event select
//   Step 1  Pay Structure — base rate, shift, OT + DHL team/shift/rotation (merged from Step 15)
//   Step 2  Schedule — job start date, rotation week, pay period close day
//   Step 3  Deductions — benefits, start date, other deductions, attendance gate (merged from Step 6)
//   Step 4  Tax Rates — state, paystub calc, rate summary w/ FICA + std deduction (Step 5 absorbed)
//   Step 7  Wrap Up — live net preview, paycheck buffer, tax exempt gate (Steps 7+8 merged)
//
// Steps 5, 6, 8, 15 removed from STEP_DEFS — content folded into adjacent steps.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { buildYear, dhlEmployerMatchRate } from "../lib/finance.js";
import { iS, lS } from "./ui.jsx";
import { FISCAL_YEAR_START, DHL_PRESET, BENEFIT_OPTIONS, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { FISCAL_WEEKS_PER_YEAR } from "../lib/fiscalWeek.js";

import { STATE_TAX_TABLE, STATE_NAMES } from "../constants/stateTaxTable.js";

const BUFFER_MAX = 200;

// ─────────────────────────────────────────────────────────────────────────────
// STEP 0 — Welcome (first-run) / Life Event Select (re-entry)
// ─────────────────────────────────────────────────────────────────────────────
const LIFE_EVENTS = [
  { value: "lost_job",      label: "Lost my job",            sub: "Updates pay structure, schedule, deductions, and tax rates" },
  { value: "changed_jobs",  label: "Changed jobs",           sub: "Full re-setup — FICA and tax strategy pre-filled from current config" },
  { value: "commission_job", label: "Got a commission job",  sub: "Adds commission income to your pay structure" },
];

function Step0({ lifeEvent, onLifeEventChange, formData, isInvestor = false }) {
  // ── First-run ──────────────────────────────────────────────────────────────
  if (lifeEvent === null) {
    const firstName = isInvestor ? (formData?.investorName ?? "").split(" ")[0] : "";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {isInvestor && firstName && (
          <p style={{
            fontSize: "15px", lineHeight: "1.5",
            color: "var(--color-text-primary)", margin: 0, fontWeight: 600,
          }}>
            Welcome, {firstName}.
          </p>
        )}
        <p style={{
          fontSize: "14px", lineHeight: "1.6",
          color: "var(--color-text-secondary)", margin: 0,
        }}>
          Set up your pay in a few steps. Update anything later from Life Events.
        </p>
        <p style={{
          fontSize: "12px", lineHeight: "1.6",
          color: "var(--color-text-secondary)", margin: 0,
        }}>
          Have these handy: a recent paystub (for tax rates), your overtime policy, and PTO details if applicable.
        </p>
      </div>
    );
  }

  // ── Re-entry ───────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <p style={{
        fontSize: "13px", color: "var(--color-text-secondary)",
        margin: "0 0 4px",
      }}>
        What changed? Only the affected steps will be updated — everything else stays as-is.
      </p>
      {LIFE_EVENTS.map(ev => {
        const active = lifeEvent === ev.value;
        return (
          <button
            key={ev.value}
            onClick={() => onLifeEventChange(ev.value)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "flex-start",
              gap: "3px", textAlign: "left",
              background: active ? "rgba(0,200,150,0.08)" : "var(--color-bg-raised)",
              border: `1px solid ${active ? "rgba(0,200,150,0.28)" : "var(--color-border-subtle)"}`,
              borderRadius: "12px",
              padding: "12px 14px",
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <span style={{
              fontSize: "13px", fontWeight: "600",
              color: active ? "var(--color-gold)" : "var(--color-text-primary)",
            }}>
              {active && "✓ "}{ev.label}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-text-disabled)" }}>
              {ev.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — shared across step components
// ─────────────────────────────────────────────────────────────────────────────
function Pill({ label, active, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: "7px 14px",
        fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase",
        background: disabled ? "var(--color-bg-base)" : active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
        color: disabled ? "var(--color-text-disabled)" : active ? "var(--color-gold)" : "var(--color-text-secondary)",
        border: `1px solid ${disabled ? "var(--color-bg-raised)" : active ? "rgba(0,200,150,0.28)" : "var(--color-border-subtle)"}`,
        borderRadius: "10px", cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      {!disabled && active && "✓ "}{label}
    </button>
  );
}

function FieldRow({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
      {children}
    </div>
  );
}

function Field({ label, children, error }) {
  return (
    <div>
      <label style={{ ...lS, ...(error ? { color: "var(--color-deduction)" } : {}) }}>{label}</label>
      {children}
      {error && (
        <div style={{ fontSize: "10px", color: "var(--color-deduction)", marginTop: "4px", display: "flex", alignItems: "center", gap: "3px" }}>
          ↑ {error}
        </div>
      )}
    </div>
  );
}

function errBorder(show) {
  return show ? { border: "1px solid var(--color-deduction)" } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Pay Structure
// ─────────────────────────────────────────────────────────────────────────────
const OT_THRESHOLDS = [40, 48];
const OT_MULTIPLIERS = [1.5, 2];

function Step1({ formData, onChange, lifeEvent, attempted, isInvestor = false }) {
  // Gate: has the user answered "Do you work for DHL?" yet?
  // Investor accounts skip the gate entirely — always treated as base user.
  const [gateTouched, setGateTouched] = useState(
    isInvestor || formData.employerPreset === "DHL" || formData.setupComplete === true
  );

  // Local tracking for custom OT threshold input
  const [otCustom, setOtCustom] = useState(
    formData.otThreshold !== null && !OT_THRESHOLDS.includes(formData.otThreshold)
  );

  // Commission toggle
  const [hasCommission, setHasCommission] = useState(
    (formData.commissionMonthly ?? 0) > 0
  );

  // String drafts for per-week custom hours — allow blank display while typing.
  // formData stores 0 as sentinel for "custom mode, field blank" so isValid can catch it.
  const [longHoursDraft, setLongHoursDraft] = useState(
    formData.customWeeklyHoursLong > 0
      ? String(formData.customWeeklyHoursLong)
      : (formData.customWeeklyHours > 0 ? String(formData.customWeeklyHours) : "")
  );
  const [shortHoursDraft, setShortHoursDraft] = useState(
    formData.customWeeklyHoursShort > 0
      ? String(formData.customWeeklyHoursShort)
      : (formData.customWeeklyHours > 0 ? String(formData.customWeeklyHours) : "")
  );

  const isEmployerDHL    = formData.employerPreset === "DHL";
  const isBaseUser = !isEmployerDHL;
  const isSalary = formData.userPaySchedule === "salary";

  function setDHL(yes) {
    setGateTouched(true);
    if (yes) {
      onChange({
        employerPreset: "DHL",
        otThreshold: 40,
        otMultiplier: 1.5,
        payPeriodEndDay: 0,
        scheduleIsVariable: true,
        bucketStartBalance: 64,
        bucketCap: 128,
        bucketPayoutRate: 9.825,
      });
    } else {
      onChange({ employerPreset: null, userPaySchedule: null, diffRate: 0, scheduleIsVariable: false });
    }
  }

  function pickTeam(t) {
    const preset = DHL_PRESET.teams[t];
    const d      = DHL_PRESET.defaults;
    onChange({
      dhlTeam:            t,
      startingWeekIsLong: preset.startsLong,
      shiftHours:         d.shiftHours,
      otThreshold:        d.otThreshold,
      otMultiplier:       d.otMultiplier,
      scheduleIsVariable: d.scheduleIsVariable,
      payPeriodEndDay:    d.payPeriodEndDay,
      bucketStartBalance: d.bucketStartBalance,
      bucketCap:          d.bucketCap,
      bucketPayoutRate:   d.bucketPayoutRate,
      userPaySchedule:    null,  // force explicit selection after team pick
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Employer Preset Gate (hidden for investor accounts) ── */}
      {!isInvestor && (
        <Field label="Do you work for DHL?">
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <Pill label="Yes" active={isEmployerDHL} onClick={() => setDHL(true)} />
            <Pill label="No"  active={gateTouched && isBaseUser} onClick={() => setDHL(false)} />
          </div>
          {isEmployerDHL && (
            <div style={{
              marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)",
              lineHeight: "1.5",
            }}>
              Rotation, attendance, and dual-rate auto-configured. Weekend rate pre-filled.
            </div>
          )}
        </Field>
      )}

      {/* ── DHL: Team + shift ── */}
      {isEmployerDHL && (
        <>
          <Field label="Which DHL team are you on?">
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <Pill label="Team A" active={formData.dhlTeam === "A"} onClick={() => pickTeam("A")} />
              <Pill label="Team B" active={formData.dhlTeam === "B"} onClick={() => pickTeam("B")} />
            </div>
            {formData.dhlTeam && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
                {DHL_PRESET.teams[formData.dhlTeam].startsLong
                  ? `${DHL_PRESET.rotation.long.label} (your first active week)`
                  : `${DHL_PRESET.rotation.short.label} (your first active week)`}. Teams alternate every week.
              </div>
            )}
            {!formData.dhlTeam && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
                Team A starts short (Mon / Thu / Fri). Team B starts long (Tue / Wed / Sat / Sun).
              </div>
            )}
          </Field>

          <Field label="Which shift do you work?">
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <Pill
                label="Night shift (+diff)"
                active={formData.dhlNightShift !== false}
                onClick={() => onChange({ dhlNightShift: true, nightDiffRate: 1.50 })}
              />
              <Pill
                label="Morning shift"
                active={formData.dhlNightShift === false}
                onClick={() => onChange({ dhlNightShift: false, nightDiffRate: 0 })}
              />
            </div>
            <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
              Night shift adds +$1.50/hr on all hours (stacks with weekend differential).
            </div>
          </Field>

          <Field label="Do you follow the standard DHL rotation?">
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
              <Pill
                label="Standard rotation"
                active={formData.customWeeklyHours == null}
                onClick={() => {
                  onChange({
                    customWeeklyHours: null,
                    customWeeklyHoursLong: null,
                    customWeeklyHoursShort: null,
                    dhlCustomSchedule: false,
                  });
                  setLongHoursDraft("");
                  setShortHoursDraft("");
                }}
              />
              <Pill
                label="Custom schedule"
                active={formData.customWeeklyHours != null}
                onClick={() => {
                  const fallback = (formData.customWeeklyHours ?? 0) > 0 ? formData.customWeeklyHours : 60;
                  const longV = (formData.customWeeklyHoursLong ?? 0) > 0 ? formData.customWeeklyHoursLong : fallback;
                  const shortV = (formData.customWeeklyHoursShort ?? 0) > 0 ? formData.customWeeklyHoursShort : fallback;
                  onChange({
                    customWeeklyHours: fallback,
                    customWeeklyHoursLong: longV,
                    customWeeklyHoursShort: shortV,
                    dhlCustomSchedule: false,
                  });
                  setLongHoursDraft(String(longV));
                  setShortHoursDraft(String(shortV));
                }}
              />
            </div>
            {formData.customWeeklyHours != null ? (
              <div style={{ marginTop: "10px" }}>
                <label style={{ ...lS, ...(attempted && (formData.customWeeklyHoursLong === 0 || formData.customWeeklyHoursShort === 0) ? { color: "var(--color-deduction)" } : {}) }}>Hours per week</label>
                <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--color-text-secondary)" }}>Long week</div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="168"
                  value={longHoursDraft}
                  onChange={e => {
                    setLongHoursDraft(e.target.value);
                    const n = parseFloat(e.target.value);
                    onChange({ customWeeklyHoursLong: (!isNaN(n) && n > 0) ? n : 0, dhlCustomSchedule: false });
                  }}
                  style={{ ...iS, marginTop: "4px", ...errBorder(attempted && formData.customWeeklyHoursLong === 0) }}
                />
                <div style={{ marginTop: "4px", fontSize: "11px", color: "var(--color-text-secondary)" }}>Short week</div>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="168"
                  value={shortHoursDraft}
                  onChange={e => {
                    setShortHoursDraft(e.target.value);
                    const n = parseFloat(e.target.value);
                    onChange({ customWeeklyHoursShort: (!isNaN(n) && n > 0) ? n : 0, dhlCustomSchedule: false });
                  }}
                  style={{ ...iS, marginTop: "6px", ...errBorder(attempted && formData.customWeeklyHoursShort === 0) }}
                />
                {attempted && (formData.customWeeklyHoursLong === 0 || formData.customWeeklyHoursShort === 0) && (
                  <div style={{ fontSize: "10px", color: "var(--color-deduction)", marginTop: "4px", display: "flex", alignItems: "center", gap: "3px" }}>↑ Required</div>
                )}
                <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
                  Projections use long/short targets by week type. DHL rotation still shows scheduled days in weekly confirmation.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
                Override per-week from Income for extra shifts.
              </div>
            )}
          </Field>

        </>
      )}

      {/* ── Pay fields (shown once gate answered) ── */}
      {gateTouched && (
        <>
          {/* ── Pay Schedule ── */}
          {(isBaseUser || formData.dhlTeam) && <Field label="How do you get paid?" error={attempted && !formData.userPaySchedule ? "Select a pay schedule" : null}>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap", alignItems: "center" }}>
              {isEmployerDHL ? (
                <>
                  <Pill label="Weekly"            active={formData.userPaySchedule === "weekly"} onClick={() => onChange({ userPaySchedule: "weekly",  annualSalary: null })} />
                  <Pill label="Salary (Biweekly)" active={formData.userPaySchedule === "salary"} onClick={() => onChange({ userPaySchedule: "salary" })} />
                </>
              ) : (
                <>
                  <Pill label="Weekly"     active={formData.userPaySchedule === "weekly"}    onClick={() => onChange({ userPaySchedule: "weekly",    annualSalary: null })} />
                  <Pill label="Biweekly"   active={formData.userPaySchedule === "biweekly"}  onClick={() => onChange({ userPaySchedule: "biweekly",  annualSalary: null })} />
                  <Pill label="Monthly"    active={formData.userPaySchedule === "monthly"}   onClick={() => onChange({ userPaySchedule: "monthly",   annualSalary: null })} />
                  <Pill label="Salary"     active={formData.userPaySchedule === "salary"}    onClick={() => onChange({ userPaySchedule: "salary" })} />
                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <Pill label="Commission Only" active={false} onClick={() => {}} disabled />
                    <span style={{ fontSize: "9px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-disabled)", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "4px", padding: "2px 5px" }}>Soon</span>
                  </div>
                </>
              )}
            </div>
            {isSalary && (
              <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
                Paid every 2 weeks. Enter your annual salary and we'll derive your base rate.
              </div>
            )}
          </Field>}

          {/* ── Rate fields — salary vs hourly ── */}
          {isSalary ? (
            <Field label="Annual Salary ($)" error={attempted && !((formData.annualSalary ?? 0) > 0) ? "Enter your annual salary" : null}>
              <input
                style={{ ...iS, ...errBorder(attempted && !((formData.annualSalary ?? 0) > 0)) }}
                type="number" min="0" step="1000"
                value={formData.annualSalary ?? ""}
                onChange={e => {
                  const sal = e.target.value === "" ? null : parseFloat(e.target.value);
                  onChange({
                    annualSalary: sal,
                    baseRate:     sal != null ? Math.round((sal / 2080) * 100) / 100 : null,
                    shiftHours:   8,
                  });
                }}
                placeholder="e.g. 52000"
              />
              {(formData.annualSalary ?? 0) > 0 && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
                  ≈ ${(formData.annualSalary / 26).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} per check · ${(formData.annualSalary / 2080).toFixed(2)}/hr equivalent
                </div>
              )}
            </Field>
          ) : (
            <FieldRow>
            <Field label="Base Rate ($/hr)" error={attempted && !((formData.baseRate ?? 0) > 0) ? "Required" : null}>
              <input
                style={{ ...iS, ...errBorder(attempted && !((formData.baseRate ?? 0) > 0)) }}
                type="number" min="0" step="0.01"
                value={formData.baseRate ?? ""}
                onChange={e => onChange({ baseRate: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="e.g. 19.65"
              />
            </Field>
            <Field label="Shift Length (hrs)" error={attempted && !((formData.shiftHours ?? 0) > 0) ? "Required" : null}>
              <input
                style={{ ...iS, ...errBorder(attempted && !((formData.shiftHours ?? 0) > 0)) }}
                type="number" min="1" step="0.5"
                value={formData.shiftHours ?? ""}
                onChange={e => onChange({ shiftHours: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="e.g. 10"
              />
              <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.4 }}>
                For shift counting in event logging — income uses total weekly hours set in the next step.
              </div>
            </Field>
          </FieldRow>
          )}

          {/* ── Weekend Differential ── directly configurable; 0 = no differential ── */}
          <Field label="Weekend Differential ($/hr)">
            <input
              style={{ ...iS }}
              type="number" min="0" step="0.25"
              value={formData.diffRate ?? ""}
              onChange={e => onChange({ diffRate: e.target.value === "" ? null : parseFloat(e.target.value) })}
              placeholder="0 = no differential"
            />
          </Field>

          {isBaseUser && (
            <>
              {/* ── OT Threshold ── */}
              <Field label="Overtime Threshold (hrs/wk)">
                <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                  {OT_THRESHOLDS.map(h => (
                    <Pill
                      key={h} label={`${h}h`}
                      active={!otCustom && formData.otThreshold === h}
                      onClick={() => { setOtCustom(false); onChange({ otThreshold: h }); }}
                    />
                  ))}
                  <Pill
                    label="Custom"
                    active={otCustom}
                    onClick={() => setOtCustom(true)}
                  />
                  <Pill
                    label="Exempt"
                    active={formData.otThreshold === null && !otCustom}
                    onClick={() => { setOtCustom(false); onChange({ otThreshold: null }); }}
                  />
                </div>
                {otCustom && (
                  <div style={{ marginTop: "10px" }}>
                    <label style={{ ...lS, ...(attempted && !((formData.otThreshold ?? 0) > 0) ? { color: "var(--color-deduction)" } : {}) }}>Hours/week</label>
                    <input
                      style={{ ...iS, ...errBorder(attempted && !((formData.otThreshold ?? 0) > 0)) }}
                      type="number" min="1" step="1"
                      value={formData.otThreshold ?? ""}
                      onChange={e => onChange({ otThreshold: e.target.value === "" ? null : parseInt(e.target.value) })}
                      placeholder="e.g. 40"
                    />
                    {attempted && !((formData.otThreshold ?? 0) > 0) && (
                      <div style={{ fontSize: "10px", color: "var(--color-deduction)", marginTop: "4px", display: "flex", alignItems: "center", gap: "3px" }}>↑ Required</div>
                    )}
                  </div>
                )}
              </Field>

              {/* ── OT Multiplier ── */}
              <Field label="OT Multiplier">
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  {OT_MULTIPLIERS.map(m => (
                    <Pill
                      key={m} label={`${m}×`}
                      active={formData.otMultiplier === m}
                      onClick={() => onChange({ otMultiplier: m })}
                    />
                  ))}
                </div>
              </Field>

              {/* ── Night Differential ── */}
              <Field label="Do you receive a night differential?">
                <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                  <Pill
                    label="Yes"
                    active={formData.nightDiffEnabled === true}
                    onClick={() => onChange({ nightDiffEnabled: true })}
                  />
                  <Pill
                    label="No"
                    active={formData.nightDiffEnabled === false}
                    onClick={() => onChange({ nightDiffEnabled: false, nightDiffRate: 0 })}
                  />
                </div>
                {formData.nightDiffEnabled === true && (
                  <div style={{ marginTop: "10px" }}>
                    <label style={{ ...lS }}>Night Diff Rate ($/hr)</label>
                    <input
                      style={{ ...iS }}
                      type="number" min="0" step="0.25"
                      value={formData.nightDiffRate ?? ""}
                      onChange={e => onChange({ nightDiffRate: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      placeholder="e.g. 1.50"
                    />
                  </div>
                )}
              </Field>
            </>
          )}

          {/* ── Commission (life event only) ── */}
          {lifeEvent === "commission_job" && (
            <Field label="Commission Income">
              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                <Pill
                  label="My pay includes commission"
                  active={hasCommission}
                  onClick={() => {
                    const next = !hasCommission;
                    setHasCommission(next);
                    if (!next) onChange({ commissionMonthly: 0 });
                  }}
                />
              </div>
              {hasCommission && (
                <div style={{ marginTop: "10px" }}>
                  <label style={lS}>Monthly Average ($)</label>
                  <input
                    style={{ ...iS }}
                    type="number" min="0" step="100"
                    value={formData.commissionMonthly ?? ""}
                    onChange={e => onChange({ commissionMonthly: e.target.value === "" ? null : parseFloat(e.target.value) })}
                    placeholder="e.g. 800"
                  />
                </div>
              )}
            </Field>
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Schedule
// ─────────────────────────────────────────────────────────────────────────────
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Derives the fiscal week index for a given date string "YYYY-MM-DD".
// Week 0 ends on FISCAL_YEAR_START; each subsequent week is 7 days.
// Returns the smallest idx such that that week's end >= the given date.
function dateToWeekIdx(dateStr) {
  const weekZeroEnd = new Date(FISCAL_YEAR_START + "T00:00:00");
  const target      = new Date(dateStr       + "T00:00:00");
  const diffDays    = (target - weekZeroEnd) / 86400000;
  return Math.max(0, Math.min(Math.ceil(diffDays / 7), FISCAL_WEEKS_PER_YEAR - 1));
}

function Step2({ formData, onChange, attempted }) {
  const isEmployerDHL = formData.employerPreset === "DHL";
  const isBaseUser = !isEmployerDHL;

  function handleDateChange(dateStr) {
    if (!dateStr) return;
    onChange({ startDate: dateStr, firstActiveIdx: dateToWeekIdx(dateStr) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Job start date ── */}
      <Field label="Job Start Date" error={attempted && !formData.startDate ? "Select your job start date" : null}>
        <input
          style={{ ...iS, ...errBorder(attempted && !formData.startDate) }}
          type="date"
          value={formData.startDate ?? ""}
          onChange={e => handleDateChange(e.target.value)}
        />
        {formData.startDate && (
          <div style={{
            marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)",
          }}>
            Income tracking starts week {formData.firstActiveIdx} of the fiscal year.
          </div>
        )}
      </Field>

      {/* ── Hours / rotation ── */}
      {isEmployerDHL ? (
        <Field label="Which week are you currently on?">
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <Pill
              label="Short Week (4 working days)"
              active={formData.startingWeekIsLong === false}
              onClick={() => onChange({ startingWeekIsLong: false })}
            />
            <Pill
              label="Long Week (5 working days)"
              active={formData.startingWeekIsLong === true}
              onClick={() => onChange({ startingWeekIsLong: true })}
            />
          </div>
          <div style={{
            marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)",
            lineHeight: "1.5",
          }}>
            Used to alternate short/long week income from your start date.
          </div>
        </Field>
      ) : (
        <Field label="Max Weekly Hours" error={attempted && !((formData.maxWeeklyHours ?? 0) > 0 && (formData.maxWeeklyHours ?? 0) <= 168) ? "Enter hours between 1 and 168" : null}>
          <input
            style={{ ...iS, ...errBorder(attempted && !((formData.maxWeeklyHours ?? 0) > 0 && (formData.maxWeeklyHours ?? 0) <= 168)) }}
            type="number" min="1" step="0.5"
            value={formData.maxWeeklyHours ?? ""}
            onChange={e => onChange({ maxWeeklyHours: e.target.value === "" ? null : parseFloat(e.target.value) })}
            placeholder="e.g. 40"
          />
          <div style={{
            marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)",
          }}>
            Income projects from this ceiling; weekly check-in tracks actual hours worked.
          </div>
        </Field>
      )}

      {/* ── Pay period end day ── */}
      {isBaseUser && (
        <Field label="Pay Period Closes On" error={attempted && !Number.isInteger(formData.payPeriodEndDay) ? "Select a day" : null}>
          <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
            {DAY_LABELS.map((d, i) => (
              <Pill
                key={i} label={d}
                active={formData.payPeriodEndDay === i}
                onClick={() => onChange({ payPeriodEndDay: i })}
              />
            ))}
          </div>
          <div style={{
            marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)",
            lineHeight: "1.5",
          }}>
            Weekly confirmation prompt fires on this day.
          </div>
        </Field>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Deductions
// ─────────────────────────────────────────────────────────────────────────────
const BENEFIT_DEFS = BENEFIT_OPTIONS;

function BenefitCard({ def, selected, formData, onChange, onToggle, attempted }) {
  const amtErr  = attempted && selected && def.type === "weekly" && !((formData[def.field] ?? 0) > 0);
  const rateErr = attempted && selected && def.type === "k401"   && !((formData.k401Rate ?? 0) > 0);
  const dateErr = attempted && selected && def.type === "k401"   && !formData.k401StartDate;

  return (
    <div style={{
      border: `1px solid ${selected ? "rgba(0,200,150,0.28)" : "var(--color-border-subtle)"}`,
      borderRadius: "12px",
      background: selected ? "rgba(0,200,150,0.05)" : "var(--color-bg-raised)",
      overflow: "hidden",
      transition: "border-color 0.15s, background 0.15s",
    }}>

      {/* ── Toggle row ── */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "12px",
          padding: "12px 14px",
          background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <div>
          <div style={{
            fontSize: "13px", fontWeight: 600,
            color: selected ? "var(--color-gold)" : "var(--color-text-primary)",
          }}>
            {selected && "✓ "}{def.label}
          </div>
          <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", marginTop: "2px" }}>
            {def.sub}
          </div>
        </div>
        <div style={{
          fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
          color: selected ? "var(--color-gold)" : "var(--color-text-disabled)",
          flexShrink: 0,
        }}>
          {selected ? "On" : "Off"}
        </div>
      </button>

      {/* ── Expanded fields ── */}
      {selected && (
        <div style={{
          padding: "12px 14px 14px",
          borderTop: "1px solid rgba(0,200,150,0.10)",
          display: "flex", flexDirection: "column", gap: "12px",
        }}>
          {def.type === "weekly" && (
            <Field label="Per-paycheck Deduction ($)" error={amtErr ? "Required" : null}>
              <input
                style={{ ...iS, ...errBorder(amtErr) }}
                type="number" min="0" step="0.01"
                value={formData[def.field] ?? ""}
                onChange={e => onChange({ [def.field]: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder={def.placeholder}
              />
            </Field>
          )}
          {def.type === "k401" && (
            <>
              <FieldRow>
                <Field label="Your Contribution (%)" error={rateErr ? "Required" : null}>
                  <input
                    style={{ ...iS, ...errBorder(rateErr) }}
                    type="number" min="0" max="100" step="0.5"
                    value={
                      formData.k401Rate != null
                        ? +(formData.k401Rate * 100).toFixed(2)
                        : ""
                    }
                    onChange={e => onChange({ k401Rate: e.target.value === "" ? null : parseFloat(e.target.value) / 100 })}
                    placeholder="e.g. 6"
                  />
                </Field>
                {formData.employerPreset === "DHL" ? (
                  <Field label="DHL Match (computed)">
                    <div style={{
                      ...iS,
                      color: "var(--color-text-secondary)",
                      display: "flex",
                      alignItems: "center",
                      pointerEvents: "none",
                    }}>
                      {(dhlEmployerMatchRate(formData.k401Rate || 0) * 100).toFixed(1)}%
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                      100% match up to 4%, then 50% up to 6% (5% cap).
                    </div>
                  </Field>
                ) : (
                  <Field label="Employer Match (%)">
                    <input
                      style={{ ...iS }}
                      type="number" min="0" max="100" step="0.5"
                      value={
                        formData.k401MatchRate != null
                          ? +(formData.k401MatchRate * 100).toFixed(2)
                          : ""
                      }
                      onChange={e => onChange({ k401MatchRate: e.target.value === "" ? null : parseFloat(e.target.value) / 100 })}
                      placeholder="e.g. 5"
                    />
                  </Field>
                )}
              </FieldRow>
              <Field label="Enrollment / Start Date" error={dateErr ? "Required" : null}>
                <input
                  style={{ ...iS, ...errBorder(dateErr) }}
                  type="date"
                  value={formData.k401StartDate ?? ""}
                  onChange={e => onChange({ k401StartDate: e.target.value || null })}
                />
                <div style={{
                  marginTop: "6px", fontSize: "11px",
                  color: "var(--color-text-disabled)", lineHeight: "1.5",
                }}>
                  Enter your enrollment date — past dates mark 401k as already active.
                </div>
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Step3({ formData, onChange, attempted }) {
  const selected = new Set(formData.selectedBenefits ?? []);
  const isEmployerDHL    = formData.employerPreset === "DHL";
  const isBaseUser = !isEmployerDHL;
  const others   = formData.otherDeductions ?? [];
  const attendErr = attempted && isBaseUser && formData.attendanceBucketEnabled === null;

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      const def = BENEFIT_DEFS.find(d => d.id === id);
      if (def?.type === "weekly") onChange({ [def.field]: 0 });
      if (def?.type === "k401") onChange({ k401Rate: 0, k401MatchRate: 0, k401StartDate: null });
    } else {
      next.add(id);
    }
    onChange({ selectedBenefits: [...next] });
  }

  function addRow() {
    const id = Date.now().toString(36);
    onChange({ otherDeductions: [...others, { id, label: "", perCheckAmount: 0 }] });
  }

  function updateRow(id, patch) {
    onChange({ otherDeductions: others.map(r => r.id === id ? { ...r, ...patch } : r) });
  }

  function removeRow(id) {
    onChange({ otherDeductions: others.filter(r => r.id !== id) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

      {/* ── Benefits ── */}
      <div>
        <p style={{
          fontSize: "13px", color: "var(--color-text-secondary)",
          margin: "0 0 8px", lineHeight: "1.5",
        }}>
          Select benefits deducted from your paycheck — skip if none yet.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {BENEFIT_DEFS.map(def => (
            <BenefitCard
              key={def.id}
              def={def}
              selected={selected.has(def.id)}
              formData={formData}
              onChange={onChange}
              onToggle={() => toggle(def.id)}
              attempted={attempted}
            />
          ))}
        </div>
      </div>

      {/* ── Benefits start date ── */}
      <Field label="Benefits Start Date">
        <input
          style={{ ...iS }}
          type="date"
          value={formData.benefitsStartDate ?? ""}
          onChange={e => onChange({ benefitsStartDate: e.target.value || null })}
        />
        <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.5" }}>
          Leave blank if coverage is already active or not enrolled.
        </div>
      </Field>

      {/* ── Other recurring deductions ── */}
      <div>
        <label style={lS}>Other Recurring Deductions (per paycheck)</label>
        <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {others.length === 0 && (
            <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", padding: "8px 0" }}>
              Nothing added — examples: union dues, parking, equipment.
            </div>
          )}
          {others.map(row => (
            <div key={row.id} style={{
              display: "grid", gridTemplateColumns: "1fr 120px 32px",
              gap: "8px", alignItems: "center",
            }}>
              <input
                style={{ ...iS }}
                type="text"
                placeholder="Label (e.g. Union Dues)"
                value={row.label}
                onChange={e => updateRow(row.id, { label: e.target.value })}
              />
              <input
                style={{ ...iS }}
                type="number" min="0" step="0.01"
                placeholder="$/check"
                value={row.perCheckAmount ?? row.weeklyAmount ?? ""}
                onChange={e => updateRow(row.id, { perCheckAmount: e.target.value === "" ? null : parseFloat(e.target.value) })}
              />
              <button
                onClick={() => removeRow(row.id)}
                style={{
                  background: "transparent",
                  color: "var(--color-text-disabled)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "8px", width: "32px", height: "36px",
                  cursor: "pointer", fontSize: "14px", lineHeight: 1,
                }}
              >×</button>
            </div>
          ))}
          <button
            onClick={addRow}
            style={{
              background: "transparent", color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-subtle)", borderRadius: "10px",
              padding: "7px 14px", fontSize: "10px", letterSpacing: "1.5px",
              textTransform: "uppercase", cursor: "pointer", alignSelf: "flex-start",
            }}
          >
            + Add Deduction
          </button>
        </div>
      </div>

      {/* ── Attendance policy gate — standard users only ── */}
      {isBaseUser && (
        <Field label="Does your employer track attendance with a formal policy?" error={attendErr ? "Selection required" : null}>
          <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "10px", lineHeight: "1.5" }}>
            Points systems, hours-based buckets, or similar.
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Pill
              label="Yes — points or hours system"
              active={formData.attendanceBucketEnabled === true}
              onClick={() => onChange({ attendanceBucketEnabled: true })}
            />
            <Pill
              label="No — standard time off"
              active={formData.attendanceBucketEnabled === false}
              onClick={() => onChange({ attendanceBucketEnabled: false })}
            />
          </div>
        </Field>
      )}

      {/* Attendance threshold sub-fields — only when answered Yes */}
      {isBaseUser && formData.attendanceBucketEnabled === true && (
        <>
          <Field label="What unit does your policy use?">
            <input
              style={{ ...iS }}
              type="text"
              placeholder="e.g. points, hours, occurrences"
              value={formData.attendanceUnit ?? ""}
              onChange={e => onChange({ attendanceUnit: e.target.value || null })}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field label="Warning Threshold">
              <input
                style={{ ...iS }}
                type="number" min="0" step="0.5"
                value={formData.attendanceWarnThreshold ?? ""}
                onChange={e => onChange({ attendanceWarnThreshold: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="e.g. 6"
              />
            </Field>
            <Field label="Termination Threshold">
              <input
                style={{ ...iS }}
                type="number" min="0" step="0.5"
                value={formData.attendanceTerminateThreshold ?? ""}
                onChange={e => onChange({ attendanceTerminateThreshold: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="e.g. 12"
              />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field label="Current Balance">
              <input
                style={{ ...iS }}
                type="number" min="0" step="0.5"
                value={formData.attendanceCurrentBalance ?? ""}
                onChange={e => onChange({ attendanceCurrentBalance: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="e.g. 2"
              />
            </Field>
            <Field label="Per-Event Increment">
              <input
                style={{ ...iS }}
                type="number" min="0.1" step="0.5"
                value={formData.attendanceIncrement ?? ""}
                onChange={e => onChange({ attendanceIncrement: e.target.value === "" ? 1 : parseFloat(e.target.value) })}
                placeholder="e.g. 1"
              />
              <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--color-text-disabled)" }}>Default 1 per absence</div>
            </Field>
          </div>
        </>
      )}

      {/* ── PTO policy — standard users only ── */}
      {isBaseUser && (
        <Field label="Does your employer offer PTO?">
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <Pill label="Yes" active={formData.ptoEnabled === true}
              onClick={() => onChange({ ptoEnabled: true })} />
            <Pill label="No" active={formData.ptoEnabled === false}
              onClick={() => onChange({ ptoEnabled: false })} />
          </div>
        </Field>
      )}

      {/* PTO sub-fields — only when answered Yes */}
      {isBaseUser && formData.ptoEnabled === true && (
        <>
          <Field label="How does your PTO accrue?">
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              <Pill label="Per Hour Worked" active={formData.ptoAccrualMethod === "per_hour"}
                onClick={() => onChange({ ptoAccrualMethod: "per_hour" })} />
              <Pill label="Per Pay Period" active={formData.ptoAccrualMethod === "per_period"}
                onClick={() => onChange({ ptoAccrualMethod: "per_period" })} />
              <Pill label="Lump Sum (Annual)" active={formData.ptoAccrualMethod === "lump_sum"}
                onClick={() => onChange({ ptoAccrualMethod: "lump_sum" })} />
            </div>
          </Field>

          {formData.ptoAccrualMethod && (
            <Field label={
              formData.ptoAccrualMethod === "per_hour" ? "Accrual Rate (hrs per hour worked)" :
              formData.ptoAccrualMethod === "per_period" ? "Accrual Rate (hrs per pay period)" :
              "Annual Total (hrs)"
            }>
              <input
                style={{ ...iS }}
                type="number" min="0" step="0.01"
                value={formData.ptoAccrualRate ?? ""}
                onChange={e => onChange({ ptoAccrualRate: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder={formData.ptoAccrualMethod === "per_hour" ? "e.g. 0.05" : "e.g. 4"}
              />
            </Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field label="Current Balance (hrs)">
              <input
                style={{ ...iS }}
                type="number" min="0" step="0.5"
                value={formData.ptoCurrentBalance ?? ""}
                onChange={e => onChange({ ptoCurrentBalance: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="e.g. 40"
              />
            </Field>
            <Field label="Cap (hrs, optional)">
              <input
                style={{ ...iS }}
                type="number" min="0" step="1"
                value={formData.ptoCap ?? ""}
                onChange={e => onChange({ ptoCap: e.target.value === "" ? null : parseFloat(e.target.value) })}
                placeholder="e.g. 120"
              />
            </Field>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Tax Rates
// ─────────────────────────────────────────────────────────────────────────────

// Self-contained paystub calculator — renders two sections for variable schedules,
// one for fixed. onConfirm receives derived rate fields; onEstimate uses table lookup.
function PaystubCalc({ isVariable, isNoTax, onConfirm, onEstimate }) {
  const [g1, setG1] = useState("");
  const [f1, setF1] = useState("");
  const [s1, setS1] = useState("");
  const [g2, setG2] = useState("");
  const [f2, setF2] = useState("");
  const [s2, setS2] = useState("");

  function dr(gross, withheld) {
    const g = parseFloat(gross) || 0;
    if (!g) return null;
    return +((parseFloat(withheld) || 0) / g).toFixed(4);
  }

  const fed1  = dr(g1, f1);
  const sta1  = dr(g1, s1);
  const fed2  = isVariable ? dr(g2, f2) : null;
  const sta2  = isVariable ? dr(g2, s2) : null;
  const canApply = fed1 !== null;
  const pct = n => n != null ? (n * 100).toFixed(2) + "%" : "—";

  function handleConfirm() {
    if (!canApply) return;
    const rates = {
      fedRateLow:   fed1,
      stateRateLow: sta1 ?? 0,
      fedRateHigh:  isVariable && fed2 != null ? fed2 : fed1,
      stateRateHigh: isVariable && sta2 != null ? sta2 : (sta1 ?? 0),
    };
    onConfirm(rates);
  }

  const boxStyle = {
    background: "var(--color-bg-raised)", borderRadius: "10px",
    padding: "14px", display: "flex", flexDirection: "column", gap: "10px",
  };
  const hdrStyle = {
    fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
    color: "var(--color-text-disabled)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
        Enter paystub values for exact rates — or estimate now and sharpen later.
      </div>

      {/* Week 1 */}
      <div style={boxStyle}>
        <div style={hdrStyle}>{isVariable ? "Shorter Week Paystub" : "Typical Paycheck"}</div>
        <FieldRow>
          <Field label="Gross Pay ($)">
            <input style={{ ...iS }} type="number" min="0" step="0.01"
              value={g1} onChange={e => setG1(e.target.value)} placeholder="e.g. 1050" />
          </Field>
          <Field label="Fed Income Tax Withheld ($)">
            <input style={{ ...iS }} type="number" min="0" step="0.01"
              value={f1} onChange={e => setF1(e.target.value)} placeholder="e.g. 82" />
          </Field>
        </FieldRow>
        {!isNoTax && (
          <Field label="State Income Tax Withheld ($)">
            <input style={{ ...iS }} type="number" min="0" step="0.01"
              value={s1} onChange={e => setS1(e.target.value)} placeholder="e.g. 35" />
          </Field>
        )}
        {fed1 !== null && (
          <div style={{ fontSize: "11px", color: "var(--color-green)" }}>
            → Fed {pct(fed1)}{!isNoTax && sta1 != null ? `  ·  State ${pct(sta1)}` : ""}
          </div>
        )}
      </div>

      {/* Week 2 — variable schedule only */}
      {isVariable && (
        <div style={boxStyle}>
          <div style={hdrStyle}>Longer Week Paystub</div>
          <FieldRow>
            <Field label="Gross Pay ($)">
              <input style={{ ...iS }} type="number" min="0" step="0.01"
                value={g2} onChange={e => setG2(e.target.value)} placeholder="e.g. 1450" />
            </Field>
            <Field label="Fed Income Tax Withheld ($)">
              <input style={{ ...iS }} type="number" min="0" step="0.01"
                value={f2} onChange={e => setF2(e.target.value)} placeholder="e.g. 186" />
            </Field>
          </FieldRow>
          {!isNoTax && (
            <Field label="State Income Tax Withheld ($)">
              <input style={{ ...iS }} type="number" min="0" step="0.01"
                value={s2} onChange={e => setS2(e.target.value)} placeholder="e.g. 58" />
            </Field>
          )}
          {fed2 !== null && (
            <div style={{ fontSize: "11px", color: "var(--color-green)" }}>
              → Fed {pct(fed2)}{!isNoTax && sta2 != null ? `  ·  State ${pct(sta2)}` : ""}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {canApply && (
          <button onClick={handleConfirm} style={{
            background: "var(--color-green)", color: "var(--color-bg-base)",
            border: "none", borderRadius: "12px", padding: "8px 16px",
            fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
            fontWeight: "bold", cursor: "pointer",
          }}>
            Apply These Rates
          </button>
        )}
        <button onClick={onEstimate} style={{
          background: "transparent", color: "var(--color-text-secondary)",
          border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
          padding: "8px 14px", fontSize: "10px", letterSpacing: "1.5px",
          textTransform: "uppercase", cursor: "pointer",
        }}>
          Use Estimate for Now
        </button>
      </div>
    </div>
  );
}

function Step4({ formData, onChange, attempted }) {
  const isEmployerDHL      = formData.employerPreset === "DHL";
  const isBaseUser = !isEmployerDHL;
  const isVariable = formData.scheduleIsVariable;
  const stateConfig = formData.userState ? STATE_TAX_TABLE[formData.userState] : null;
  const isNoTax    = stateConfig?.model === "NONE";
  const hasRates   = formData.fedRateLow > 0;

  // Show the paystub calculator (collapsed by default when rates already exist)
  const [showCalc, setShowCalc] = useState(!hasRates);

  function handleStateChange(code) {
    onChange({ userState: code || null });
  }

  function handleConfirm(rates) {
    onChange({ ...rates, taxRatesEstimated: false });
    setShowCalc(false);
  }

  function handleEstimate() {
    const stateEst = isNoTax ? 0 : (stateConfig?.flatRate ?? stateConfig?.midpointRate ?? 0.05);
    onChange({
      fedRateLow:    0.10,
      fedRateHigh:   isVariable ? 0.12 : 0.10,
      stateRateLow:  stateEst,
      stateRateHigh: stateEst,
      taxRatesEstimated: true,
    });
    setShowCalc(false);
  }

  function loadDHLPreset() {
    const d = DHL_PRESET.defaults;
    onChange({
      fedRateLow:    d.fedRateLow,
      fedRateHigh:   d.fedRateHigh,
      stateRateLow:  d.stateRateLow,
      stateRateHigh: d.stateRateHigh,
      userState:     formData.userState || d.userState,
      taxRatesEstimated: true,
    });
    setShowCalc(false);
  }

  const pct = n => (n * 100).toFixed(2) + "%";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* Variable schedule note — DHL only */}
      {isEmployerDHL && (
        <div style={{
          fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.5",
          padding: "10px 12px", background: "var(--color-bg-raised)", borderRadius: "8px",
        }}>
          Variable schedule auto-enabled — your pay alternates between shorter and longer weeks.
        </div>
      )}

      {/* Filing Status */}
      <Field label="Filing Status">
        <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
          {[
            { val: "single", label: "Single",   deduction: 15000 },
            { val: "mfj",    label: "Married",   deduction: 30000 },
            { val: "hoh",    label: "Head of Household", deduction: 22500 },
          ].map(({ val, label, deduction }) => (
            <Pill
              key={val}
              label={label}
              active={formData.filingStatus === val}
              onClick={() => onChange({ filingStatus: val, fedStdDeduction: deduction })}
            />
          ))}
        </div>
        {formData.filingStatus && (
          <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)" }}>
            {formData.filingStatus === "single" && "Standard deduction: $15,000"}
            {formData.filingStatus === "mfj"    && "Standard deduction: $30,000 (married filing jointly)"}
            {formData.filingStatus === "hoh"    && "Standard deduction: $22,500 (head of household)"}
          </div>
        )}
      </Field>

      {/* State dropdown */}
      <Field label="Your State" error={attempted && !formData.userState ? "Select your state" : null}>
        <select
          style={{ ...iS, appearance: "none", WebkitAppearance: "none", ...errBorder(attempted && !formData.userState) }}
          value={formData.userState ?? ""}
          onChange={e => handleStateChange(e.target.value)}
        >
          <option value="">— select state —</option>
          {STATE_NAMES.map(({ code, name }) => (
            <option key={code} value={code}>{name} ({code})</option>
          ))}
        </select>
        {formData.userState && isNoTax && (
          <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)" }}>
            {stateConfig.name} has no state income tax — your state rate will be 0.
          </div>
        )}
        {formData.userState && !isNoTax && stateConfig && (
          <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)" }}>
            {stateConfig.model === "FLAT"
              ? `Flat rate: ${(stateConfig.flatRate * 100).toFixed(1)}% — pre-filled on estimate path.`
              : stateConfig.midpointRate != null
              ? `Progressive brackets — estimate uses ~${(stateConfig.midpointRate * 100).toFixed(1)}% effective rate (~$50k income).`
              : "Progressive brackets — estimate uses a mid-bracket approximation."}
          </div>
        )}
      </Field>

      {/* DHL MO preset load button — only when no rates set yet */}
      {isEmployerDHL && !hasRates && formData.userState === "MO" && (
        <div style={{
          padding: "12px 14px",
          background: "rgba(0,200,150,0.05)",
          border: "1px solid rgba(0,200,150,0.15)",
          borderRadius: "10px",
        }}>
          <div style={{ fontSize: "12px", color: "var(--color-text-primary)", marginBottom: "4px" }}>
            Load DHL Missouri supply chain reference rates
          </div>
          <div style={{
            fontSize: "11px", color: "var(--color-text-disabled)",
            lineHeight: "1.5", marginBottom: "10px",
          }}>
            Night shift paystub-derived. Flagged as estimated until you confirm with your own stub.
          </div>
          <button onClick={loadDHLPreset} style={{
            background: "rgba(0,200,150,0.10)", color: "var(--color-gold)",
            border: "1px solid rgba(0,200,150,0.28)", borderRadius: "10px",
            padding: "7px 14px", fontSize: "10px", letterSpacing: "1.5px",
            textTransform: "uppercase", cursor: "pointer",
          }}>
            Load DHL MO Preset
          </button>
        </div>
      )}

      {/* Paystub calculator — shown when no rates yet, or user opens it */}
      {formData.userState && (
        <>
          {hasRates && !showCalc ? (
            <button
              onClick={() => setShowCalc(true)}
              style={{
                background: "transparent", color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)", borderRadius: "12px",
                padding: "7px 14px", fontSize: "10px", letterSpacing: "1.5px",
                textTransform: "uppercase", cursor: "pointer", alignSelf: "flex-start",
              }}
            >
              Recalculate from Paystub
            </button>
          ) : showCalc && (
            <PaystubCalc
              isVariable={isVariable}
              isNoTax={isNoTax}
              onConfirm={handleConfirm}
              onEstimate={handleEstimate}
            />
          )}
        </>
      )}

      {/* Rate summary — includes FICA + std deduction so Tax Summary step is not needed */}
      {hasRates && (
        <div style={{
          padding: "12px 14px", background: "var(--color-bg-raised)", borderRadius: "10px",
          display: "flex", flexDirection: "column", gap: "6px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "4px",
          }}>
            <div style={{
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              color: "var(--color-text-disabled)",
            }}>
              Tax Picture
            </div>
            <span style={{
              fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
              padding: "2px 8px", borderRadius: "6px",
              background: formData.taxRatesEstimated
                ? "rgba(0,200,150,0.12)" : "rgba(34,197,94,0.12)",
              color: formData.taxRatesEstimated
                ? "var(--color-gold)" : "var(--color-green)",
              border: `1px solid ${formData.taxRatesEstimated
                ? "rgba(0,200,150,0.3)" : "rgba(34,197,94,0.3)"}`,
            }}>
              {formData.taxRatesEstimated ? "Estimated" : "Confirmed"}
            </span>
          </div>
          {[
            { label: "Standard Deduction",             val: `$${(formData.fedStdDeduction ?? 15000).toLocaleString()}${formData.filingStatus === "mfj" ? " (MFJ)" : formData.filingStatus === "hoh" ? " (HOH)" : ""}`, plain: true },
            { label: "FICA (SS + Medicare)",           val: pct(formData.ficaRate ?? 0.0765),                          plain: true },
            { label: `Fed ${isVariable ? "(short)" : "rate"}`, val: pct(formData.fedRateLow),               est: true },
            ...(isVariable ? [{ label: "Fed (long)",   val: pct(formData.fedRateHigh),                                 est: true }] : []),
            { label: `State ${isVariable ? "(short)" : "rate"}`, val: isNoTax ? "0% (no state tax)" : pct(formData.stateRateLow), est: !isNoTax },
            ...(isVariable && !isNoTax ? [{ label: "State (long)", val: pct(formData.stateRateHigh),                  est: true }] : []),
          ].map(r => (
            <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
              <span style={{ color: "var(--color-text-secondary)" }}>{r.label}</span>
              <strong style={{
                color: (r.est && formData.taxRatesEstimated)
                  ? "var(--color-gold)" : "var(--color-text-primary)",
              }}>
                {r.val}{r.est && formData.taxRatesEstimated ? " est." : ""}
              </strong>
            </div>
          ))}
          {formData.taxRatesEstimated && (
            <div style={{
              marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.5",
            }}>
              Confirm rates anytime via <strong style={{ color: "var(--color-gold)" }}>Sharpen Rates</strong> in Income.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 — Paycheck Buffer (estimateWeeklyGross helper defined above)
//
// Shows a live net-per-check preview, then lets the user toggle the buffer on/off
// and set an amount (default $50, max $200). See App.jsx bufferPerWeek comment for
// how the buffer is excluded from all downstream spendable math at runtime.
// ─────────────────────────────────────────────────────────────────────────────

// Estimate a typical weekly gross from formData — does not require a week object.
function estimateWeeklyGross(d) {
  const isEmployerDHL = d.employerPreset === "DHL";
  if (isEmployerDHL) {
    const gross = (h) => {
      const base = d.baseRate || 0;
      const reg = Math.min(h, d.otThreshold || 40);
      const ot = Math.max(h - (d.otThreshold || 40), 0);
      return reg * base + ot * base * (d.otMultiplier || 1.5);
    };
    const longCustom = d.customWeeklyHoursLong;
    const shortCustom = d.customWeeklyHoursShort;
    if (longCustom != null || shortCustom != null) {
      const fallback = d.customWeeklyHours ?? 60;
      const longHours = longCustom ?? fallback;
      const shortHours = shortCustom ?? fallback;
      return (gross(shortHours) + gross(longHours)) / 2;
    }
    if (d.customWeeklyHours != null) {
      // Flat custom hours — same projected total every week
      return gross(d.customWeeklyHours);
    }
    // Standard DHL rotation: weighted average of long (5-shift) and short (4-shift) weeks
    const hoursPerShift = d.shiftHours || 12;
    return (gross(4 * hoursPerShift) + gross(5 * hoursPerShift)) / 2;
  }
  // Base user: flat ceiling. customWeeklyHours overrides maxWeeklyHours; standardWeeklyHours is legacy fallback.
  const h = d.customWeeklyHours ?? d.maxWeeklyHours ?? d.standardWeeklyHours ?? 40;
  const base = d.baseRate || 0;
  const nightDiff = d.nightDiffEnabled === true ? (d.nightDiffRate ?? 0) : 0;
  const effectiveOtThreshold = d.otThreshold ?? h;
  const reg = Math.min(h, effectiveOtThreshold);
  const ot = Math.max(h - effectiveOtThreshold, 0);
  return reg * (base + nightDiff) + ot * (base + nightDiff) * (d.otMultiplier || 1.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 — Tax Exempt Gate
//
// Some weeks are projected tax-free (no withholding). Showing those as
// "pure net" can mislead — they're a timing benefit, not free money.
// The gate presents a disclaimer before unlocking the tax-exempt view.
//
// Tax Exempt Gate — Variant C: locked placeholder card with accept button

const TAX_EXEMPT_DISCLAIMER = (
  <>
    Tax-exempt weeks show your projected gross as the full net — no federal or state withholding is
    deducted. This is a <strong>timing benefit only</strong>. You still owe taxes at filing; these
    weeks do not represent extra income. The dashboard will flag them clearly so you can set aside
    the difference.
  </>
);

// Preview content shown after opt-in (placeholder — real chart wires in Phase 5)
function TaxExemptPreview() {
  return (
    <div style={{
      background: "var(--color-bg-raised)", borderRadius: "12px", padding: "18px 16px",
      border: "1px solid var(--color-border-subtle)",
      display: "flex", flexDirection: "column", gap: "8px",
    }}>
      <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", letterSpacing: "1.5px", textTransform: "uppercase" }}>
        Tax-Exempt Projections Unlocked
      </div>
      <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.6" }}>
        Tax-exempt week projections will appear in the Income panel. Remember to set aside the
        withheld amount each of those weeks — the dashboard will calculate the suggested reserve.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP WRAPUP — Paycheck Buffer + Tax Exempt Gate (combined, non-blocking)
// ─────────────────────────────────────────────────────────────────────────────
function StepWrapUp({ formData, onChange }) {
  const gross = estimateWeeklyGross(formData);
  const fica     = gross * (formData.ficaRate || 0.0765);
  const k401k    = gross * (formData.k401Rate || 0);
  const baseBenefits =
    (formData.healthPremium || 0) + (formData.dentalPremium || 0) +
    (formData.visionPremium || 0) + (formData.stdWeekly || 0) +
    (formData.lifePremium || 0)   + (formData.hsaWeekly || 0) +
    (formData.fsaWeekly || 0)     + (formData.ltd || 0);
  const benefitsStart = formData.benefitsStartDate ? new Date(formData.benefitsStartDate) : null;
  const benefitsActive = !benefitsStart || Number.isNaN(benefitsStart.getTime()) || benefitsStart <= new Date();
  const checksPerYear = PAYCHECKS_PER_YEAR[formData.userPaySchedule ?? "weekly"] ?? 52;
  const perWeekFactor = checksPerYear / 52;  // weekly deduction factor (e.g. 0.5 for biweekly)
  const perCheckFactor = 52 / checksPerYear; // display scale: weekly → per-paycheck (e.g. 2 for biweekly)
  const benefits = benefitsActive ? baseBenefits * perWeekFactor : 0;
  const otherPerCheck = (formData.otherDeductions || []).reduce((s, r) => s + (r.perCheckAmount ?? r.weeklyAmount ?? 0), 0);
  const other = otherPerCheck * perWeekFactor;
  const fed   = gross * (formData.fedRateLow || 0);
  const state = gross * (formData.stateRateLow || 0);
  const net   = gross - fica - k401k - benefits - other - fed - state;

  const bufferOn = formData.bufferEnabled ?? true;
  const buf      = formData.paycheckBuffer ?? 50;
  const accepted = formData.taxExemptOptIn === true;
  const fmt = n => `$${Math.abs(n).toFixed(2)}`;

  // Schedule-aware label for the preview header.
  const payScheduleLabel =
    formData.userPaySchedule === "biweekly" || formData.userPaySchedule === "salary"
      ? "Per-Check Net (Biweekly)"
      : formData.userPaySchedule === "monthly"
        ? "Monthly Net"
        : "Weekly Net";

  // All row values scaled to per-paycheck basis for display.
  // Internal weekly amounts × perCheckFactor:
  //   benefits * perCheckFactor = baseBenefits (weekly avg → per-check, cancels out)
  //   other   * perCheckFactor = otherPerCheck (same cancellation)
  const rows = [
    { label: "Gross Pay",     val: gross   * perCheckFactor, sign: "" },
    { label: "Federal Tax",   val: fed     * perCheckFactor, sign: "−" },
    { label: "State Tax",     val: state   * perCheckFactor, sign: "−" },
    { label: "FICA",          val: fica    * perCheckFactor, sign: "−" },
    { label: "401(k)",        val: k401k   * perCheckFactor, sign: "−" },
    { label: benefitsActive ? "Benefits" : "Benefits (start later)", val: benefits * perCheckFactor, sign: "−" },
    { label: "Other Deduct.", val: other   * perCheckFactor, sign: "−" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>

      {/* ── Live net estimate ── */}
      <div>
        <label style={lS}>Estimated {payScheduleLabel}</label>
        <div style={{
          marginTop: "10px", background: "var(--color-bg-raised)",
          borderRadius: "12px", padding: "14px",
          border: "1px solid var(--color-border-subtle)",
        }}>
          {rows.map(r => (
            <div key={r.label} style={{
              display: "flex", justifyContent: "space-between",
              padding: "4px 0", fontSize: "12px",
              color: "var(--color-text-secondary)",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <span>{r.label}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{r.sign} {fmt(r.val)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "10px", marginTop: "4px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>Net</span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700,
              color: net >= 0 ? "var(--color-green)" : "var(--color-deduction)",
            }}>
              {fmt(net * perCheckFactor)}
            </span>
          </div>
        </div>
        {formData.taxRatesEstimated && (
          <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
            Tax rates are estimated — confirm via Sharpen Rates in Income.
          </div>
        )}
      </div>

      {/* ── Paycheck buffer ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <label style={lS}>Paycheck Buffer</label>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.6" }}>
          A fixed amount from every check that the app treats as invisible — quietly builds a safety reserve without cluttering your budget.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <Pill label="On"  active={bufferOn}  onClick={() => onChange({ bufferEnabled: true  })} />
          <Pill label="Off" active={!bufferOn} onClick={() => onChange({ bufferEnabled: false })} />
        </div>
        {bufferOn && (
          <>
            <input
              style={{ ...iS }}
              type="number" min="0" max={BUFFER_MAX} step="1"
              value={buf || ""}
              onChange={e => onChange({ paycheckBuffer: e.target.value === "" ? null : Math.min(parseFloat(e.target.value) || 0, BUFFER_MAX) })}
              placeholder="e.g. 50"
            />
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              At ${buf}/check — ${(buf * checksPerYear).toLocaleString()} reserved annually.
            </div>
          </>
        )}
      </div>

      {/* ── Tax exempt gate (optional, non-blocking) ── */}
      <div>
        <label style={lS}>Tax-Exempt Week Projections</label>
        {!accepted ? (
          <div style={{
            marginTop: "8px",
            background: "var(--color-bg-raised)", borderRadius: "12px", padding: "16px",
            border: "1px dashed rgba(0,200,150,0.3)",
            display: "flex", flexDirection: "column", gap: "10px",
          }}>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-disabled)", lineHeight: "1.6" }}>
              {TAX_EXEMPT_DISCLAIMER}
            </p>
            <button onClick={() => onChange({ taxExemptOptIn: true })} style={{
              background: "rgba(0,200,150,0.12)", color: "var(--color-gold)",
              border: "1px solid rgba(0,200,150,0.4)", borderRadius: "10px",
              padding: "7px 14px", fontSize: "10px", letterSpacing: "1.5px",
              fontWeight: 700, textTransform: "uppercase", cursor: "pointer",
              alignSelf: "flex-start",
            }}>
              Unlock projections
            </button>
          </div>
        ) : (
          <TaxExemptPreview />
        )}
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP DEFINITIONS
//
// showIf(formData, lifeEvent) → bool — controls which steps appear per life event
// isValid(formData, lifeEvent) → bool — gates Next; stubs return true until implemented
//
// Life event routing:
//   null (first-run)   → all steps 0–8
//   "lost_job"         → steps 0–4; steps 5–7 preserved in config but skipped; step 8 skipped
//   "changed_jobs"     → all steps 0–8
//   "commission_job"   → steps 0–5 only; steps 6–8 skipped
// ─────────────────────────────────────────────────────────────────────────────
const STEP_DEFS = [
  {
    id: 0, title: "Welcome",
    showIf: () => true,
    isValid: () => true,
    component: Step0,
  },
  {
    id: 1, title: "Pay Structure",
    showIf: () => true,
    isValid: (d) => {
      if (!d.userPaySchedule) return false;
      if (d.employerPreset === "DHL" && !d.dhlTeam) return false;
      if (d.customWeeklyHours != null && (d.customWeeklyHoursLong === 0 || d.customWeeklyHoursShort === 0)) return false;
      if (d.customWeeklyHours === 0) return false;
      if (d.employerPreset !== "DHL" && d.otThreshold !== null && !((d.otThreshold ?? 0) > 0)) return false;
      if (d.userPaySchedule === "salary") return (d.annualSalary ?? 0) > 0;
      return (d.baseRate ?? 0) > 0 && (d.shiftHours ?? 0) > 0;
    },
    component: Step1,
  },
  {
    id: 2, title: "Schedule",
    showIf: () => true,
    isValid: (d) => {
      if (!d.startDate) return false;
      if ((d.firstActiveIdx ?? 0) < 0 || (d.firstActiveIdx ?? 0) >= FISCAL_WEEKS_PER_YEAR) return false;
      if (d.employerPreset === "DHL") return true;
      if (!((d.maxWeeklyHours ?? 0) > 0) || (d.maxWeeklyHours ?? 0) > 168) return false;
      return Number.isInteger(d.payPeriodEndDay) && d.payPeriodEndDay >= 0 && d.payPeriodEndDay <= 6;
    },
    component: Step2,
  },
  {
    id: 3, title: "Deductions",
    showIf: () => true,
    isValid: (d) => {
      if (d.employerPreset !== "DHL" && d.attendanceBucketEnabled === null) return false;
      const sel = new Set(d.selectedBenefits ?? []);
      if (sel.has("k401")) {
        if (!((d.k401Rate ?? 0) > 0)) return false;
        if (!d.k401StartDate) return false;
      }
      for (const def of BENEFIT_DEFS.filter(b => b.type === "weekly")) {
        if (sel.has(def.id) && !((d[def.field] ?? 0) > 0)) return false;
      }
      return true;
    },
    skippable: true,
    component: Step3,
  },
  {
    id: 4, title: "Tax Rates",
    showIf: () => true,
    isValid: (d) => d.fedRateLow > 0 && d.userState != null,
    component: Step4,
  },
  {
    id: 7, title: "Wrap Up",
    showIf: (_, ev) => ev === null || ev === "changed_jobs",
    isValid: () => true,
    component: StepWrapUp,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// STUB — fallback UI for any step whose component prop is missing.
// All 9 steps are now implemented; this should never render in normal use.
// ─────────────────────────────────────────────────────────────────────────────
function StepStub({ title, sprint }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: "10px", padding: "40px 0", textAlign: "center",
    }}>
      <div style={{
        fontSize: "11px", letterSpacing: "3px", textTransform: "uppercase",
        color: "var(--color-text-disabled)",
      }}>
        Sprint {sprint}
      </div>
      <div style={{ fontSize: "15px", color: "var(--color-text-primary)", fontFamily: "var(--font-display)" }}>
        {title}
      </div>
      <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
        Step UI coming in sprint {sprint}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP WIZARD
//
// Props:
//   config           — current app config (pre-fills formData on re-entry)
//   onComplete(data) — called with merged config when wizard finishes;
//                      receives taxedWeeks auto-populated + setupComplete: true
//   lifeEvent        — null (first-run) | "lost_job" | "changed_jobs" | "commission_job"
// ─────────────────────────────────────────────────────────────────────────────
export function SetupWizard({ config, onComplete, onCancel, lifeEvent: initialLifeEvent = null, isInvestor = false }) {
  const [stepIdx,   setStepIdx]   = useState(0);
  const [formData,  setFormData]  = useState(
    isInvestor
      ? { ...config, employerPreset: null, otThreshold: config.otThreshold || 40, maxWeeklyHours: config.maxWeeklyHours || config.standardWeeklyHours || 40 }
      : { ...config }
  );
  const [lifeEvent, setLifeEvent] = useState(initialLifeEvent);
  const [attempted, setAttempted] = useState(false);

  const activeSteps = STEP_DEFS.filter(s => s.showIf(formData, lifeEvent));
  const current     = activeSteps[stepIdx];
  const isLast      = stepIdx === activeSteps.length - 1;
  const canProceed  = current?.isValid(formData, lifeEvent) ?? false;

  // Reset error state whenever the user moves to a new step
  useEffect(() => { setAttempted(false); }, [stepIdx]);

  function update(patch) {
    setFormData(prev => ({ ...prev, ...patch }));
  }

  function handleNext() {
    if (!canProceed) { setAttempted(true); return; }
    setAttempted(false);
    if (!isLast) setStepIdx(i => i + 1);
    else handleComplete();
  }

  function handleBack() {
    setAttempted(false);
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }

  function handleSkip() {
    setAttempted(false);
    if (!isLast) setStepIdx(i => i + 1);
    else handleComplete();
  }

  function handleComplete() {
    const finalData = formData.employerPreset === "DHL"
      ? { ...formData, payPeriodEndDay: 0, otThreshold: 40, otMultiplier: 1.5 }
      : formData;
    const allWeeks   = buildYear(finalData);
    const taxedWeeks = allWeeks
      .filter(w => w.idx >= (finalData.firstActiveIdx ?? 0))
      .map(w => w.idx);
    onComplete({ ...finalData, taxedWeeks, setupComplete: true });
  }

  const progressPct = ((stepIdx + 1) / activeSteps.length) * 100;
  const StepComponent = current?.component ?? null;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--color-bg-base)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      paddingTop: "max(16px, env(safe-area-inset-top))",
      paddingBottom: "max(16px, env(safe-area-inset-bottom))",
      paddingLeft: "16px", paddingRight: "16px",
      zIndex: 100,
    }}>
      <div style={{
        width: "100%", maxWidth: "480px",
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "20px",
        display: "flex", flexDirection: "column",
        flex: 1, minHeight: 0, maxHeight: "680px",
        overflow: "hidden",
      }}>

        {/* ── Header: step counter + title + progress bar ── */}
        <div style={{ padding: "24px 24px 0", flexShrink: 0 }}>
          <div style={{
            fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase",
            color: "var(--color-text-disabled)", marginBottom: "6px",
          }}>
            {lifeEvent === null ? "Setup" : "Life Event"} · {stepIdx + 1} of {activeSteps.length}
          </div>
          <div style={{
            fontSize: "20px", fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)", fontWeight: "bold", lineHeight: 1.2,
          }}>
            {current?.title}
          </div>
          <div style={{
            marginTop: "14px", height: "3px", borderRadius: "2px",
            background: "var(--color-border-subtle)",
          }}>
            <div style={{
              height: "100%", borderRadius: "2px",
              background: "var(--color-gold)",
              width: `${progressPct}%`,
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>

        {/* ── Step content — scrolls independently; header + nav stay fixed ── */}
        <div style={{
          flex: "1 1 0", minHeight: 0,
          overflowY: "auto", WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: "20px 24px 0",
        }}>
          {StepComponent
            ? <StepComponent
                formData={formData}
                onChange={update}
                lifeEvent={lifeEvent}
                onLifeEventChange={setLifeEvent}
                attempted={attempted}
                isInvestor={isInvestor}
              />
            : <StepStub title={current?.title} sprint={current?.sprint} />
          }
        </div>

        {/* ── Navigation ── */}
        <div style={{
          padding: "14px 24px 20px", flexShrink: 0,
          display: "flex", gap: "10px", justifyContent: "flex-end",
          borderTop: "1px solid var(--color-border-subtle)",
        }}>
          {onCancel && (
            <button
              onClick={onCancel}
              style={{
                marginRight: "auto",
                background: "var(--color-bg-raised)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "12px", padding: "7px 14px",
                fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          )}
          {stepIdx > 0 && (
            <button
              onClick={handleBack}
              style={{
                background: "var(--color-bg-raised)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "12px", padding: "8px 16px",
                fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Back
            </button>
          )}
          {current?.skippable && (
            <button
              onClick={handleSkip}
              style={{
                background: "transparent",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "12px", padding: "8px 16px",
                fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={!canProceed}
            style={{
              background: canProceed ? "var(--color-gold)" : "var(--color-bg-raised)",
              color: canProceed ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 22px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold",
              cursor: canProceed ? "pointer" : "not-allowed",
              opacity: 1,
              transition: "background 0.2s ease, color 0.2s ease",
            }}
          >
            {isLast ? "Finish" : "Next →"}
          </button>
        </div>

      </div>
    </div>
  );
}
