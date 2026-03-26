// ─────────────────────────────────────────────────────────────────────────────
// SetupWizard.jsx — multi-step onboarding wizard
//
// BUILD STATUS (as of 2026-03-24)
//
// DONE — all 9 step components are built and wired:
//   Step 0  (3b) Welcome / Life Event select
//   Step 1  (3c) Pay Structure — base rate, shift hours, diff, OT
//   Step 15 (3k) DHL Team Setup — team A/B, rotation type, night/morning shift
//   Step 2  (3d) Schedule — job start date → firstActiveIdx, pay period end day
//   Step 3  (3e) Deductions — 401k, LTD, benefits multi-select with inline config
//   Step 4  (3f) Tax Rates — state dropdown, paystub calculator (skippable)
//   Step 5  (3g) Tax Summary — read-only confirmation of computed tax picture
//   Step 6  (3h) Other Deductions — benefits date, freeform rows, attendance gate
//   Step 7  (3i) Paycheck Buffer — live net preview, optional toggle, $200 ceiling
//   Step 8  (3j) Tax Exempt Gate — 3 UI variants (A/B/C) behind GATE_VARIANT const
//
// All 9 step components are wired. Phase 4 App.jsx integration complete.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { buildYear } from "../lib/finance.js";
import { iS, lS } from "./ui.jsx";
import { FISCAL_YEAR_START, DHL_PRESET } from "../constants/config.js";

import { STATE_TAX_TABLE, STATE_NAMES } from "../constants/stateTaxTable.js";

// ─────────────────────────────────────────────────────────────────────────────
// STEP 0 — Welcome (first-run) / Life Event Select (re-entry)
// ─────────────────────────────────────────────────────────────────────────────
const LIFE_EVENTS = [
  { value: "lost_job",      label: "Lost my job",            sub: "Updates pay structure, schedule, deductions, and tax rates" },
  { value: "changed_jobs",  label: "Changed jobs",           sub: "Full re-setup — FICA and tax strategy pre-filled from current config" },
  { value: "commission_job", label: "Got a commission job",  sub: "Adds commission income to your pay structure" },
];

function Step0({ lifeEvent, onLifeEventChange }) {
  // ── First-run ──────────────────────────────────────────────────────────────
  if (lifeEvent === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
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
          Have a recent paystub? You'll sharpen tax rates from the Income panel — no rush now.
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
              background: active ? "rgba(201,168,76,0.10)" : "var(--color-bg-raised)",
              border: `1px solid ${active ? "rgba(201,168,76,0.4)" : "var(--color-border-subtle)"}`,
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
function Pill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px",
        fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase",
        background: active ? "rgba(201,168,76,0.12)" : "var(--color-bg-raised)",
        color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
        border: `1px solid ${active ? "rgba(201,168,76,0.4)" : "var(--color-border-subtle)"}`,
        borderRadius: "10px", cursor: "pointer",
        transition: "background 0.15s, border-color 0.15s, color 0.15s",
      }}
    >
      {active && "✓ "}{label}
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

