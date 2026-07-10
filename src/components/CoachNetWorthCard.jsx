import { useEffect, useMemo, useState } from "react";
import { Pressable } from "./ui.jsx";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { chatWithCoach } from "../lib/claude.js";
import { buildCoachContext } from "../lib/aiContext.js";
import { buildNetWorthSystemPrompt } from "../lib/coachPrompts.js";
import { estimateRunwayDays, resolveNetWorthSignalTier, shouldFireForTier } from "../lib/coachTriggers.js";

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

/**
 * §18.C — Net Worth Trend Mental Health Trigger. Admin-gated at the call site
 * in HomePanel.jsx (docs/TODO.md §18 standing constraint — every AI feature
 * stays isAdmin-only for now). Rate-limits to one Coach message per fiscal
 * week per signal tier, and caches the message text in localStorage so a
 * reload within the same week/tier replays it instead of re-calling the API —
 * both the correctness requirement in the spec and a real credit-saver.
 */
export function CoachNetWorthCard({
  config,
  expenses = [],
  goals = [],
  weeklyIncome = 0,
  avgWeeklySpend = 0,
  fundedGoalSpend = 0,
  netWorthHealth,
  currentWeek,
  today,
}) {
  const [signalState, setSignalState] = useLocalStorage("coachNetWorthSignal", {
    lastFiredTier: null,
    lastFiredWeekIdx: null,
    lastMessage: "",
    dismissedTier: null,
    dismissedWeekIdx: null,
  });

  const runwayDays = useMemo(
    () => estimateRunwayDays(config, expenses, today),
    [config, expenses, today]
  );
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
          setSignalState((prev) => ({
            ...prev,
            lastFiredTier: tier,
            lastFiredWeekIdx: weekIdx,
            lastMessage: accumulated,
          }));
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

  const dismiss = () => setSignalState((prev) => ({ ...prev, dismissedTier: tier, dismissedWeekIdx: weekIdx }));

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
