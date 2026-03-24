import { useState } from "react";
import { buildYear } from "../lib/finance.js";

// ─────────────────────────────────────────────────────────────────────────────
// STEP DEFINITIONS
//
// showIf(formData, lifeEvent) → bool — controls which steps appear per life event
// isValid(formData) → bool          — gates Next button; stubs return true until
//                                     the step UI is implemented in its sprint
//
// Life event routing (from spec):
//   null (first-run)   → all steps 0–8
//   "lost_job"         → steps 0–4 only; steps 5–7 preserved in config but skipped; step 8 skipped
//   "changed_jobs"     → all steps 0–8
//   "commission_job"   → steps 0–5 only; steps 6–8 skipped
// ─────────────────────────────────────────────────────────────────────────────
const STEP_DEFS = [
  {
    id: 0, title: "Welcome", sprint: "3b",
    showIf: () => true,
    isValid: () => true,
  },
  {
    id: 1, title: "Pay Structure", sprint: "3c",
    showIf: () => true,
    isValid: () => true, // TODO 3c: d.baseRate > 0 && d.shiftHours > 0
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
// STUB — placeholder rendered for steps not yet implemented
// Replaced step-by-step in sprints 3b–3j
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
      <div style={{
        fontSize: "15px", color: "var(--color-text-primary)",
        fontFamily: "var(--font-display)",
      }}>
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

  // Partial update — step components call this to write into formData
  function update(patch) {
    setFormData(prev => ({ ...prev, ...patch }));
  }

  function handleNext() {
    if (!isLast) {
      setStepIdx(i => i + 1);
    } else {
      handleComplete();
    }
  }

  function handleBack() {
    if (stepIdx > 0) setStepIdx(i => i - 1);
  }

  // On finish: auto-populate taxedWeeks (all active weeks from firstActiveIdx onward)
  // then hand the merged config up to App.jsx
  function handleComplete() {
    const allWeeks   = buildYear(formData);
    const taxedWeeks = allWeeks
      .filter(w => w.idx >= (formData.firstActiveIdx ?? 0))
      .map(w => w.idx);
    onComplete({ ...formData, taxedWeeks, setupComplete: true });
  }

  const progressPct = ((stepIdx + 1) / activeSteps.length) * 100;

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "var(--color-bg-base)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 16px",
      zIndex: 100,
    }}>
      <div style={{
        width: "100%", maxWidth: "480px",
        background: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "20px",
        padding: "28px 24px",
        display: "flex", flexDirection: "column", gap: "28px",
      }}>

        {/* ── Header: step label + title + progress bar ── */}
        <div>
          <div style={{
            fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase",
            color: "var(--color-text-disabled)", marginBottom: "6px",
          }}>
            Setup · {stepIdx + 1} of {activeSteps.length}
          </div>
          <div style={{
            fontSize: "20px", fontFamily: "var(--font-display)",
            color: "var(--color-text-primary)", fontWeight: "bold", lineHeight: 1.2,
          }}>
            {current?.title}
          </div>

          {/* Progress bar */}
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
          <StepStub title={current?.title} sprint={current?.sprint} />
        </div>

        {/* ── Navigation: Back / Next|Finish ── */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          {stepIdx > 0 && (
            <button
              onClick={handleBack}
              style={{
                background: "var(--color-bg-raised)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "12px",
                padding: "8px 16px",
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
              border: "none",
              borderRadius: "12px",
              padding: "8px 22px",
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
