import { useState } from "react";
import { PanelHero, SH } from "./ui.jsx";
import { ChangelogBody } from "./ChangelogModal.jsx";
import { toggleBetaChecklistItem } from "../lib/db.js";

// Beta Tester Homebase (docs/TODO.md §12, database/migrations/037) — one
// destination weaving together the scoring rubric, a personal feature
// checklist, admin-authored suggestion prompts, and a recap of the "What's
// New" changelog. Reached via the icon next to the notification bell
// (App.jsx, which pushes the "betaHomebase" view onto the nav stack —
// see App.jsx's `navigate` vs `navigateDirect`), gated the same way every
// other tracked-cohort-only surface is (isTrackedBetaTester — the icon
// itself is hidden for friends/family testers, not just this page's
// content).
//
// A real page in App.jsx's main content area (like Home/Income/Budget/Log),
// not a modal — no portal, no backdrop, no close button. The mobile bottom
// nav bar and desktop sidebar stay visible and ARE the way to leave: tapping
// any of them calls navigateDirect(), which resets the view stack and drops
// this page. (Was a fixed-position portal modal before 2026-08-09 — no
// longer needed once this became a real navigable view.)
//
// ChecklistSection/SuggestionsSection/WhatsNewSection are exported for
// ProductivityHub.jsx (the base-user "Money Moves" panel,
// 039_add_base_productivity_hub.sql) to reuse directly — same presentation,
// different data source, no duplicated JSX. ScoreSection is NOT reused —
// scoring is deliberately beta-program-specific and has no base-user
// equivalent.

const RUBRIC_CATEGORIES = [
  { key: "usage_score", label: "App Usage", max: 50 },
  { key: "feedback_score", label: "Feedback", max: 25 },
  { key: "calls_score", label: "Call Attendance", max: 15 },
  { key: "longevity_score", label: "Longevity", max: 10 },
];

function ScoreRow({ label, value, max }) {
  const scored = typeof value === "number";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
      <span className="text-sm" style={{ color: "var(--color-text-primary)" }}>{label}</span>
      <span className="text-base" style={{ fontFamily: "var(--font-mono)", color: scored ? "var(--color-teal)" : "var(--color-text-disabled)" }}>
        {scored ? `${value} / ${max}` : `Not yet scored (of ${max})`}
      </span>
    </div>
  );
}

