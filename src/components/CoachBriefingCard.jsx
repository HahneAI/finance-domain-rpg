import { useEffect, useState } from "react";
import { Pressable } from "./ui.jsx";
import { chatWithCoach } from "../lib/claude.js";
import { buildCoachContext } from "../lib/aiContext.js";
import { WEEKLY_BRIEFING_SYSTEM_PROMPT } from "../lib/coachPrompts.js";
import { loadCoachMemory } from "../lib/db.js";
import { memoryContextBlock } from "../lib/coachMemory.js";

/**
 * Weekly Pre-Game Briefing (TODO §32 C2, 2026-11-03). Coach writes three sentences the first time the
 * user opens Home in a new fiscal week; the text is cached in config.coachBriefing so a reload that
 * week replays it instead of calling the API again, and a dismissal holds for the rest of the week.
 * Same once-per-week pattern and same persistence channel as CoachNetWorthCard (F24, DW-9): every
 * write is a discrete action — fired or dismissed — so it eager-saves (setConfig + saveConfigNow),
 * and the caller passes the readOnly-shadowed setters. Gated at the call site exactly like the
 * Net Worth card (canAccessAskCoachGeneral). Push delivery is a later step (TODO §8.C needs PWA push).
 */
export function CoachBriefingCard({
  config,
  setConfig,
  saveConfigNow,
  expenses = [],
  goals = [],
  weeklyIncome = 0,
  avgWeeklySpend = 0,
  fundedGoalSpend = 0,
  currentWeek,
  today,
}) {
  const briefing = config?.coachBriefing ?? {};
  const weekIdx = currentWeek?.idx ?? null;
  const updateBriefing = (patch) => {
    const next = { ...config, coachBriefing: { ...briefing, ...patch } };
    setConfig?.(next);
    saveConfigNow?.(next);
  };

  const firedThisWeek = weekIdx != null && briefing.weekIdx === weekIdx && Boolean(briefing.message);
  const dismissed = weekIdx != null && briefing.dismissedWeekIdx === weekIdx;
  const [liveMessage, setLiveMessage] = useState(firedThisWeek ? briefing.message : "");
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (weekIdx == null || firedThisWeek || dismissed || !weeklyIncome) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const memories = config?.coachMemoryOff === true ? [] : await loadCoachMemory();
        const contextBlock = buildCoachContext({
          config, weeklyIncome, avgWeeklySpend, goals, expenses, fundedGoalSpend, currentWeek, today,
        }) + memoryContextBlock(memories, { memoryOff: config?.coachMemoryOff === true });
        let accumulated = "";
        for await (const chunk of chatWithCoach(
          [{ role: "user", content: "Write my pre-game briefing for this week." }],
          WEEKLY_BRIEFING_SYSTEM_PROMPT,
          contextBlock,
          "haiku",
          { surface: "weekly_briefing" }
        )) {
          if (cancelled) return;
          accumulated += chunk;
          setLiveMessage(accumulated);
        }
        if (!cancelled && accumulated.trim()) updateBriefing({ weekIdx, message: accumulated });
      } catch {
        if (!cancelled) setErrored(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [weekIdx, firedThisWeek, dismissed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (weekIdx == null || dismissed || errored) return null;
  if (!liveMessage && !loading) return null;

  return (
    <div
      data-testid="coach-briefing"
      style={{ marginBottom: "16px", padding: "14px 16px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "12px", display: "flex", gap: "12px", alignItems: "flex-start" }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="text-2xs" style={{ letterSpacing: "2.5px", textTransform: "uppercase", color: "var(--color-teal)", marginBottom: "6px" }}>
          Coach — Pre-Game Briefing
        </div>
        <div className="text-base" style={{ lineHeight: 1.55, color: "var(--color-text-primary)" }}>
          {loading && !liveMessage ? "…" : liveMessage}
        </div>
      </div>
      <Pressable
        type="button"
        onClick={() => updateBriefing({ dismissedWeekIdx: weekIdx })}
        aria-label="Dismiss briefing"
        className="text-md"
        style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", padding: "4px", minHeight: "44px", minWidth: "24px", flexShrink: 0 }}
      >✕</Pressable>
    </div>
  );
}
