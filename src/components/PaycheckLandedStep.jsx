import { useState } from "react";
import { Pressable, iS } from "./ui.jsx";

// Final step of the pay-period check-in (TODO §22.C). Shown right after the
// days are confirmed, so `estimate` (computeCashOnHand's credit for this pay
// week) already reflects any missed/extra days just logged. The user's figure
// is stored in config.cashOnHandCreditCorrections[weekIdx]; skipping keeps the
// estimate. Self-report — the app never reads the bank.
const short = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function PaycheckLandedStep({ credit, onSave, onSkip }) {
  const initial = credit.corrected ? credit.amount : credit.estimate;
  const [draft, setDraft] = useState(String(Math.round(initial * 100) / 100));
  const [attempted, setAttempted] = useState(false);
  const parsed = parseFloat(draft.replace(/[$,]/g, ""));
  const invalid = draft.trim() === "" || Number.isNaN(parsed) || parsed < 0;
  const save = () => { setAttempted(true); if (!invalid) onSave(parsed); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 260, background: "rgba(3,10,7,0.88)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div role="dialog" aria-modal="true" aria-label="Paycheck landed" style={{ width: "100%", maxWidth: "420px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "18px", padding: "20px 18px" }}>
        <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)", marginBottom: "6px" }}>
          Last step · Cash on hand
        </div>
        <div className="text-md" style={{ color: "var(--color-text-primary)", fontWeight: 700, marginBottom: "6px" }}>
          How much of this check actually landed in your bank account?
        </div>
        <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginBottom: "14px", lineHeight: 1.5 }}>
          Paycheck {short(credit.dateIso)} · pay period {short(credit.periodStartIso)} – {short(credit.periodEndIso)}.
          We estimated {`$${Math.round(credit.estimate).toLocaleString()}`} from your schedule — change it to what you actually got.
        </div>
        <label htmlFor="paycheck-landed" className="text-xs" style={{ display: "block", color: attempted && invalid ? "var(--color-red)" : "var(--color-text-secondary)", marginBottom: "6px" }}>
          Amount added to your cash on hand
        </label>
        <input id="paycheck-landed" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)}
          style={{ ...iS, borderColor: attempted && invalid ? "var(--color-red)" : undefined }} />
        {attempted && invalid && <div className="text-2xs" style={{ color: "var(--color-red)", marginTop: "4px" }}>↑ Required</div>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
          <Pressable onClick={onSkip} aria-label="Keep the estimate" className="text-xs"
            style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "7px 14px", textTransform: "uppercase", cursor: "pointer" }}>
            Keep estimate
          </Pressable>
          <Pressable onClick={save} aria-label="Save paycheck amount" className="text-xs"
            style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "8px 16px", fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>
            Save
          </Pressable>
        </div>
        <div className="text-2xs" style={{ color: "var(--color-text-disabled)", marginTop: "12px" }}>
          Your own number — the app never reads your bank.
        </div>
      </div>
    </div>
  );
}
