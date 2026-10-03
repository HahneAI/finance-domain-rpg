import { useState } from "react";
import { Pressable, iS } from "./ui.jsx";

// Home "Cash on Hand" hero (TODO §22). Presentation only — every number comes
// from computeCashOnHand() (lib/cashOnHand.js), computed once in App.jsx.
// `cash` null + `enabled` = setup prompt (no starting balance yet).
const fmt = (n) => `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;
const STATUS = {
  green: { color: "var(--color-green)", label: "Covered" },
  orange: { color: "var(--color-warning)", label: "Tighten up" },
  red: { color: "var(--color-red)", label: "A Needs bill is at risk" },
};

function BalanceEditor({ initial, onSave, onCancel, prompt }) {
  const [draft, setDraft] = useState(initial != null ? String(initial) : "");
  const [attempted, setAttempted] = useState(false);
  const empty = draft.trim() === "" || Number.isNaN(parseFloat(draft.replace(/,/g, "")));
  const save = () => {
    setAttempted(true);
    if (empty) return;
    onSave(parseFloat(draft.replace(/,/g, "")));
  };
  return (
    <div>
      <label htmlFor="coh-balance" className="text-xs" style={{ display: "block", color: attempted && empty ? "var(--color-red)" : "var(--color-text-secondary)", marginBottom: "6px" }}>
        {prompt}
      </label>
      <input
        id="coh-balance" inputMode="decimal" placeholder="e.g. 1,250" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ ...iS, borderColor: attempted && empty ? "var(--color-red)" : undefined }}
      />
      {attempted && empty && <div className="text-2xs" style={{ color: "var(--color-red)", marginTop: "4px" }}>↑ Required</div>}
      <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
        {onCancel && (
          <Pressable onClick={onCancel} className="text-xs" style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "7px 14px", textTransform: "uppercase", cursor: "pointer" }}>
            Cancel
          </Pressable>
        )}
        <Pressable onClick={save} aria-label="Save cash on hand" className="text-xs" style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "8px 16px", fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>
          Save
        </Pressable>
      </div>
    </div>
  );
}

export function CashOnHandCard({ cash, checkWord = "week", onSetBalance, onOpenLedger }) {
  const [editing, setEditing] = useState(false);
  const shell = {
    marginBottom: "20px", padding: "18px 16px", borderRadius: "18px",
    background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)",
  };
  const eyebrow = (
    <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)", marginBottom: "6px" }}>
      Cash on Hand
    </div>
  );

  if (!cash || editing) {
    return (
      <section aria-label="Cash on hand" style={shell}>
        {eyebrow}
        {!cash && (
          <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginBottom: "12px", lineHeight: 1.5 }}>
            Tell us what&apos;s in your bank account today. From here we add each paycheck and take out your Needs bills, so you always know if this {checkWord} is covered.
          </div>
        )}
        <BalanceEditor
          initial={editing ? Math.round(cash?.cashOnHand ?? 0) : null}
          prompt="What's in your bank account right now?"
          onCancel={editing ? () => setEditing(false) : null}
          onSave={(v) => { onSetBalance(v); setEditing(false); }}
        />
        <div className="text-2xs" style={{ color: "var(--color-text-disabled)", marginTop: "10px" }}>
          Your own number — the app never reads your bank.
        </div>
      </section>
    );
  }

  const st = STATUS[cash.status];
  return (
    <section aria-label="Cash on hand" style={{ ...shell, borderColor: st.color }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {eyebrow}
        <Pressable onClick={() => setEditing(true)} aria-label="Edit cash on hand" className="text-2xs"
          style={{ background: "transparent", border: "1px solid var(--color-border-subtle)", borderRadius: "8px", color: "var(--color-text-secondary)", padding: "4px 8px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "1px" }}>
          ✎ Edit
        </Pressable>
      </div>
      <div style={{ fontSize: "36px", fontWeight: 900, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", lineHeight: 1.15 }}>
        {fmt(cash.cashOnHand)}
      </div>
      {cash.freedomAllowanceIncluded > 0 && (
        <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>
          includes {fmt(cash.freedomAllowanceIncluded)} freedom allowance
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "14px", gap: "12px" }}>
        <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Set aside this {checkWord} (Needs)</span>
        <span className="text-sm" style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{fmt(cash.setAside)}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", gap: "12px" }}>
        <span className="text-sm" style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
        <span className="text-sm" style={{ color: st.color, fontWeight: 700 }}>
          {cash.gap >= 0 ? `${fmt(cash.gap)} to spare` : `${fmt(-cash.gap)} short`}
        </span>
      </div>

      {cash.pendingCount > 0 && (
        <Pressable onClick={onOpenLedger} aria-label="View pending paycheck credits" className="text-xs"
          style={{ display: "block", width: "100%", textAlign: "left", marginTop: "12px", padding: "10px 12px", borderRadius: "10px", cursor: "pointer",
            background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.32)", color: "var(--color-text-primary)" }}>
          Includes {fmt(cash.pendingTotal)} estimated paycheck credit{cash.pendingCount === 1 ? "" : "s"} — finish your check-in to confirm →
        </Pressable>
      )}
      {cash.pendingCount === 0 && cash.credits.length > 0 && (
        <Pressable onClick={onOpenLedger} aria-label="View paycheck credits" className="text-xs"
          style={{ background: "transparent", border: "none", padding: 0, marginTop: "10px", color: "var(--color-teal)", cursor: "pointer" }}>
          View paycheck credits →
        </Pressable>
      )}

      <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "12px", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "10px" }}>
        {cash.ifStoppedWeeks != null
          ? `If paychecks stopped: about ${cash.ifStoppedWeeks.toFixed(1)} weeks of Needs covered.`
          : "If paychecks stopped: no Needs bills to cover."}
      </div>
      <div className="text-2xs" style={{ color: "var(--color-text-disabled)", marginTop: "6px" }}>
        Estimate from your balance on {new Date(cash.asOf + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}, paychecks and Needs bills since — not a bank read.
      </div>
    </section>
  );
}