function Field({ label, children }) {
  return (
    <div>
      <label style={lS}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Pay Structure
// ─────────────────────────────────────────────────────────────────────────────
const OT_THRESHOLDS = [40, 48];
const OT_MULTIPLIERS = [1.5, 2];

function Step1({ formData, onChange, lifeEvent }) {
  // Gate: has the user answered "Do you work for DHL?" yet?
  const [gateTouched, setGateTouched] = useState(
    formData.employerPreset === "DHL" || formData.setupComplete === true
  );

  // Local tracking for custom OT threshold input
  const [otCustom, setOtCustom] = useState(
    !OT_THRESHOLDS.includes(formData.otThreshold)
  );

  // Commission toggle
  const [hasCommission, setHasCommission] = useState(
    (formData.commissionMonthly ?? 0) > 0
  );

  const isDHL = formData.employerPreset === "DHL";

  function setDHL(yes) {
    setGateTouched(true);
    if (yes) {
      onChange({
        employerPreset: "DHL",
        scheduleIsVariable: true,
        bucketStartBalance: 64,
        bucketCap: 128,
        bucketPayoutRate: 9.825,
      });
    } else {
      onChange({ employerPreset: null });
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Employer Preset Gate ── */}
      <Field label="Do you work for DHL?">
        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <Pill label="Yes" active={isDHL} onClick={() => setDHL(true)} />
          <Pill label="No"  active={gateTouched && !isDHL} onClick={() => setDHL(false)} />
        </div>
        {isDHL && (
          <div style={{
            marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)",
            lineHeight: "1.5",
          }}>
            Rotation, attendance, and dual-rate auto-configured. Weekend rate pre-filled — night shift differential set in the next step.
          </div>
        )}
      </Field>

      {/* ── Pay fields (shown once gate answered) ── */}
      {gateTouched && (
        <>
          <FieldRow>
            <Field label="Base Rate ($/hr)">
              <input
                {...iS}
                style={{ ...iS }}
                type="number" min="0" step="0.01"
                value={formData.baseRate ?? ""}
                onChange={e => onChange({ baseRate: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 19.65"
              />
            </Field>
            <Field label="Shift Length (hrs)">
              <input
                {...iS}
                style={{ ...iS }}
                type="number" min="1" step="0.5"
                value={formData.shiftHours ?? ""}
                onChange={e => onChange({ shiftHours: parseFloat(e.target.value) || 0 })}
                placeholder="e.g. 10"
              />
            </Field>
          </FieldRow>

          {/* ── Weekend Differential ── directly configurable; 0 = no differential ── */}
          <Field label="Weekend Differential ($/hr)">
            <input
              {...iS}
              style={{ ...iS }}
              type="number" min="0" step="0.25"
              value={formData.diffRate ?? ""}
              onChange={e => onChange({ diffRate: parseFloat(e.target.value) || 0 })}
              placeholder="0 = no differential"
            />
          </Field>

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
            </div>
            {otCustom && (
              <div style={{ marginTop: "10px" }}>
                <label style={lS}>Hours/week</label>
                <input
                  {...iS}
                  style={{ ...iS }}
                  type="number" min="1" step="1"
                  value={formData.otThreshold ?? ""}
                  onChange={e => onChange({ otThreshold: parseInt(e.target.value) || 40 })}
                  placeholder="e.g. 40"
                />
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
                    {...iS}
                    style={{ ...iS }}
                    type="number" min="0" step="100"
                    value={formData.commissionMonthly ?? ""}
                    onChange={e => onChange({ commissionMonthly: parseFloat(e.target.value) || 0 })}
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
  return Math.max(0, Math.ceil(diffDays / 7));
}

function Step2({ formData, onChange }) {
  const isDHL = formData.employerPreset === "DHL";

  function handleDateChange(dateStr) {
    if (!dateStr) return;
    onChange({ startDate: dateStr, firstActiveIdx: dateToWeekIdx(dateStr) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Job start date ── */}
      <Field label="Job Start Date">
        <input
          {...iS}
          style={{ ...iS }}
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
      {isDHL ? (
        <Field label="Which week are you currently on?">
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <Pill
              label="Short week (3-Day)"
              active={formData.startingWeekIsLong === false}
              onClick={() => onChange({ startingWeekIsLong: false })}
            />
            <Pill
              label="Long week (4-Day)"
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
        <Field label="Standard Weekly Hours">
          <input
            {...iS}
            style={{ ...iS }}
            type="number" min="1" step="0.5"
            value={formData.standardWeeklyHours ?? ""}
            onChange={e => onChange({ standardWeeklyHours: parseFloat(e.target.value) || 40 })}
            placeholder="e.g. 40"
          />
          <div style={{
            marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)",
          }}>
            Deviations are logged week-by-week from the dashboard.
          </div>
        </Field>
      )}

      {/* ── Pay period end day ── */}
      <Field label="Pay Period Closes On">
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

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Deductions
// ─────────────────────────────────────────────────────────────────────────────
const BENEFIT_DEFS = [
  { id: "health", label: "Health / Medical",      sub: "Medical insurance premium",                    type: "weekly", field: "healthPremium", placeholder: "e.g. 18.50" },
  { id: "dental", label: "Dental",                sub: "Dental insurance premium",                     type: "weekly", field: "dentalPremium", placeholder: "e.g. 4.00"  },
  { id: "vision", label: "Vision",                sub: "Vision insurance premium",                     type: "weekly", field: "visionPremium", placeholder: "e.g. 2.00"  },
  { id: "ltd",    label: "Long-Term Disability",  sub: "LTD insurance — flat weekly deduction",        type: "weekly", field: "ltd",           placeholder: "e.g. 2.00"  },
  { id: "std",    label: "Short-Term Disability", sub: "STD insurance — flat weekly deduction",        type: "weekly", field: "stdWeekly",     placeholder: "e.g. 1.50"  },
  { id: "life",   label: "Life / AD&D",           sub: "Group life insurance premium",                 type: "weekly", field: "lifePremium",   placeholder: "e.g. 1.00"  },
  { id: "k401",   label: "401(k) / Retirement",   sub: "Pre-tax contribution + employer match",        type: "k401"                                                        },
  { id: "hsa",    label: "HSA",                   sub: "Health Savings Account — weekly contribution", type: "weekly", field: "hsaWeekly",     placeholder: "e.g. 15.00" },
  { id: "fsa",    label: "FSA",                   sub: "Flexible Spending Account — weekly contribution", type: "weekly", field: "fsaWeekly", placeholder: "e.g. 10.00" },
];

function BenefitCard({ def, selected, formData, onChange, onToggle }) {
  return (
    <div style={{
      border: `1px solid ${selected ? "rgba(201,168,76,0.4)" : "var(--color-border-subtle)"}`,
      borderRadius: "12px",
      background: selected ? "rgba(201,168,76,0.06)" : "var(--color-bg-raised)",
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
          borderTop: "1px solid rgba(201,168,76,0.12)",
          display: "flex", flexDirection: "column", gap: "12px",
        }}>
          {def.type === "weekly" && (
            <Field label="Weekly Deduction ($)">
              <input
                {...iS}
                style={{ ...iS }}
                type="number" min="0" step="0.01"
                value={formData[def.field] ?? ""}
                onChange={e => onChange({ [def.field]: parseFloat(e.target.value) || 0 })}
                placeholder={def.placeholder}
              />
            </Field>
          )}
          {def.type === "k401" && (
            <>
              <FieldRow>
                <Field label="Your Contribution (%)">
                  <input
                    {...iS}
                    style={{ ...iS }}
                    type="number" min="0" max="100" step="0.5"
                    value={
                      formData.k401Rate != null
                        ? +(formData.k401Rate * 100).toFixed(2)
                        : ""
                    }
                    onChange={e => onChange({ k401Rate: (parseFloat(e.target.value) || 0) / 100 })}
                    placeholder="e.g. 6"
                  />
                </Field>
                <Field label="Employer Match (%)">
                  <input
                    {...iS}
                    style={{ ...iS }}
                    type="number" min="0" max="100" step="0.5"
                    value={
                      formData.k401MatchRate != null
                        ? +(formData.k401MatchRate * 100).toFixed(2)
                        : ""
                    }
                    onChange={e => onChange({ k401MatchRate: (parseFloat(e.target.value) || 0) / 100 })}
                    placeholder="e.g. 5"
                  />
                </Field>
              </FieldRow>
              <Field label="Enrollment / Start Date">
                <input
                  {...iS}
                  style={{ ...iS }}
                  type="date"
                  value={formData.k401StartDate ?? ""}
                  onChange={e => onChange({ k401StartDate: e.target.value || null })}
                />
                <div style={{
                  marginTop: "6px", fontSize: "11px",
                  color: "var(--color-text-disabled)", lineHeight: "1.5",
                }}>
                  Contributions begin the week this date falls in. Past dates mark 401k as already active.
                </div>
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Step3({ formData, onChange }) {
  const selected = new Set(formData.selectedBenefits ?? []);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      // Zero out fields when deselected so they don't ghost into calculations
      const def = BENEFIT_DEFS.find(d => d.id === id);
      if (def?.type === "weekly") onChange({ [def.field]: 0 });
      if (def?.type === "k401") onChange({ k401Rate: 0, k401MatchRate: 0, k401StartDate: null });
    } else {
      next.add(id);
    }
    onChange({ selectedBenefits: [...next] });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{
        fontSize: "13px", color: "var(--color-text-secondary)",
        margin: "0 0 8px", lineHeight: "1.5",
      }}>
        Select benefits deducted from your paycheck — skip if none yet.
      </p>
      <div style={{
        display: "flex", flexDirection: "column", gap: "8px",
        maxHeight: "340px", overflowY: "auto",
        paddingRight: "2px",          // prevent scrollbar overlap
      }}>
        {BENEFIT_DEFS.map(def => (
          <BenefitCard
            key={def.id}
            def={def}
            selected={selected.has(def.id)}
            formData={formData}
            onChange={onChange}
            onToggle={() => toggle(def.id)}
          />
        ))}
      </div>
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
            <input {...iS} style={{ ...iS }} type="number" min="0" step="0.01"
              value={g1} onChange={e => setG1(e.target.value)} placeholder="e.g. 1050" />
          </Field>
          <Field label="Fed Income Tax Withheld ($)">
            <input {...iS} style={{ ...iS }} type="number" min="0" step="0.01"
              value={f1} onChange={e => setF1(e.target.value)} placeholder="e.g. 82" />
          </Field>
        </FieldRow>
        {!isNoTax && (
          <Field label="State Income Tax Withheld ($)">
            <input {...iS} style={{ ...iS }} type="number" min="0" step="0.01"
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
              <input {...iS} style={{ ...iS }} type="number" min="0" step="0.01"
                value={g2} onChange={e => setG2(e.target.value)} placeholder="e.g. 1450" />
            </Field>
            <Field label="Fed Income Tax Withheld ($)">
              <input {...iS} style={{ ...iS }} type="number" min="0" step="0.01"
                value={f2} onChange={e => setF2(e.target.value)} placeholder="e.g. 186" />
            </Field>
          </FieldRow>
          {!isNoTax && (
            <Field label="State Income Tax Withheld ($)">
              <input {...iS} style={{ ...iS }} type="number" min="0" step="0.01"
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

function Step4({ formData, onChange }) {
  const isDHL      = formData.employerPreset === "DHL";
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
    const stateEst = isNoTax ? 0 : (stateConfig?.flatRate ?? 0.05);
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

      {/* Variable schedule gate — non-DHL users only */}
      {isDHL ? (
        <div style={{
          fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.5",
          padding: "10px 12px", background: "var(--color-bg-raised)", borderRadius: "8px",
        }}>
          Variable schedule auto-enabled — your pay alternates between shorter and longer weeks.
        </div>
      ) : (
        <Field label="Does your pay vary week to week?">
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <Pill label="Yes" active={isVariable === true}
              onClick={() => onChange({ scheduleIsVariable: true })} />
            <Pill label="No"  active={isVariable === false}
              onClick={() => onChange({ scheduleIsVariable: false })} />
          </div>
          {isVariable && (
            <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)" }}>
              You'll enter two paystubs — one for each week type.
            </div>
          )}
        </Field>
      )}

      {/* State dropdown */}
      <Field label="Your State">
        <select
          style={{ ...iS, appearance: "none", WebkitAppearance: "none" }}
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
              : "Progressive brackets — estimate uses a mid-bracket approximation."}
          </div>
        )}
      </Field>

      {/* DHL MO preset load button — only when no rates set yet */}
      {isDHL && !hasRates && formData.userState === "MO" && (
        <div style={{
          padding: "12px 14px",
          background: "rgba(201,168,76,0.06)",
          border: "1px solid rgba(201,168,76,0.2)",
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
            background: "rgba(201,168,76,0.12)", color: "var(--color-gold)",
            border: "1px solid rgba(201,168,76,0.4)", borderRadius: "10px",
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

      {/* Rate summary */}
      {hasRates && (
        <div style={{
          padding: "12px 14px", background: "var(--color-bg-raised)", borderRadius: "10px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "10px",
          }}>
            <div style={{
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              color: "var(--color-text-disabled)",
            }}>
              Current Rates
            </div>
            <span style={{
              fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase",
              padding: "2px 8px", borderRadius: "6px",
              background: formData.taxRatesEstimated
                ? "rgba(201,168,76,0.12)" : "rgba(76,175,125,0.12)",
              color: formData.taxRatesEstimated
                ? "var(--color-gold)" : "var(--color-green)",
              border: `1px solid ${formData.taxRatesEstimated
                ? "rgba(201,168,76,0.3)" : "rgba(76,175,125,0.3)"}`,
            }}>
              {formData.taxRatesEstimated ? "Estimated" : "Confirmed"}
            </span>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "11px",
          }}>
            <div style={{ color: "var(--color-text-secondary)" }}>
              Fed {isVariable ? "(short)" : "rate"}:{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {pct(formData.fedRateLow)}
              </strong>
            </div>
            {isVariable && (
              <div style={{ color: "var(--color-text-secondary)" }}>
                Fed (long):{" "}
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {pct(formData.fedRateHigh)}
                </strong>
              </div>
            )}
            <div style={{ color: "var(--color-text-secondary)" }}>
              State {isVariable ? "(short)" : "rate"}:{" "}
              <strong style={{ color: "var(--color-text-primary)" }}>
                {isNoTax ? "0% (no state tax)" : pct(formData.stateRateLow)}
              </strong>
            </div>
            {isVariable && !isNoTax && (
              <div style={{ color: "var(--color-text-secondary)" }}>
                State (long):{" "}
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {pct(formData.stateRateHigh)}
                </strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — Annual Tax Summary (read-only confirmation)
//
// No inputs. Shows the tax picture the app will use so the user can confirm
// before finishing the wizard. Tax strategy (exempt juggling, extra withholding
// tuning) is behind a feature gate — not part of the wizard.
// ─────────────────────────────────────────────────────────────────────────────
function Step5({ formData }) {
  const stateConfig = formData.userState ? STATE_TAX_TABLE[formData.userState] : null;
  const isNoTax     = stateConfig?.model === "NONE";
  const isVariable  = formData.scheduleIsVariable;
  const pct = n => (n * 100).toFixed(2) + "%";

  const rowStyle = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "9px 0", borderBottom: "1px solid #1a1a1a",
  };
  const labelStyle = { fontSize: "12px", color: "var(--color-text-secondary)" };
  const valStyle   = { fontSize: "12px", fontWeight: "bold", color: "var(--color-text-primary)" };
  const estStyle   = { fontSize: "12px", fontWeight: "bold", color: "var(--color-gold)" };

  function Row({ label, value, estimated }) {
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={estimated ? estStyle : valStyle}>
          {value}{estimated ? " est." : ""}
        </span>
      </div>
    );
  }

  const sectionStyle = {
    background: "var(--color-bg-raised)", borderRadius: "10px",
    padding: "14px 16px", display: "flex", flexDirection: "column",
  };
  const sectionHeader = {
    fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
    color: "var(--color-text-disabled)", marginBottom: "4px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: 0, lineHeight: "1.6" }}>
        Your tax picture — refine anytime via Income → Sharpen Rates.
      </p>

      {/* Federal */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>Federal Income Tax</div>
        <Row label="Standard Deduction (2026)" value={`$${(formData.fedStdDeduction ?? 15000).toLocaleString()}`} />
        <Row label="FICA (Social Security + Medicare)" value={pct(formData.ficaRate ?? 0.0765)} />
        <Row
          label={isVariable ? "Effective Rate — Short Weeks" : "Effective Rate"}
          value={pct(formData.fedRateLow)}
          estimated={formData.taxRatesEstimated}
        />
        {isVariable && (
          <Row
            label="Effective Rate — Long Weeks"
            value={pct(formData.fedRateHigh)}
            estimated={formData.taxRatesEstimated}
          />
        )}
      </div>

      {/* State */}
      <div style={sectionStyle}>
        <div style={sectionHeader}>
          State Income Tax — {stateConfig?.name ?? formData.userState ?? "Not set"}
        </div>
        {isNoTax ? (
          <div style={{ fontSize: "12px", color: "var(--color-text-disabled)", paddingTop: "6px" }}>
            No state income tax. State rate is 0%.
          </div>
        ) : (
          <>
            <Row
              label={isVariable ? "Effective Rate — Short Weeks" : "Effective Rate"}
              value={pct(formData.stateRateLow)}
              estimated={formData.taxRatesEstimated}
            />
            {isVariable && (
              <Row
                label="Effective Rate — Long Weeks"
                value={pct(formData.stateRateHigh)}
                estimated={formData.taxRatesEstimated}
              />
            )}
            {stateConfig?.model === "PROGRESSIVE" && (
              <div style={{ fontSize: "11px", color: "var(--color-text-disabled)", paddingTop: "8px", lineHeight: "1.5" }}>
                Progressive — effective rates (withheld ÷ gross), not marginal.
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation note */}
      {formData.taxRatesEstimated && (
        <div style={{
          fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.6",
          padding: "10px 12px",
          background: "rgba(201,168,76,0.06)",
          border: "1px solid rgba(201,168,76,0.2)",
          borderRadius: "8px",
        }}>
          Rates marked <strong style={{ color: "var(--color-gold)" }}>est.</strong> are estimates —
          confirm with a paystub via <strong style={{ color: "var(--color-gold)" }}>Sharpen Rates</strong> in Income.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 — Other Deductions & Attendance
//
// Remaining pieces after Step 3 already captured preset benefits:
//   1. Benefits start date — when health/dental/vision activates
//   2. Other deductions — freeform repeatable label + weekly amount rows
//   3. Attendance gate — points/hours system? Skipped for DHL.
// ─────────────────────────────────────────────────────────────────────────────
function Step6({ formData, onChange }) {
  const isDHL = formData.employerPreset === "DHL";
  const others = formData.otherDeductions ?? [];

  function addRow() {
    const id = Date.now().toString(36);
    onChange({ otherDeductions: [...others, { id, label: "", weeklyAmount: 0 }] });
  }

  function updateRow(id, patch) {
    onChange({
      otherDeductions: others.map(r => r.id === id ? { ...r, ...patch } : r),
    });
  }

  function removeRow(id) {
    onChange({ otherDeductions: others.filter(r => r.id !== id) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Benefits start date ── */}
      <Field label="Benefits Start Date">
        <input
          {...iS} style={{ ...iS }}
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
        <label style={lS}>Other Recurring Deductions</label>
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
                {...iS} style={{ ...iS }}
                type="text"
                placeholder="Label (e.g. Union Dues)"
                value={row.label}
                onChange={e => updateRow(row.id, { label: e.target.value })}
              />
              <input
                {...iS} style={{ ...iS }}
                type="number" min="0" step="0.01"
                placeholder="$/wk"
                value={row.weeklyAmount || ""}
                onChange={e => updateRow(row.id, { weeklyAmount: parseFloat(e.target.value) || 0 })}
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
              >
                ×
              </button>
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
      {!isDHL && (
        <Field label="Does your employer track attendance with a formal policy?">
          <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "10px", lineHeight: "1.5" }}>
            Points systems, hours-based buckets, or similar. Not just "you can call out."
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
          {formData.attendanceBucketEnabled === true && (
            <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: "1.5" }}>
              Bucket tracking on — configure rates and caps after setup.
            </div>
          )}
        </Field>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 15 — DHL Team Setup  (sprint 3k)
//
// Only shown when employerPreset === "DHL" (Step 1 gate).
// Captures four things:
//   1. Team A or B → derives startingWeekIsHeavy; applies DHL_PRESET.defaults
//   2. Standard rotation vs custom schedule → dhlCustomSchedule
//   3. Night shift vs morning shift → stored as dhlNightShift for future
//      night-differential tracking. No longer affects weekend diff — all shifts
//      earn cfg.diffRate on weekend hours equally (corrected 2026-03-24).
//   4. OT day preference → dhlOtOnWeekend
// isValid blocks until dhlTeam is set.
// ─────────────────────────────────────────────────────────────────────────────
function Step15({ formData, onChange }) {
  const team = formData.dhlTeam;
  const isCustom = formData.dhlCustomSchedule === true;
  const isNight = formData.dhlNightShift !== false; // default true

  function pickTeam(t) {
    const preset = DHL_PRESET.teams[t];
    const d = DHL_PRESET.defaults;
    onChange({
      dhlTeam: t,
      startingWeekIsLong: preset.startsLong,
      // Apply preset defaults only for standard fields not yet wizard-confirmed
      shiftHours:         d.shiftHours,
      otThreshold:        d.otThreshold,
      otMultiplier:       d.otMultiplier,
      scheduleIsVariable: d.scheduleIsVariable,
      payPeriodEndDay:    d.payPeriodEndDay,
      bucketStartBalance: d.bucketStartBalance,
      bucketCap:          d.bucketCap,
      bucketPayoutRate:   d.bucketPayoutRate,
    });
  }

  const firstWeekLabel = team
    ? (DHL_PRESET.teams[team].startsLong
        ? `${DHL_PRESET.rotation.long.label} (your first active week)`
        : `${DHL_PRESET.rotation.short.label} (your first active week)`)
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Team A / B ── */}
      <Field label="Which DHL team are you on?">
        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <Pill label="Team A" active={team === "A"} onClick={() => pickTeam("A")} />
          <Pill label="Team B" active={team === "B"} onClick={() => pickTeam("B")} />
        </div>
        {firstWeekLabel && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
            {firstWeekLabel}. Teams alternate every week — while A works their 3-day, B works their 4-day.
          </div>
        )}
        {!team && (
          <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
            Team A starts on a short week (Mon / Thu / Fri). Team B starts on a long week (Tue / Wed / Sat / Sun).
          </div>
        )}
      </Field>

      {/* ── Standard vs custom rotation ── */}
      <Field label="Do you follow the standard DHL rotation?">
        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <Pill
            label="Standard rotation"
            active={!isCustom}
            onClick={() => onChange({ dhlCustomSchedule: false })}
          />
          <Pill
            label="I have a custom schedule"
            active={isCustom}
            onClick={() => onChange({ dhlCustomSchedule: true })}
          />
        </div>
        <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
          {isCustom
            ? "Manual — adjust direction in the Schedule step."
            : "Standard rotation. Override per-week from Income if you pick up extra shifts."}
        </div>
      </Field>

      {/* ── Night shift vs morning shift ── */}
      <Field label="Which shift do you work?">
        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          <Pill
            label="Night shift (+diff)"
            active={isNight}
            onClick={() => onChange({ dhlNightShift: true })}
          />
          <Pill
            label="Morning shift"
            active={!isNight}
            onClick={() => onChange({ dhlNightShift: false })}
          />
        </div>
        <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
          All shifts earn the {formData.diffRate ? `$${Number(formData.diffRate).toFixed(2)}/hr` : "shift"} weekend differential.
          Night shift adds +${Number(formData.nightDiffRate || 1.50).toFixed(2)}/hr on all hours (stacks with weekend).
        </div>
      </Field>

      {/* ── OT preference (non-blocking) ── */}
      <Field label="Where do you typically take your required OT shift?">
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
          <Pill
            label="Weekday only"
            active={formData.dhlOtOnWeekend === false}
            onClick={() => onChange({ dhlOtOnWeekend: false })}
          />
          <Pill
            label="Sometimes weekend (Sat / Sun)"
            active={formData.dhlOtOnWeekend === true}
            onClick={() => onChange({ dhlOtOnWeekend: true })}
          />
        </div>
        <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
          Weekend OT earns the differential — weekday OT does not.
        </div>
      </Field>
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
  const isDHL = d.employerPreset === "DHL";
  if (isDHL) {
    // Short-week DHL: 4 shifts × shiftHours = 48h; long = 6 × 12 = 72h.
    // Use a weighted average (26 short + 26 long per year).
    const shortH = 4 * (d.shiftHours || 12);
    const longH  = 6 * (d.shiftHours || 12);
    const gross = (h) => {
      const base = d.baseRate || 0;
      const reg = Math.min(h, d.otThreshold || 40);
      const ot = Math.max(h - (d.otThreshold || 40), 0);
      return reg * base + ot * base * (d.otMultiplier || 1.5);
    };
    return (gross(shortH) + gross(longH)) / 2;
  }
  if (d.scheduleIsVariable) {
    // Two-rate variable: average of both gross estimates.
    const h1 = (d.standardWeeklyHours || 40);
    const h2 = (d.longWeeklyHours || 50);
    const gross = (h) => {
      const base = d.baseRate || 0;
      const reg = Math.min(h, d.otThreshold || 40);
      const ot = Math.max(h - (d.otThreshold || 40), 0);
      return reg * base + ot * base * (d.otMultiplier || 1.5);
    };
    return (gross(h1) + gross(h2)) / 2;
  }
  // Standard fixed schedule — no OT assumed for typical estimate.
  const h = d.standardWeeklyHours || 40;
  return h * (d.baseRate || 0);
}

// ─── STEP 7 — Paycheck Buffer ────────────────────────────────────────────────
// The buffer is an optional per-week amount excluded from every spendable
// calculation in the app. It is NOT a deduction — the money lands on the
// paycheck normally — but the app's budget, goal, and income math treat it
// as invisible, letting it accumulate quietly as a safety reserve.
//
// Max: $200/week  Default: On at $50
// ─────────────────────────────────────────────────────────────────────────────
const BUFFER_MAX = 200;

function Step7({ formData, onChange }) {
  const gross = estimateWeeklyGross(formData);
  const fica = gross * (formData.ficaRate || 0.0765);
  const k401k = gross * (formData.k401Rate || 0);
  const benefits =
    (formData.healthPremium || 0) +
    (formData.dentalPremium || 0) +
    (formData.visionPremium || 0) +
    (formData.stdWeekly || 0) +
    (formData.lifePremium || 0) +
    (formData.hsaWeekly || 0) +
    (formData.fsaWeekly || 0) +
    (formData.ltd || 0);
  const other = (formData.otherDeductions || []).reduce((s, r) => s + (r.weeklyAmount || 0), 0);
  const fed = gross * (formData.fedRateLow || 0);
  const state = gross * (formData.stateRateLow || 0);
  const net = gross - fica - k401k - benefits - other - fed - state;

  // Buffer toggle state — bufferEnabled defaults to true (on)
  const bufferOn = formData.bufferEnabled ?? true;
  const buf      = formData.paycheckBuffer ?? 50;

  const rows = [
    { label: "Gross Pay",      val: gross,    sign: "" },
    { label: "Federal Tax",    val: fed,      sign: "−" },
    { label: "State Tax",      val: state,    sign: "−" },
    { label: "FICA",           val: fica,     sign: "−" },
    { label: "401(k)",         val: k401k,    sign: "−" },
    { label: "Benefits",       val: benefits, sign: "−" },
    { label: "Other Deduct.", val: other,    sign: "−" },
  ];

  const fmt = (n) => `$${Math.abs(n).toFixed(2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Live net estimate ── */}
      <div>
        <label style={lS}>Estimated Weekly Net</label>
        <div style={{
          marginTop: "10px",
          background: "var(--color-bg-raised)",
          borderRadius: "12px", padding: "16px",
          border: "1px solid var(--color-border-subtle)",
        }}>
          {rows.map(r => (
            <div key={r.label} style={{
              display: "flex", justifyContent: "space-between",
              padding: "4px 0",
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              borderBottom: "1px solid rgba(255,255,255,0.04)",
            }}>
              <span>{r.label}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {r.sign} {fmt(r.val)}
              </span>
            </div>
          ))}
          <div style={{
            display: "flex", justifyContent: "space-between",
            paddingTop: "10px", marginTop: "4px",
          }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
              Net
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700,
              color: net >= 0 ? "var(--color-green)" : "var(--color-red)",
            }}>
              {fmt(net)}
            </span>
          </div>
        </div>
        <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
          Estimated average from your setup so far.
          {formData.taxRatesEstimated && " Tax rates are estimated — confirm via Sharpen Rates."}
        </div>
      </div>

      {/* ── Paycheck buffer toggle ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.6" }}>
          A paycheck buffer is a fixed amount from every check that the app
          doesn't count as spendable income. Turn it on to build a quiet
          safety reserve without cluttering your budget.
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <Pill label="On"  active={bufferOn}  onClick={() => onChange({ bufferEnabled: true  })} />
          <Pill label="Off" active={!bufferOn} onClick={() => onChange({ bufferEnabled: false })} />
        </div>
        {/* Amount input — only visible when buffer is on */}
        {bufferOn && (
          <>
            <input
              {...iS} style={{ ...iS }}
              type="number" min="0" max={BUFFER_MAX} step="1"
              value={buf || ""}
              onChange={e => {
                // Clamp to BUFFER_MAX ceiling; do not enforce a floor
                const v = Math.min(parseFloat(e.target.value) || 0, BUFFER_MAX);
                onChange({ paycheckBuffer: v });
              }}
              placeholder="e.g. 50"
            />
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
              At ${buf}/week — ${(buf * 52).toLocaleString()} reserved annually.
            </div>
          </>
        )}
      </div>
    </div>
  );
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

function Step8({ formData, onChange }) {
  const accepted = formData.taxExemptOptIn === true;
  const accept = () => onChange({ taxExemptOptIn: true });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {!accepted ? (
        <div style={{
          background: "var(--color-bg-raised)", borderRadius: "12px", padding: "18px 16px",
          border: "1px dashed rgba(201,168,76,0.3)",
          display: "flex", flexDirection: "column", gap: "12px", alignItems: "flex-start",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "18px", opacity: 0.5 }}>🔒</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-secondary)" }}>
              Tax-Exempt Week Projections
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-disabled)", lineHeight: "1.6" }}>
            {TAX_EXEMPT_DISCLAIMER}
          </p>
          <button onClick={accept} style={{
            background: "var(--color-gold)", color: "var(--color-bg-base)",
            border: "none", borderRadius: "10px", padding: "8px 16px",
            fontSize: "10px", letterSpacing: "1.5px", fontWeight: 700,
            textTransform: "uppercase", cursor: "pointer",
          }}>
            Unlock projections
          </button>
        </div>
      ) : (
        <TaxExemptPreview />
      )}
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
    id: 0, title: "Welcome", sprint: "3b",
    showIf: () => true,
    isValid: (_, ev) => ev === null || ev !== null, // re-entry: event already set by sidebar
    component: Step0,
  },
  {
    id: 1, title: "Pay Structure", sprint: "3c",
    showIf: () => true,
    isValid: (d) => d.baseRate > 0 && d.shiftHours > 0,
    component: Step1,
  },
  {
    id: 15, title: "DHL Team Setup", sprint: "3k",
    showIf: (d) => d.employerPreset === "DHL",
    isValid: (d) => d.dhlTeam !== null,
    component: Step15,
  },
  {
    id: 2, title: "Schedule", sprint: "3d",
    showIf: () => true,
    isValid: (d) => d.startDate != null,
    component: Step2,
  },
  {
    id: 3, title: "Deductions", sprint: "3e",
    showIf: () => true,
    isValid: () => true,
    skippable: true,
    component: Step3,
  },
  {
    id: 4, title: "Tax Rates", sprint: "3f",
    showIf: () => true,
    isValid: (d) => d.fedRateLow > 0 && d.userState != null,
    component: Step4,
  },
  {
    id: 5, title: "Tax Summary", sprint: "3g",
    showIf: (_, ev) => ev !== "lost_job",
    isValid: () => true,
    component: Step5,
  },
  {
    id: 6, title: "Other Deductions", sprint: "3h",
    showIf: (_, ev) => ev === null || ev === "changed_jobs",
    isValid: (d) => d.employerPreset === "DHL" || d.attendanceBucketEnabled !== null,
    skippable: true,
    component: Step6,
  },
  {
    id: 7, title: "Paycheck Buffer", sprint: "3i",
    showIf: (_, ev) => ev === null || ev === "changed_jobs",
    isValid: () => true,  // buffer is optional; toggle + amount are both optional
    component: Step7,
  },
  {
    id: 8, title: "Tax Exempt Gate", sprint: "3j",
    showIf: (_, ev) => ev === null || ev === "changed_jobs",
    isValid: (d) => d.taxExemptOptIn === true,
    component: Step8,
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
export function SetupWizard({ config, onComplete, lifeEvent: initialLifeEvent = null }) {
  const [stepIdx,   setStepIdx]   = useState(0);
  const [formData,  setFormData]  = useState({ ...config });
  const [lifeEvent, setLifeEvent] = useState(initialLifeEvent);

  const activeSteps = STEP_DEFS.filter(s => s.showIf(formData, lifeEvent));
  const current     = activeSteps[stepIdx];
  const isLast      = stepIdx === activeSteps.length - 1;
  const canProceed  = current?.isValid(formData, lifeEvent) ?? false;

  function update(patch) {
    setFormData(prev => ({ ...prev, ...patch }));
  }

  function handleNext() {
    if (!isLast) setStepIdx(i => i + 1);
    else handleComplete();
  }

  function handleBack() {
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }

  function handleComplete() {
    const allWeeks   = buildYear(formData);
    const taxedWeeks = allWeeks
      .filter(w => w.idx >= (formData.firstActiveIdx ?? 0))
      .map(w => w.idx);
    onComplete({ ...formData, taxedWeeks, setupComplete: true });
  }

  const progressPct = ((stepIdx + 1) / activeSteps.length) * 100;
  const StepComponent = current?.component ?? null;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--color-bg-base)",
      overflowY: "auto", WebkitOverflowScrolling: "touch",
      display: "flex", flexDirection: "column",
      alignItems: "center",
      padding: "24px 16px", zIndex: 100,
    }}>
      <div style={{
        width: "100%", maxWidth: "480px",
        margin: "auto",
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "20px",
        padding: "28px 24px",
        display: "flex", flexDirection: "column", gap: "28px",
      }}>

        {/* ── Header: step counter + title + progress bar ── */}
        <div>
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

        {/* ── Step content ── */}
        <div style={{ minHeight: "160px" }}>
          {StepComponent
            ? <StepComponent
                formData={formData}
                onChange={update}
                lifeEvent={lifeEvent}
                onLifeEventChange={setLifeEvent}
              />
            : <StepStub title={current?.title} sprint={current?.sprint} />
          }
        </div>

        {/* ── Navigation ── */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
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
              onClick={handleNext}
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
