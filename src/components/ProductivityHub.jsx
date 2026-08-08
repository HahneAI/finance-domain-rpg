import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pressable, SH, useFoldTransition } from "./ui.jsx";
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
// Opened from the header icon next to the notification bell (App.jsx),
// mutually exclusive with the Beta Tester Homebase icon — a tracked beta
// tester sees their beta-specific homebase only, everyone else sees this.
//
// Same portal + fold-motion shell as BetaHomebase.jsx/ChangelogModal —
// position:fixed must portal to document.body or iOS Safari hit-tests
// against the wrong scroll container.

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
        <div style={{ fontSize: "13px", color: "var(--color-teal)" }}>Thanks — got it.</div>
      ) : (
        <>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What's working, what's not, what would help..."
            maxLength={4000}
            rows={3}
            style={{ width: "100%", boxSizing: "border-box", background: "var(--color-bg-base)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "10px 12px", color: "var(--color-text-primary)", fontSize: "13px", fontFamily: "inherit", resize: "vertical", marginBottom: "10px" }}
          />
          {status.error && (
            <div style={{ fontSize: "11px", color: "var(--color-deduction)", marginBottom: "10px" }}>{status.error}</div>
          )}
          <Pressable
            onClick={handleSubmit}
            disabled={status.loading || !note.trim()}
            style={{ width: "100%", padding: "9px 0", background: "var(--color-accent-primary)", border: "none", borderRadius: "12px", color: "var(--color-bg-base)", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: (status.loading || !note.trim()) ? "default" : "pointer", opacity: !note.trim() ? 0.45 : 1 }}
          >
            {status.loading ? "Sending…" : "Submit"}
          </Pressable>
        </>
      )}
    </div>
  );
}

export function ProductivityHub({ open, onClose }) {
  const fold = useFoldTransition(open, { ms: 340 });
  const [loading, setLoading] = useState(true);
  const [checklistItems, setChecklistItems] = useState([]);
  const [completedIds, setCompletedIds] = useState(new Set());
  const [suggestions, setSuggestions] = useState([]);
  const [changelogEntries, setChangelogEntries] = useState([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
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
  }, [open]);

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

  if (!fold.mounted) return null;

  return createPortal(
    <div
      className="fold-backdrop" data-fold={fold.fold}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
    >
      <div
        className="fold-modal" data-fold={fold.fold}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "16px", padding: "22px" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "18px" }}>
          <div>
            <div style={{ fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "6px" }}>For You</div>
            <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>Money Moves</div>
          </div>
          <Pressable onClick={onClose} aria-label="Close" style={{ background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", fontSize: "18px", padding: "2px 6px" }}>✕</Pressable>
        </div>

        {loading ? (
          <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Loading…</div>
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
      </div>
    </div>,
    document.body,
  );
}
