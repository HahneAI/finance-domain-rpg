import { Pressable } from "./ui.jsx";

// Log panel "Paycheck Credits" ledger (TODO §22). Presentation only — rows come
// from computeCashOnHand().credits (lib/cashOnHand.js). Reached from the Home
// Cash on Hand card; a pending row is an estimated credit until the user
// finishes that pay period's check-in (the notification bell).
const fmt = (n) => `$${Math.round(n).toLocaleString()}`;
const short = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function PaycheckCreditsLedger({ cash, onOpenCheckIn }) {
  if (!cash) return null;
  return (
    <section id="paycheck-credits" aria-label="Paycheck credits" style={{ marginBottom: "24px", padding: "16px", borderRadius: "12px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-subtle)" }}>
      <div className="text-xs" style={{ letterSpacing: "3px", color: "var(--color-text-secondary)", textTransform: "uppercase", marginBottom: "8px" }}>
        Paycheck Credits
      </div>
      {cash.pendingCount > 0 && (
        <div style={{ padding: "12px", borderRadius: "10px", marginBottom: "12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.32)" }}>
          <div className="text-sm" style={{ color: "var(--color-text-primary)", lineHeight: 1.5 }}>
            {cash.pendingCount === 1 ? "One paycheck is" : `${cash.pendingCount} paychecks are`} counted in your cash on hand as an estimate from your schedule.
            Finish your check-in (the 🔔 bell up top) to confirm what actually landed — that&apos;s what keeps this number honest.
          </div>
          {onOpenCheckIn && (
            <Pressable onClick={onOpenCheckIn} aria-label="Finish check-in" className="text-xs"
              style={{ marginTop: "10px", background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "8px 16px", fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}>
              Finish check-in
            </Pressable>
          )}
        </div>
      )}
      {cash.credits.length === 0 && (
        <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>No paychecks since you set your balance on {short(cash.asOf)}.</div>
      )}
      {cash.credits.map(c => (
        <div key={c.weekIdx} data-testid="paycheck-credit-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "8px 0", borderTop: "1px solid var(--color-border-subtle)" }}>
          <div style={{ minWidth: 0 }}>
            <div className="text-sm" style={{ color: "var(--color-text-primary)" }}>Paycheck · {short(c.dateIso)}</div>
            <div className="text-2xs" style={{ color: "var(--color-text-disabled)" }}>
              Pay period {short(c.periodStartIso)} – {short(c.periodEndIso)}{c.corrected ? " · your number" : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div className="text-sm" style={{ color: "var(--color-green)", fontWeight: 700 }}>+{fmt(c.amount)}</div>
            <div className="text-2xs" style={{ color: c.status === "pending" ? "var(--color-warning)" : "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "1px" }}>
              {c.status === "pending" ? "Estimated · check-in pending" : "Confirmed"}
            </div>
          </div>
        </div>
      ))}
      <div className="text-2xs" style={{ color: "var(--color-text-disabled)", marginTop: "10px" }}>
        Started from your balance of {fmt(cash.anchor)} on {short(cash.asOf)} · Needs bills since: −{fmt(cash.billsDueSince)}
      </div>
    </section>
  );
}
