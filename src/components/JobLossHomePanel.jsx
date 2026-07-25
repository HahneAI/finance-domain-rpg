import { useCallback, useMemo, useState } from "react";
import { MetricCard, Pressable, PanelHero, SectionHeader, iS, lS } from "./ui.jsx";
import { computeJobLossRunway, sumJobHuntIncome } from "../lib/jobLossRunway.js";
import { ReemploymentTracker } from "./ReemploymentTracker.jsx";
import { CoachNetWorthCard } from "./CoachNetWorthCard.jsx";
import { canAccessAskCoachGeneral } from "../lib/entitlements.js";
import { CashOnHandSheet } from "./CashOnHandSheet.jsx";

/**
 * JobLossHomePanel — Job Loss Mode's own Home view (TODO §15 mode rebuild).
 *
 * Replaces HomePanel entirely while `config.jobLossMode` is true, rather than
 * layering job-loss content on top of (or hiding tiles from) the normal Home —
 * this is meant to read as a genuinely different mode the app enters, not the
 * regular dashboard with things moved around.
 *
 * Shows: a Cash On Hand card (persisted config.jobLossCashOnHand — mandatory
 * at JobLossEntry, editable here AND on JobLossBudgetPanel via the shared
 * CashOnHandSheet, both committing to the same field so neither can drift;
 * timeline-aware per §15.H17 — see lib/jobLossRunway.js's effectiveCashOnHand),
 * the runway headline (days / cliff date / weekly burn), a small "log extra
 * income" widget for cash made while job hunting (gig work, odd jobs — folded
 * straight into the runway's savings side), and the Re-employment Tracker
 * (target income + application log). The benefit-scenario toggle still lives
 * on JobLossBudgetPanel only, passed in here read-only.
 *
 * Also mounts CoachNetWorthCard (DW-8 fix, docs/BUG_FIX_TODO.md): the Red
 * tier ("Job Loss Mode, runway under 30 days") was structurally unreachable
 * because this panel replaces HomePanel entirely and never rendered the card
 * — same canAccessAskCoachGeneral gate as HomePanel's own mount (isAdmin/
 * isTester or a real trial/paid entitlement — docs/coach-entry-points.md §2),
 * same config-backed rate-limit state (DW-9 fix — shared across both mount
 * sites by design, one message per fiscal week per tier per account, durable
 * per-account rather than per-device). Amber/Green tiers still won't fire
 * here (they need HomePanel's netWorthHealth, a normal-mode-only concept,
 * not passed through) — only Red is reachable from this panel, which
 * matches what Red actually means.
 */
