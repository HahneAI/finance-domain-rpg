import { useCallback, useMemo, useState } from "react";
import { MetricCard, Pressable, PanelHero, SectionHeader, iS, lS } from "./ui.jsx";
import { computeJobLossRunway, sumJobHuntIncome } from "../lib/jobLossRunway.js";
import { ReemploymentTracker } from "./ReemploymentTracker.jsx";
import { CoachNetWorthCard } from "./CoachNetWorthCard.jsx";
import { canAccessAskCoachGeneral } from "../lib/entitlements.js";

/**
 * JobLossHomePanel — Job Loss Mode's own Home view (TODO §15 mode rebuild).
 *
 * Replaces HomePanel entirely while `config.jobLossMode` is true, rather than
 * layering job-loss content on top of (or hiding tiles from) the normal Home —
 * this is meant to read as a genuinely different mode the app enters, not the
 * regular dashboard with things moved around.
 *
 * Shows: runway headline (days / cliff date / weekly burn), the accessible
 * cash on hand input (persisted config.jobLossCashOnHand — mandatory at
 * JobLossEntry, editable here AND on JobLossBudgetPanel, both committing to
 * the same field so neither can drift), a small "log extra income" widget for
 * cash made while job hunting (gig work, odd jobs — folded straight into the
 * runway's savings side), and the Re-employment Tracker (target income +
 * application log). The benefit-scenario toggle still lives on
 * JobLossBudgetPanel only, passed in here read-only (see lib/jobLossRunway.js).
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

  // Numeric Input Standard (CLAUDE.md): string draft state, only parseFloat
  // at commit. Re-synced from the persisted value via React's documented
  // "adjust state during render" pattern (react.dev — not a useEffect, which
  // would fire an extra render and trip react-hooks/set-state-in-effect) —
  // only when the underlying number actually changes (e.g. edited on Budget
  // then navigated back here), never clobbering in-progress typing.
  const [lastSyncedCash, setLastSyncedCash] = useState(config.jobLossCashOnHand);
  const [cashDraft, setCashDraft] = useState(() => (
    config.jobLossCashOnHand != null ? String(config.jobLossCashOnHand) : ""
  ));
  if (config.jobLossCashOnHand !== lastSyncedCash) {
    setLastSyncedCash(config.jobLossCashOnHand);
    setCashDraft(config.jobLossCashOnHand != null ? String(config.jobLossCashOnHand) : "");
  }

  const manualSavings = cashDraft === "" ? 0 : Math.max(0, parseFloat(cashDraft) || 0);
  const huntIncome = sumJobHuntIncome(config);

  // Eager-save on blur, not on every keystroke (docs/TODO.md "Persistence —
  // Eager Save Pattern": plain typing stays on the debounce; this commits the
  // discrete "done editing" moment instead of leaving it to the 800ms window).
  const commitCashOnHand = () => {
    const parsed = cashDraft === "" ? 0 : Math.max(0, parseFloat(cashDraft) || 0);
    if (parsed === (config.jobLossCashOnHand ?? 0)) return;
    const next = { ...config, jobLossCashOnHand: parsed };
    setConfig(next);
    saveConfigNow?.(next);
  };

  const dash = useMemo(() => computeJobLossRunway({
    config, expenses, effectiveToday, savings: manualSavings + huntIncome,
  }), [config, expenses, effectiveToday, manualSavings, huntIncome]);

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

  return (
    <div>
      <PanelHero eyebrow="Job Loss Mode">Home</PanelHero>

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

      <SectionHeader sub="Drives the Runway number above — also editable on Budget">
        Cash On Hand
      </SectionHeader>
      <div style={{
        background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
        borderRadius: "14px", padding: "16px", marginBottom: "20px",
      }}>
        <label style={lS}>Accessible cash on hand</label>
        <input
          type="number" min="0" step="50" inputMode="decimal"
          value={cashDraft}
          onChange={(e) => setCashDraft(e.target.value)}
          onBlur={commitCashOnHand}
          disabled={readOnly}
          placeholder="e.g. 1,023"
          style={{ ...iS, marginTop: "6px" }}
        />
        <div style={{ marginTop: "6px", fontSize: "10px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
          Savings, checking — whatever you could draw on today. Extra income logged below
          (${Math.round(huntIncome).toLocaleString()} so far) is added automatically.
        </div>
        {dash.pendingCheck && (
          <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--color-green)", lineHeight: 1.5 }}>
            Pending check: ${Math.round(dash.pendingCheck.amount).toLocaleString()} arriving{" "}
            {dash.pendingCheck.daysOut === 0 ? "today" : `in ${dash.pendingCheck.daysOut} ${dash.pendingCheck.daysOut === 1 ? "day" : "days"}`}
            {" "}({new Date(dash.pendingCheck.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})
          </div>
        )}
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
