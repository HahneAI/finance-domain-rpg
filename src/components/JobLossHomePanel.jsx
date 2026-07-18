import { useMemo, useState } from "react";
import { MetricCard, Pressable, PanelHero, SectionHeader, iS, lS } from "./ui.jsx";
import { computeJobLossRunway, sumJobHuntIncome } from "../lib/jobLossRunway.js";
import { ReemploymentTracker } from "./ReemploymentTracker.jsx";

/**
 * JobLossHomePanel — Job Loss Mode's own Home view (TODO §15 mode rebuild).
 *
 * Replaces HomePanel entirely while `config.jobLossMode` is true, rather than
 * layering job-loss content on top of (or hiding tiles from) the normal Home —
 * this is meant to read as a genuinely different mode the app enters, not the
 * regular dashboard with things moved around.
 *
 * Shows: runway headline (days / cliff date / weekly burn), a small "log
 * extra income" widget for cash made while job hunting (gig work, odd jobs —
 * folded straight into the runway's savings side), and the Re-employment
 * Tracker (target income + application log). The savings input and benefit
 * scenario toggle live on JobLossBudgetPanel instead — passed in here
 * read-only so both panels agree on the same numbers without duplicating the
 * calc (see lib/jobLossRunway.js).
 */
export function JobLossHomePanel({ config, setConfig, expenses, effectiveToday, savingsDraft, includeBenefits }) {
  const [amountDraft, setAmountDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const manualSavings = savingsDraft === "" ? 0 : Math.max(0, parseFloat(savingsDraft) || 0);
  const huntIncome = sumJobHuntIncome(config);

  const dash = useMemo(() => computeJobLossRunway({
    config, expenses, effectiveToday, savings: manualSavings + huntIncome,
  }), [config, expenses, effectiveToday, manualSavings, huntIncome]);

  const entries = useMemo(() => (
    [...(config?.jobHuntIncomeLog ?? [])].sort((a, b) => (b.loggedAt ?? "").localeCompare(a.loggedAt ?? ""))
  ), [config?.jobHuntIncomeLog]);

  if (!dash) return null;

  const hasBenefits = config.unemploymentEnabled && dash.projectedUnemploymentTotal > 0;
  const primary = (hasBenefits && includeBenefits) ? dash.withBenefits : dash.withoutBenefits;

  const cliffLabel = primary.cliff
    ? primary.cliff.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const daysLabel = Number.isFinite(primary.days)
    ? `${Math.max(0, Math.round(primary.days)).toLocaleString()}`
    : "∞";
  const cliffStatus = !Number.isFinite(primary.days) ? "green"
    : primary.days <= 30 ? "red"
    : primary.days <= 90 ? "gold"
    : "green";

  const amountVal = amountDraft === "" ? null : parseFloat(amountDraft);
  const canLog = amountVal != null && amountVal > 0;

  const logIncome = () => {
    if (!canLog) return;
    const entry = {
      id: `jhi_${crypto.randomUUID()}`,
      amount: amountVal,
      note: noteDraft.trim() || null,
      loggedAt: new Date().toISOString(),
    };
    setConfig(prev => ({ ...prev, jobHuntIncomeLog: [...(prev.jobHuntIncomeLog ?? []), entry] }));
    setAmountDraft("");
    setNoteDraft("");
  };

  const removeEntry = (id) => {
    setConfig(prev => ({ ...prev, jobHuntIncomeLog: (prev.jobHuntIncomeLog ?? []).filter(e => e.id !== id) }));
  };

  return (
    <div>
      <PanelHero eyebrow="Job Loss Mode">Home</PanelHero>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "28px" }}>
        <MetricCard label="Runway" val={`${daysLabel} days`} sub={cliffLabel !== "—" ? `ends ${cliffLabel}` : null} status={cliffStatus} span={2} centered />
        <MetricCard label="Weekly Burn" val={`$${Math.round(dash.weeklyBurn).toLocaleString()}`} sub={`${dash.essentialCount} essential ${dash.essentialCount === 1 ? "expense" : "expenses"}`} status="gold" centered />
        <MetricCard label="Extra Income Logged" val={`$${Math.round(huntIncome).toLocaleString()}`} sub="added to runway" status={huntIncome > 0 ? "green" : "gold"} centered />
      </div>

      <SectionHeader sub="Cash from gig work or odd jobs — goes straight into your runway savings">
        Log Extra Income
      </SectionHeader>
      <div style={{
        background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
        borderRadius: "14px", padding: "16px", marginBottom: "16px",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
          <div>
            <label style={lS}>Amount</label>
            <input
              type="number" min="0" step="1" inputMode="decimal"
              style={iS}
              value={amountDraft}
              onChange={e => setAmountDraft(e.target.value)}
              placeholder="e.g. 150"
            />
          </div>
          <div>
            <label style={lS}>Note (optional)</label>
            <input
              type="text"
              style={iS}
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              placeholder="e.g. Weekend gig"
            />
          </div>
        </div>
        <Pressable
          onClick={logIncome}
          disabled={!canLog}
          style={{
            width: "100%",
            background: canLog ? "var(--color-green)" : "var(--color-bg-raised)",
            color: canLog ? "var(--color-bg-base)" : "var(--color-text-disabled)",
            border: "none", borderRadius: "10px", padding: "10px",
            fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase",
            fontWeight: 700, cursor: canLog ? "pointer" : "not-allowed",
          }}
        >
          + Log Income
        </Pressable>

        {entries.length > 0 && (
          <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
            {entries.map(entry => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                padding: "8px 10px", background: "var(--color-bg-raised)",
                border: "1px solid var(--color-border-subtle)", borderRadius: "8px",
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "12px", color: "var(--color-text-primary)" }}>
                    {entry.note || "Extra income"}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--color-text-disabled)" }}>
                    {new Date(entry.loggedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600, color: "var(--color-green)" }}>
                  +${Math.round(entry.amount).toLocaleString()}
                </div>
                <Pressable
                  onClick={() => removeEntry(entry.id)}
                  aria-label="Remove entry"
                  style={{
                    background: "transparent", border: "none", color: "var(--color-text-disabled)",
                    cursor: "pointer", fontSize: "14px", padding: "2px 4px",
                  }}
                >
                  ✕
                </Pressable>
              </div>
            ))}
          </div>
        )}
      </div>

      {setConfig && <ReemploymentTracker config={config} setConfig={setConfig} />}
    </div>
  );
}
