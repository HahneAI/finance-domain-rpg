import { useState } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";

/**
 * CashOnHandSheet — single-line bottom-sheet editor for
 * `config.jobLossCashOnHand`, launched from the pencil-badged Cash On Hand
 * card (TODO §15.H17). Deliberately not the full BudgetPanel expense-detail
 * sheet pattern (view/edit modes, multi-scope save buttons) — this is one
 * number, one Save. Visual language matches that sheet (bg-surface, pull
 * handle, 20px top-radius, portal-free since it isn't nested under any
 * scrolling ancestor here) via the shared `.fold-sheet` class (index.css) —
 * up-from-bottom entrance, slide-back-down exit, both driven by
 * `useFoldTransition` so the exit actually animates instead of an instant
 * unmount (a real gap in the expense-detail sheet's own close behavior).
 *
 * `currentValue` should be the *effective* (timeline-decayed) cash figure —
 * whatever the card is currently displaying — not the stale raw
 * `config.jobLossCashOnHand`, so the prefilled number always matches what
 * the user just saw. `onSave(parsedValue)` is called with a plain number;
 * the caller (JobLossHomePanel/JobLossBudgetPanel) is responsible for
 * writing both `jobLossCashOnHand` and stamping `jobLossCashOnHandAsOf` to
 * `effectiveToday` via eager save — confirming a value here always resets
 * the decay clock, since the user is telling the app "this is true right now."
 */
export function CashOnHandSheet({ open, onClose, currentValue, onSave }) {
  const [draft, setDraft] = useState("");
  const [attempted, setAttempted] = useState(false);

  // Re-prefill on the closed→open transition only — React's documented
  // "adjust state during render" pattern (react.dev), not a useEffect (which
  // would fire an extra render and, since this effect would do nothing but
  // mirror props into state with no real external system, trips
  // react-hooks/set-state-in-effect). Tracking `open` itself (not a synced
  // copy of `currentValue`) means the draft is only reset when the sheet
  // actually (re)opens — a `currentValue` change while already open (e.g.
  // the decay recompute ticking over) never clobbers in-progress typing.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setDraft(currentValue != null ? String(Math.round(currentValue)) : "");
      setAttempted(false);
    }
  }

  const fold = useFoldTransition(open, { ms: 280 });
  if (!fold.mounted) return null;

  const parsed = draft === "" ? null : parseFloat(draft);
  const valid = draft !== "" && Number.isFinite(parsed) && parsed >= 0;

  const save = () => {
    if (!valid) { setAttempted(true); return; }
    if (currentValue != null && parsed === Math.round(currentValue)) { onClose(); return; }
    onSave(parsed);
    onClose();
  };

  return (
    <div
      className="fold-backdrop" data-fold={fold.fold}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-end",
      }}
    >
      <div
        className="fold-sheet" data-fold={fold.fold}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderBottom: "none",
          borderRadius: "20px 20px 0 0",
          padding: "10px 20px calc(20px + env(safe-area-inset-bottom))",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 14px" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--color-border-subtle)" }} />
        </div>

        <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)", marginBottom: "4px" }}>
          Update Cash On Hand
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "16px", lineHeight: 1.5 }}>
          Whatever you could draw on today — savings, checking. Drives your runway.
        </div>

        <input
          type="number" min="0" step="50" inputMode="decimal" autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. 1,023"
          style={{
            width: "100%",
            background: "var(--color-bg-base)",
            border: `1px solid ${attempted && !valid ? "var(--color-deduction)" : "var(--color-border-subtle)"}`,
            borderRadius: "10px",
            color: "var(--color-text-primary)",
            fontSize: "20px",
            fontFamily: "var(--font-mono)",
            padding: "14px",
            colorScheme: "dark",
            boxSizing: "border-box",
          }}
        />
        {attempted && !valid && (
          <div style={{ fontSize: "10px", color: "var(--color-deduction)", marginTop: "6px" }}>
            ↑ Required — 0 is a fine answer, just not empty
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "18px" }}>
          <Pressable
            onClick={onClose}
            style={{
              flex: 1, padding: "13px",
              background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)",
              borderRadius: "12px", color: "var(--color-text-secondary)",
              fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer",
            }}
          >
            Cancel
          </Pressable>
          <Pressable
            onClick={save}
            style={{
              flex: 2, padding: "13px",
              background: "var(--color-teal)", border: "none",
              borderRadius: "12px", color: "var(--color-bg-base)",
              fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Save
          </Pressable>
        </div>
      </div>
    </div>
  );
}
