import { useEffect, useMemo, useState } from "react";
import { Pressable } from "./ui.jsx";
import { chatWithCoach } from "../lib/claude.js";
import { buildCoachContext } from "../lib/aiContext.js";
import { buildNetWorthSystemPrompt } from "../lib/coachPrompts.js";
import { resolveNetWorthSignalTier, shouldFireForTier } from "../lib/coachTriggers.js";
import { computeJobLossRunway, resolvePrimaryRunwayDays, sumJobHuntIncome } from "../lib/jobLossRunway.js";

const TIER_COLOR = {
  amber: "var(--color-warning)",
  red: "var(--color-red)",
  green: "var(--color-green)",
};

const TIER_LABEL = {
  amber: "Coach — Check-In",
  red: "Coach — Critical",
  green: "Coach — Recovery",
};

const DEFAULT_SIGNAL_STATE = {
  lastFiredTier: null,
  lastFiredWeekIdx: null,
  lastMessage: "",
  dismissedTier: null,
  dismissedWeekIdx: null,
};

/**
 * §18.C — Net Worth Trend Mental Health Trigger. Admin-gated at the call site
 * in HomePanel.jsx/JobLossHomePanel.jsx (docs/TODO.md §18 standing constraint
 * — every AI feature stays isAdmin/isTester-only for now). Rate-limits to one
 * Coach message per fiscal week per signal tier, and caches the message text
 * so a reload within the same week/tier replays it instead of re-calling the
 * API — both the correctness requirement in the spec and a real credit-saver.
 *
 * DW-9 fix (docs/BUG_FIX_TODO.md): this state used to live in localStorage
 * only — device/session-scoped, so a new device, a cleared cache, or a PWA
 * reinstall reset it and could re-fire a tier the account had already "used
 * up." Persisted through `config.coachSignalState` instead (the existing
 * eager-save channel every other config field already uses), so the rate
 * limit is durable per-account like everything else, with no new schema.
 * `setConfig`/`saveConfigNow` must be the same readOnly-shadowed no-ops the
 * call site already threads to its other eager-save props (CLAUDE.md's
 * readOnly gate) — this is a Save-shaped discrete action (a tier firing or
 * being dismissed), not continuous typing, so it follows the Eager Save
 * Pattern: compute the next value synchronously, pass it to both setConfig
 * and saveConfigNow.
 */
export function CoachNetWorthCard({
  config,
  setConfig,
  saveConfigNow,
  expenses = [],
  goals = [],
  weeklyIncome = 0,
  avgWeeklySpend = 0,
  fundedGoalSpend = 0,
  netWorthHealth,
  currentWeek,
  today,
  includeBenefits = true,
}) {
  const signalState = config?.coachSignalState ?? DEFAULT_SIGNAL_STATE;
  const updateSignalState = (patch) => {
    const next = { ...config, coachSignalState: { ...signalState, ...patch } };
    setConfig?.(next);
    saveConfigNow?.(next);
  };

  // Real runway, not the old independent estimate — computeJobLossRunway()
  // is the same function the Job Loss panels use, so this can't understate
  // runway vs. what those panels show (drift-app-warden §21 F24). Raw
  // jobLossCashOnHand is read internally by computeJobLossRunway now (and
  // timeline-decayed per §15.H17) — extraCash is just the gig-income log.
  // Now that this card also mounts inside JobLossHomePanel (DW-8 fix),
  // includeBenefits is threaded through as a real prop instead of hardcoded —
  // the default stays true only for the plain HomePanel call site, which has
  // no toggle of its own and where computeJobLossRunway() returns null
  // anyway (config.jobLossMode is false there).
  const runwayDays = useMemo(() => {
    const dash = computeJobLossRunway({ config, expenses, effectiveToday: today, extraCash: sumJobHuntIncome(config) });
    return resolvePrimaryRunwayDays(dash, config, includeBenefits);
  }, [config, expenses, today, includeBenefits]);
  const weekIdx = currentWeek?.idx ?? null;
  const tier = resolveNetWorthSignalTier({ netWorthHealth, runwayDays, previousTier: signalState.lastFiredTier });

  const alreadyFired = tier != null && !shouldFireForTier({
    tier,
    lastFiredTier: signalState.lastFiredTier,
    lastFiredWeekIdx: signalState.lastFiredWeekIdx,
    currentWeekIdx: weekIdx,
  });
  const dismissed = tier != null && signalState.dismissedTier === tier && signalState.dismissedWeekIdx === weekIdx;

  const [liveMessage, setLiveMessage] = useState(alreadyFired ? signalState.lastMessage : "");
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!tier || alreadyFired || dismissed) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErrored(false);
      setLiveMessage("");
      try {
        const systemPrompt = buildNetWorthSystemPrompt(tier);
        const contextBlock = buildCoachContext({
          config, weeklyIncome, avgWeeklySpend, goals, expenses, fundedGoalSpend, currentWeek, today, runwayDays,
        });
        let accumulated = "";
        for await (const chunk of chatWithCoach(
          [{ role: "user", content: "Write my check-in message now." }],
          systemPrompt,
          contextBlock,
          "haiku"
        )) {
          if (cancelled) return;
          accumulated += chunk;
          setLiveMessage(accumulated);
        }
        if (!cancelled) {
          updateSignalState({ lastFiredTier: tier, lastFiredWeekIdx: weekIdx, lastMessage: accumulated });
        }
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, weekIdx, alreadyFired, dismissed]);

  if (!tier || dismissed) return null;
  if (errored) return null; // fail quiet — this is a background nudge, not a core flow

  const dismiss = () => updateSignalState({ dismissedTier: tier, dismissedWeekIdx: weekIdx });

  return (
    <div
      style={{
        marginTop: "12px",
        background: "var(--color-bg-surface)",
        border: `1px solid ${TIER_COLOR[tier]}`,
        borderRadius: "12px",
        padding: "14px 16px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
      }}
    >
      <span
        style={{ width: "8px", height: "8px", borderRadius: "50%", background: TIER_COLOR[tier], marginTop: "5px", flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "9px", letterSpacing: "2.5px", textTransform: "uppercase", color: TIER_COLOR[tier], marginBottom: "6px" }}>
          {TIER_LABEL[tier]}
        </div>
        <div style={{ fontSize: "13px", lineHeight: 1.55, color: "var(--color-text-primary)" }}>
          {loading && !liveMessage ? "…" : liveMessage}
        </div>
      </div>
      <Pressable
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--color-text-secondary)",
          fontSize: "14px",
          cursor: "pointer",
          padding: "4px",
          minHeight: "44px",
          minWidth: "24px",
          flexShrink: 0,
        }}
      >
        ✕
      </Pressable>
    </div>
  );
}
