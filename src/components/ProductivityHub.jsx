import { useState } from "react";
import { PanelHero } from "./ui.jsx";
import { ChecklistSection, SuggestionsSection, WhatsNewSection, FeedbackSection } from "./BetaHomebase.jsx";
import { toggleBaseChecklistItem, logBaseFeedback } from "../lib/db.js";

// "Money Moves" — the base-user counterpart to the Beta Tester Homebase
// (database/migrations/039_add_base_productivity_hub.sql). Same underlying
// flow the beta program validated (a personal checklist, admin-authored
// tips, a feedback box, a changelog recap) reused via ChecklistSection/
// SuggestionsSection/WhatsNewSection/FeedbackSection (all exported from
// BetaHomebase.jsx — same presentation, different data source, no
// duplicated JSX), but a different purpose and audience: every signed-in
// user who ISN'T a tracked beta tester, not a scored path toward a
// free-account reward. No ScoreSection — scoring stays beta-program-
// specific, deliberately not ported here.
//
// Reached from the header icon next to the notification bell (App.jsx,
// which pushes the "moneyMoves" view onto the nav stack — see App.jsx's
// `navigate` vs `navigateDirect`), mutually exclusive with the Beta Tester
// Homebase icon — a tracked beta tester sees their beta-specific homebase
// only, everyone else sees this.
//
// A real page in App.jsx's main content area (like Home/Income/Budget/Log),
// not a modal — no portal, no backdrop, no close button. The mobile bottom
// nav bar and desktop sidebar stay visible and ARE the way to leave: tapping
// any of them calls navigateDirect(), which resets the view stack and drops
// this page. (Was a fixed-position portal modal before 2026-08-09 — no
// longer needed once this became a real navigable view.)

// `preloadedData` (added 2026-08-11) — App.jsx is the single fetch owner
// now, same as BetaHomebase.jsx: its badge-refresh effect (mount + every
// nav change) already runs this exact query, so this component only
// hydrates from the prop and never fetches on its own. See App.jsx's
// productivityHubData comment for the freshness contract (refresh-on-
// navigation only, no polling/realtime while already mounted).
export function ProductivityHub({ preloadedData }) {
  // Same "adjusting state during render" pattern as BetaHomebase.jsx —
  // see its comment for why this is deliberately not a useEffect.
  // checklistItems/suggestions/changelogEntries are read-only display data,
  // read straight from the prop; completedIds is the one field the
  // optimistic toggle below needs locally mutable.
  const [hydratedFrom, setHydratedFrom] = useState(null);
  const [completedIds, setCompletedIds] = useState(new Set());
  if (preloadedData && preloadedData !== hydratedFrom) {
    setHydratedFrom(preloadedData);
    setCompletedIds(preloadedData.completedIds);
  }
  const loading = !preloadedData;
  const checklistItems = preloadedData?.checklistItems ?? [];
  const suggestions = preloadedData?.suggestions ?? [];
  const changelogEntries = preloadedData?.changelogEntries ?? [];

  async function handleToggle(itemId, completed) {
    // Optimistic — flip local state immediately, roll back only if the write fails.
    setCompletedIds(prev => {
      const next = new Set(prev);
      if (completed) next.add(itemId); else next.delete(itemId);
      return next;
    });
    const result = await toggleBaseChecklistItem({ itemId, completed });
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
      <PanelHero eyebrow="For You">Money Moves</PanelHero>
      {loading ? (
        <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Loading…</div>
      ) : (
        <>
          {/* Order (2026-08-12): Feedback first, then Checklist, Suggestions,
              What's New — matching BetaHomebase.jsx's order below its one
              extra (pinned) Score section. */}
          <FeedbackSection onSubmit={(note) => logBaseFeedback({ note })} />
          <ChecklistSection items={checklistItems} completedIds={completedIds} onToggle={handleToggle} title="Quick Wins" />
          <SuggestionsSection items={suggestions} title="Tips From The Team" />
          <WhatsNewSection entries={changelogEntries} />
        </>
      )}
    </>
  );
}
