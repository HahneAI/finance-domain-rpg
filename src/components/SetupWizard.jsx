import { useState } from "react";
import { buildYear } from "../lib/finance.js";
import { iS, lS } from "./ui.jsx";

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
          Before we build your dashboard, let's capture your pay setup.
          This takes about 3 minutes. You'll be able to update anything
          anytime from the Life Events menu.
        </p>
        <p style={{
          fontSize: "12px", lineHeight: "1.6",
          color: "var(--color-text-disabled)", margin: 0,
        }}>
          You don't need your paystub today — but as soon as you can input
          the tax numbers the government took off of you, the sooner we can
          sharpen your budget to exact pennies.
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
const DIFF_TYPES = ["Overnight", "Weekend"];

function Step1({ formData, onChange, lifeEvent }) {
  // Gate: has the user answered "Do you work for DHL?" yet?
  const [gateTouched, setGateTouched] = useState(
    formData.employerPreset === "DHL" || formData.setupComplete === true
  );

  // Local tracking for which diff types are selected (multiselect)
  const [diffTypes, setDiffTypes] = useState(() => {
    if (formData.diffRate > 0) return new Set(["Weekend"]);
    return new Set();
  });

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

  function toggleDiffType(type) {
    setDiffTypes(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      // If all cleared, zero out diffRate
      if (next.size === 0) onChange({ diffRate: 0 });
      return next;
    });
  }

  function clearDiffs() {
    setDiffTypes(new Set());
    onChange({ diffRate: 0 });
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
            marginTop: "8px", fontSize: "11px", color: "var(--color-text-disabled)",
            lineHeight: "1.5",
          }}>
            Rotation schedule, attendance bucket, and dual-rate logic auto-configured for DHL.
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
                placeholder="e.g. 21.15"
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

          {/* ── Shift Differential ── */}
          <Field label="Shift Differential">
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              {DIFF_TYPES.map(t => (
                <Pill
                  key={t} label={t}
                  active={diffTypes.has(t)}
                  onClick={() => toggleDiffType(t)}
                />
              ))}
              <Pill label="None" active={diffTypes.size === 0} onClick={clearDiffs} />
            </div>
            {diffTypes.size > 0 && (
              <div style={{ marginTop: "10px" }}>
                <label style={lS}>Extra $/hr</label>
                <input
                  {...iS}
                  style={{ ...iS }}
                  type="number" min="0" step="0.25"
                  value={formData.diffRate ?? ""}
                  onChange={e => onChange({ diffRate: parseFloat(e.target.value) || 0 })}
                  placeholder="e.g. 3.00"
                />
              </div>
            )}
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
    id: 2, title: "Schedule", sprint: "3d",
    showIf: () => true,
    isValid: () => true, // TODO 3d: d.firstActiveIdx != null
  },
  {
    id: 3, title: "Deductions", sprint: "3e",
    showIf: () => true,
    isValid: () => true,
  },
  {
    id: 4, title: "Tax Rates", sprint: "3f",
    showIf: () => true,
    isValid: () => true, // TODO 3f: d.fedRateLow > 0 && d.stateRateLow >= 0
  },
  {
    id: 5, title: "Annual Tax Strategy", sprint: "3g",
    showIf: (_, ev) => ev !== "lost_job",
    isValid: () => true,
  },
  {
    id: 6, title: "Benefits Capture", sprint: "3h",
    showIf: (_, ev) => ev === null || ev === "changed_jobs",
    isValid: () => true,
  },
  {
    id: 7, title: "Paycheck Buffer", sprint: "3i",
    showIf: (_, ev) => ev === null || ev === "changed_jobs",
    isValid: (d) => (d.paycheckBuffer ?? 0) >= 50,
  },
  {
    id: 8, title: "Tax Exempt Gate", sprint: "3j",
    showIf: (_, ev) => ev === null || ev === "changed_jobs",
    isValid: () => true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// STUB — placeholder rendered for steps not yet implemented (sprints 3d–3j)
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
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 16px", zIndex: 100,
    }}>
      <div style={{
        width: "100%", maxWidth: "480px",
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
