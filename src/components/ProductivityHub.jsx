import { useEffect, useState } from "react";
import { Pressable, PanelHero, SH } from "./ui.jsx";
import { ChecklistSection, SuggestionsSection, WhatsNewSection } from "./BetaHomebase.jsx";
import {
  fetchBaseChecklistItems,
  fetchMyBaseChecklistCompletions,
  toggleBaseChecklistItem,
  fetchBaseSuggestions,
  fetchPublishedChangelogEntries,
  logBaseFeedback,
} from "../lib/db.js";

// "Money Moves" — the base-user counterpart to the Beta Tester Homebase
// (database/migrations/039_add_base_productivity_hub.sql). Same underlying
// flow the beta program validated (a personal checklist, admin-authored
// tips, a feedback box, a changelog recap) reused via ChecklistSection/
// SuggestionsSection/WhatsNewSection (exported from BetaHomebase.jsx — same
// presentation, different data source, no duplicated JSX), but a different
// purpose and audience: every signed-in user who ISN'T a tracked beta
// tester, not a scored path toward a free-account reward. No ScoreSection —
// scoring stays beta-program-specific, deliberately not ported here.
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

function FeedbackSection() {
  const [note, setNote] = useState("");
  const [status, setStatus] = useState({ loading: false, error: null, success: false });

  async function handleSubmit() {
    if (!note.trim() || status.loading) return;
    setStatus({ loading: true, error: null, success: false });
    const result = await logBaseFeedback({ note });
    if (result.ok) {
      setStatus({ loading: false, error: null, success: true });
      setNote("");
    } else {
      setStatus({ loading: false, error: result.error || "Couldn't submit feedback", success: false });
    }
  }

  return (
    <div>
      <SH>Send Feedback</SH>
      {status.success ? (
        <div className="text-base" style={{ color: "var(--color-teal)" }}>Thanks — got it.</div>
      ) : (
        <>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What's working, what's not, what would help..."
            maxLength={4000}
            rows={3}
            className="text-base" style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "10px 12px", color: "var(--color-text-primary)", fontFamily: "inherit", resize: "vertical", marginBottom: "10px" }}
          />
          {status.error && (
            <div className="text-xs" style={{ color: "var(--color-deduction)", marginBottom: "10px" }}>{status.error}</div>
          )}
          <Pressable
            onClick={handleSubmit}
            disabled={status.loading || !note.trim()}
            className="text-xs" style={{ width: "100%", padding: "9px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: (status.loading || !note.trim()) ? "default" : "pointer", opacity: !note.trim() ? 0.45 : 1 }}
          >
            {status.loading ? "Sending…" : "Submit"}
          </Pressable>
        </>
      )}
    </div>
  );
}

export function ProductivityHub() {
  const [loading, setLoading] = useState(true);
  const [checklistItems, setChecklistItems] = useState([]);
  const [completedIds, setCompletedIds] = useState(new Set());
  const [suggestions, setSuggestions] = useState([]);
  const [changelogEntries, setChangelogEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchBaseChecklistItems(),
      fetchMyBaseChecklistCompletions(),
      fetchBaseSuggestions(),
      fetchPublishedChangelogEntries(5),
    ]).then(([items, completions, suggestionItems, changelog]) => {
      if (cancelled) return;
      setChecklistItems(items);
      setCompletedIds(new Set(completions));
      setSuggestions(suggestionItems);
      setChangelogEntries(changelog);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

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
          <ChecklistSection items={checklistItems} completedIds={completedIds} onToggle={handleToggle} title="Quick Wins" />
          <SuggestionsSection items={suggestions} title="Tips From The Team" />
          {/* WhatsNewSection has no bottom margin of its own — it's always
              last in BetaHomebase.jsx. Wrapped here since FeedbackSection
              follows it in this panel. */}
          <div style={{ marginBottom: changelogEntries.length > 0 ? "24px" : 0 }}>
            <WhatsNewSection entries={changelogEntries} />
          </div>
          <FeedbackSection />
        </>
      )}
    </>
  );
}