function ScoreSection({ score }) {
  const total = score
    ? RUBRIC_CATEGORIES.reduce((sum, c) => sum + (typeof score[c.key] === "number" ? score[c.key] : 0), 0)
    : null;
  const anyScored = score && RUBRIC_CATEGORIES.some(c => typeof score[c.key] === "number");

  return (
    <div style={{ marginBottom: "24px" }}>
      <SH>Your Score</SH>
      <div style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "4px 14px" }}>
        {RUBRIC_CATEGORIES.map(c => (
          <ScoreRow key={c.key} label={c.label} value={score?.[c.key] ?? null} max={c.max} />
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0 6px" }}>
          <span className="text-xs" style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Total</span>
          <span style={{ fontSize: "15px", fontWeight: "bold", fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
            {anyScored ? `${total} / 100` : "Not yet scored"}
          </span>
        </div>
      </div>
      <div className="text-xs" style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, marginTop: "10px" }}>
        Scoring is reviewed by hand at the end of the 10-week program, not calculated live —
        this is a running reference, not a running total. <strong>70–100</strong> (floor met on
        Usage) → lifetime access. <strong>60–69</strong> (floor met) → 6 months free.
        Below that, or floor not met → no perk.
      </div>
    </div>
  );
}

// Exported (along with SuggestionsSection/WhatsNewSection below) so
// ProductivityHub.jsx — the base-user "Money Moves" panel,
// 039_add_base_productivity_hub.sql — can reuse the exact same presentation
// instead of duplicating it. Neither component has any beta-specific logic
// inside; `title` lets a caller relabel without touching this file.
export function ChecklistSection({ items, completedIds, onToggle, title = "Feature Checklist" }) {
  const completedCount = items.filter(i => completedIds.has(i.id)).length;
  return (
    <div style={{ marginBottom: "24px" }}>
      <SH right={items.length > 0 ? `${completedCount} / ${items.length}` : null}>{title}</SH>
      {items.length === 0 ? (
        <div className="text-base" style={{ color: "var(--color-text-secondary)" }}>Nothing to try yet — check back soon.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {items.map(item => {
            const checked = completedIds.has(item.id);
            return (
              <label
                key={item.id}
                style={{ display: "flex", alignItems: "flex-start", gap: "10px", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "10px 12px", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(item.id, !checked)}
                  style={{ width: "16px", height: "16px", marginTop: "1px", accentColor: "var(--color-teal)", cursor: "pointer", flexShrink: 0 }}
                />
                <div>
                  <div className="text-base" style={{ color: checked ? "var(--color-text-secondary)" : "var(--color-text-primary)", textDecoration: checked ? "line-through" : "none" }}>
                    {item.title}
                  </div>
                  {item.body && <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "3px" }}>{item.body}</div>}
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SuggestionsSection({ items, title = "Suggestions From The Team" }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <SH>{title}</SH>
      {items.length === 0 ? (
        <div className="text-base" style={{ color: "var(--color-text-secondary)" }}>Nothing posted yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map(item => (
            <div key={item.id} style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "12px 14px" }}>
              <div className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)", marginBottom: item.body ? "6px" : 0 }}>{item.title}</div>
              {item.body && <ChangelogBody markdown={item.body} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WhatsNewSection({ entries }) {
  if (entries.length === 0) return null;
  return (
    <div>
      <SH>What's New</SH>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {entries.map(entry => (
          <div key={entry.id} style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
              <div className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{entry.title}</div>
              {entry.published_at && (
                <div className="text-xs" style={{ color: "var(--color-text-secondary)", flexShrink: 0 }}>
                  {new Date(entry.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              )}
            </div>
            <ChangelogBody markdown={entry.body} />
          </div>
        ))}
      </div>
    </div>
  );
}

// `preloadedData` (added 2026-08-11) — App.jsx is the single fetch owner now:
// its badge-refresh effect (fires on mount and on every nav change) already
// runs this exact query, so this component no longer fetches on its own at
// all. It just hydrates from the prop — { checklistItems, completedIds,
// suggestions, score, changelogEntries } | null. null (the rare case of
// tapping the icon before App.jsx's first fetch resolves) shows a brief
// "Loading…" the same as before; the effect below picks up the data the
// instant App.jsx's fetch does resolve, without this component ever issuing
// a request of its own. See App.jsx's betaHomebaseData comment for the
// freshness contract (refresh-on-navigation only, no polling/realtime).
export function BetaHomebase({ isTester, betaCodeUsed, preloadedData }) {
  // checklistItems/suggestions/score/changelogEntries are read-only display
  // data — nothing in this component ever mutates them, so they're read
  // straight from the prop, no local state/effect needed. completedIds is
  // the one exception (the optimistic toggle below needs it locally
  // mutable), hydrated from a fresh preloadedData via React's documented
  // "adjusting state during render" pattern — a guarded setState call in
  // the render body itself, not inside a useEffect. Deliberately NOT a
  // useEffect: this codebase has a confirmed, production-only React
  // Compiler miscompilation (drift-app-warden.md §12.4) triggered by
  // setState-in-effect patterns in this exact file's neighborhood
  // (ChangelogAdminDetail/ContentAdminDetail/BetaScoresAdminDetail all
  // needed "use no memo" for the same class of bug) — safer not to add a
  // new instance of the flagged shape when the render-time alternative
  // works just as well and needs no directive at all.
  const [hydratedFrom, setHydratedFrom] = useState(null);
  const [completedIds, setCompletedIds] = useState(new Set());
  if (preloadedData && preloadedData !== hydratedFrom) {
    setHydratedFrom(preloadedData);
    setCompletedIds(preloadedData.completedIds);
  }
  const loading = !preloadedData;
  const checklistItems = preloadedData?.checklistItems ?? [];
  const suggestions = preloadedData?.suggestions ?? [];
  const score = preloadedData?.score ?? null;
  const changelogEntries = preloadedData?.changelogEntries ?? [];

  async function handleToggle(itemId, completed) {
    // Optimistic — flip local state immediately, roll back only if the write fails.
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (completed) next.add(itemId); else next.delete(itemId);
      return next;
    });
    const result = await toggleBetaChecklistItem({ isTester, betaCodeUsed, itemId, completed });
    if (!result.ok) {
      setCompletedIds(prev => {
        const next = new Set(prev);
        if (completed) next.delete(itemId); else next.add(itemId);
        return next;
      });
    }
  }

  return (
    <>
      <PanelHero eyebrow="10-Week Beta">Tester Homebase</PanelHero>
      {loading ? (
        <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading…</div>
      ) : (
        <>
          <ScoreSection score={score} />
          <ChecklistSection items={checklistItems} completedIds={completedIds} onToggle={handleToggle} />
          <SuggestionsSection items={suggestions} />
          <WhatsNewSection entries={changelogEntries} />
        </>
      )}
    </>
  );
}
