import { useMemo, useState } from "react";
import { getEffectiveAmount, getPhaseIndex } from "../lib/finance.js";

/**
 * JobLossDashboard — runway-focused tile rendered inline in main-content
 * when `config.jobLossMode === true` (TODO §15.C4).
 *
 * Computes three headline numbers:
 *   - Weekly essential burn  (active essential expenses, triage-aware)
 *   - Runway in days         (savings + projected unemployment ÷ burn × 7)
 *   - Runway cliff date      (today + runway days; amber/red by proximity)
 *
 * Includes:
 *   - "Additional savings" override input — session-only, NOT persisted to
 *     config (per spec — buffer balance vs full savings can differ).
 *   - Scenario toggle: with unemployment / without unemployment, shown
 *     side by side when benefits are configured.
 *
 * Essential = category !== "Lifestyle". Triage paused/cancelled rows are
 * excluded from the burn. Unemployment math respects waiting-week offset
 * and remaining duration.
 */
export function JobLossDashboard({ config, expenses, effectiveToday }) {
  const [savingsDraft, setSavingsDraft]   = useState("");
  const [includeBenefits, setIncludeBenefits] = useState(true);

  const dash = useMemo(() => {
    if (!config?.jobLossMode || !config?.jobLossDate) return null;

    const todayDate = new Date(effectiveToday + "T12:00:00");
    const phaseIdx  = getPhaseIndex(todayDate);

    // Essential = Needs / non-Lifestyle. Lifestyle rows still drag on
    // burn when active, but are excluded here so the runway focuses on
    // survival spend per the §15.C4 spec.
    const essentialActive = (expenses ?? []).filter(exp => {
      const status   = exp.jobLossStatus ?? "active";
      const flexible = exp.category === "Lifestyle";
      return status === "active" && !flexible;
    });
    const weeklyBurn = essentialActive.reduce(
      (sum, exp) => sum + getEffectiveAmount(exp, todayDate, phaseIdx),
      0,
    );

    const jobLossStartMs = new Date(config.jobLossDate + "T00:00:00").getTime();
    const weeksSinceLoss = Math.max(
      0,
      Math.floor((todayDate.getTime() - jobLossStartMs) / (7 * 86400000)),
    );

    let benefitsRemainingWeeks = 0;
    if (
      config.unemploymentEnabled
      && (config.unemploymentWeekly ?? 0) > 0
      && (config.unemploymentDurationWeeks ?? 0) > 0
    ) {
      const offset = config.unemploymentWaitingWeek ? 1 : 0;
      const elapsedBenefit = Math.max(0, weeksSinceLoss - offset);
      benefitsRemainingWeeks = Math.max(0, config.unemploymentDurationWeeks - elapsedBenefit);
    }
    const projectedUnemploymentTotal = benefitsRemainingWeeks * (config.unemploymentWeekly ?? 0);

    const savings = savingsDraft === "" ? 0 : Math.max(0, parseFloat(savingsDraft) || 0);
    const withBenefitsCash = savings + projectedUnemploymentTotal;
    const withoutBenefitsCash = savings;

    const daysFromCash = (cash) => weeklyBurn > 0 ? (cash / weeklyBurn) * 7 : Infinity;
    const cliffFromDays = (days) => {
      if (!Number.isFinite(days)) return null;
      const d = new Date(todayDate);
      d.setDate(d.getDate() + Math.round(days));
      return d;
    };

    return {
      weeklyBurn,
      essentialCount: essentialActive.length,
      benefitsRemainingWeeks,
      projectedUnemploymentTotal,
      withBenefits: {
        cash:  withBenefitsCash,
        days:  daysFromCash(withBenefitsCash),
        cliff: cliffFromDays(daysFromCash(withBenefitsCash)),
      },
      withoutBenefits: {
        cash:  withoutBenefitsCash,
        days:  daysFromCash(withoutBenefitsCash),
        cliff: cliffFromDays(daysFromCash(withoutBenefitsCash)),
      },
    };
  }, [config, expenses, effectiveToday, savingsDraft]);

  if (!dash) return null;

  const hasBenefits = (config.unemploymentEnabled && dash.projectedUnemploymentTotal > 0);
  const primary = (hasBenefits && includeBenefits) ? dash.withBenefits : dash.withoutBenefits;

  const cliffLabel = primary.cliff
    ? primary.cliff.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const daysLabel = Number.isFinite(primary.days)
    ? `${Math.max(0, Math.round(primary.days)).toLocaleString()}`
    : "∞";

  // Cliff proximity color: red ≤ 30 days, amber ≤ 90, green otherwise.
  const cliffColor = !Number.isFinite(primary.days)
    ? "var(--color-green)"
    : primary.days <= 30 ? "var(--color-deduction)"
    : primary.days <= 90 ? "var(--color-warning)"
    : "var(--color-green)";

  const cardStyle = {
    background: "var(--color-bg-surface)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "14px",
    padding: "18px 16px",
    marginBottom: "14px",
  };
  const labelStyle = {
    fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase",
    color: "var(--color-text-secondary)", marginBottom: "6px",
  };
  const valueStyle = {
    fontSize: "26px", fontFamily: "var(--font-mono)", fontWeight: 700,
    lineHeight: 1.1,
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "16px", gap: "10px" }}>
        <div>
          <div style={{ fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-warning)", marginBottom: "3px", fontWeight: 700 }}>
            Job Loss Dashboard
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-text-secondary)" }}>
            How long can you survive at the current essential burn rate.
          </div>
        </div>
      </div>

      {/* Three headline metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: "12px",
        marginBottom: "16px",
      }}>
        <div>
          <div style={labelStyle}>Runway</div>
          <div style={{ ...valueStyle, color: cliffColor }}>
            {daysLabel}
            <span style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginLeft: "6px", fontWeight: 500 }}>days</span>
          </div>
        </div>
        <div>
          <div style={labelStyle}>Runway ends</div>
          <div style={{ ...valueStyle, fontSize: "17px", color: cliffColor }}>
            {cliffLabel}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Weekly burn</div>
          <div style={{ ...valueStyle, color: "var(--color-text-primary)" }}>
            ${Math.round(dash.weeklyBurn).toLocaleString()}
          </div>
          <div style={{ fontSize: "10px", color: "var(--color-text-disabled)", marginTop: "3px" }}>
            {dash.essentialCount} essential {dash.essentialCount === 1 ? "expense" : "expenses"}
          </div>
        </div>
      </div>

      {/* Savings input */}
      <div style={{ marginBottom: hasBenefits ? "14px" : "4px" }}>
        <label style={labelStyle}>Current savings / cash on hand</label>
        <input
          type="number" min="0" step="50" inputMode="decimal"
          value={savingsDraft}
          onChange={(e) => setSavingsDraft(e.target.value)}
          placeholder="e.g. 4000"
          style={{
            width: "100%",
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "10px",
            color: "var(--color-text-primary)",
            fontSize: "15px",
            fontFamily: "var(--font-mono)",
            padding: "9px 12px",
            colorScheme: "dark",
          }}
        />
        <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
          One-time entry for the runway calc only — not saved to your account.
        </div>
      </div>

      {/* Scenario toggle / comparison — only when benefits are configured */}
      {hasBenefits && (
        <div>
          <label style={labelStyle}>Scenario</label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            {[{ v: true, label: "With unemployment" }, { v: false, label: "Without" }].map(opt => {
              const active = includeBenefits === opt.v;
              return (
                <button
                  key={opt.label}
                  onClick={() => setIncludeBenefits(opt.v)}
                  style={{
                    padding: "7px 12px",
                    fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                    background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
                    color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                    border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  {active && "✓ "}{opt.label}
                </button>
              );
            })}
          </div>

          {/* Side-by-side comparison strip */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px",
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "10px",
            padding: "10px 12px",
          }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
                With unemployment
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)", marginTop: "2px" }}>
                {Number.isFinite(dash.withBenefits.days) ? `${Math.max(0, Math.round(dash.withBenefits.days))} days` : "∞"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
                Without
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 600, color: "var(--color-text-secondary)", marginTop: "2px" }}>
                {Number.isFinite(dash.withoutBenefits.days) ? `${Math.max(0, Math.round(dash.withoutBenefits.days))} days` : "∞"}
              </div>
            </div>
          </div>
          <div style={{ marginTop: "8px", fontSize: "10px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
            {dash.benefitsRemainingWeeks} benefit weeks remaining · ${Math.round(dash.projectedUnemploymentTotal).toLocaleString()} projected total
          </div>
        </div>
      )}
    </div>
  );
}