export function JobLossHomePanel({
  config, setConfig: setConfigProp, saveConfigNow: saveConfigNowProp,
  expenses, effectiveToday, includeBenefits, readOnly = false,
  currentWeek, isAdmin, isTester, entitlement,
}) {
  // Paywall-expired read-only mode, same shadow pattern as HomePanel/BudgetPanel
  // (docs/TODO.md §17.E): every setConfig()/saveConfigNow() below becomes a no-op.
  const noop = useCallback(() => {}, []);
  const setConfig = readOnly ? noop : setConfigProp;
  const saveConfigNow = readOnly ? noop : saveConfigNowProp;

  const [amountDraft, setAmountDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [cashSheetOpen, setCashSheetOpen] = useState(false);

  const huntIncome = sumJobHuntIncome(config);

  const dash = useMemo(() => computeJobLossRunway({
    config, expenses, effectiveToday, extraCash: huntIncome,
  }), [config, expenses, effectiveToday, huntIncome]);

  // Confirming a value in the sheet is the discrete "I checked my balance,
  // this is true right now" moment — resets the decay clock by stamping
  // jobLossCashOnHandAsOf alongside the new figure (TODO §15.H17). Eager-save
  // pattern (docs/TODO.md): computed synchronously, passed to both setState
  // and saveConfigNow.
  const saveCashOnHand = (parsedValue) => {
    const next = { ...config, jobLossCashOnHand: parsedValue, jobLossCashOnHandAsOf: effectiveToday };
    setConfig(next);
    saveConfigNow?.(next);
  };

  const entries = useMemo(() => (
    [...(config.jobHuntIncomeLog ?? [])].sort((a, b) => (b.loggedAt ?? "").localeCompare(a.loggedAt ?? ""))
  ), [config.jobHuntIncomeLog]);

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
    : primary.days <= 90 ? "teal"
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
    const next = { ...config, jobHuntIncomeLog: [...(config.jobHuntIncomeLog ?? []), entry] };
    setConfig(next);
    saveConfigNow?.(next);
    setAmountDraft("");
    setNoteDraft("");
  };

  const removeEntry = (id) => {
    const next = { ...config, jobHuntIncomeLog: (config.jobHuntIncomeLog ?? []).filter(e => e.id !== id) };
    setConfig(next);
    saveConfigNow?.(next);
  };

  const billsCaptionValue = Math.round(dash.billsDueSinceAsOf);

  return (
    <div>
      <PanelHero eyebrow="Job Loss Mode">Home</PanelHero>

      {/* ── Cash On Hand (TODO §15.H17) — its own card, above Runway; tap
          anywhere (pencil badge signals it) to open the update sheet. ── */}
      <Pressable
        onClick={() => setCashSheetOpen(true)}
        disabled={readOnly}
        aria-label="Update cash on hand"
        style={{
          position: "relative",
          display: "block", width: "100%", textAlign: "left",
          background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
          borderRadius: "16px", padding: "20px 18px", marginBottom: "12px",
          boxShadow: "0 8px 26px rgba(0,0,0,0.32)",
          cursor: readOnly ? "default" : "pointer",
        }}
        scale={0.97}
      >
        <div style={{
          position: "absolute", top: "14px", right: "14px",
          width: "30px", height: "30px", borderRadius: "50%",
          background: "rgba(0,200,150,0.12)", border: "1px solid rgba(0,200,150,0.32)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-teal)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </div>
        <div style={{ fontSize: "10px", letterSpacing: "2.5px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: "8px", fontFamily: "var(--font-sans)" }}>
          Cash On Hand
        </div>
        <div style={{ fontSize: "32px", fontWeight: "bold", color: "var(--color-text-primary)", fontFamily: "var(--font-display)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          ${Math.round(dash.effectiveCashOnHand).toLocaleString()}
        </div>
        {billsCaptionValue > 0 && (
          <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-secondary)" }}>
            − ${billsCaptionValue.toLocaleString()} in bills since you last updated this
          </div>
        )}
        {dash.pendingCheck && (
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--color-green)", lineHeight: 1.5 }}>
            Pending check: ${Math.round(dash.pendingCheck.amount).toLocaleString()} arriving{" "}
            {dash.pendingCheck.daysOut === 0 ? "today" : `in ${dash.pendingCheck.daysOut} ${dash.pendingCheck.daysOut === 1 ? "day" : "days"}`}
            {" "}({new Date(dash.pendingCheck.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})
          </div>
        )}
      </Pressable>
      <CashOnHandSheet
        open={cashSheetOpen}
        onClose={() => setCashSheetOpen(false)}
        currentValue={dash.effectiveCashOnHand}
        onSave={saveCashOnHand}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
        <MetricCard label="Runway" val={`${daysLabel} days`} sub={cliffLabel !== "—" ? `ends ${cliffLabel}` : null} status={cliffStatus} span={2} centered />
        <MetricCard label="Weekly Burn" val={`$${Math.round(dash.weeklyBurn).toLocaleString()}`} sub={`${dash.essentialCount} essential ${dash.essentialCount === 1 ? "expense" : "expenses"}`} status="teal" centered />
        <MetricCard label="Extra Income Logged" val={`$${Math.round(huntIncome).toLocaleString()}`} sub="added to runway" status={huntIncome > 0 ? "green" : "teal"} centered />
      </div>
      {dash.lifestyleWeeklySpend > 0 && (
        <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
          + ${Math.round(dash.lifestyleWeeklySpend).toLocaleString()}/wk Lifestyle spend still tracked (not counted in runway above)
        </div>
      )}
      <div style={{ marginBottom: "16px" }} />

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

      {setConfig && <ReemploymentTracker config={config} setConfig={setConfig} saveConfigNow={saveConfigNow} />}

      {canAccessAskCoachGeneral({ isAdmin, isTester, entitlement }) && (
        <CoachNetWorthCard
          config={config}
          setConfig={setConfig}
          saveConfigNow={saveConfigNow}
          expenses={expenses}
          currentWeek={currentWeek}
          today={effectiveToday}
          includeBenefits={includeBenefits}
        />
      )}
    </div>
  );
}
