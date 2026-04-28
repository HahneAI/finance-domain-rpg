/**
 * DemoAccountTree — in-app placeholder shown when the investor's
 * active account is Demo 1 or Demo 2 (activeInvestorAccount === 1 | 2).
 *
 * Phase 1: visual placeholder only.
 * Future sprint: load read-only fixture data and render the financial
 * panels in a locked/demo mode.
 */
import { SH } from "./ui.jsx";

export function DemoAccountTree({ accountNumber = 1 }) {
  return (
    <div style={{ padding: "20px 16px" }}>
      <SH color="var(--color-gold)">Demo Account {accountNumber}</SH>
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "12px",
          padding: "32px 20px",
          textAlign: "center",
          marginTop: "8px",
        }}
      >
        <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--color-text-primary)", marginBottom: "8px", fontFamily: "var(--font-sans)" }}>
          Sample Profile {accountNumber}
        </div>
        <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.7, fontFamily: "var(--font-sans)" }}>
          A curated demo account is coming soon.
          <br />
          Switch to account <strong style={{ color: "var(--color-gold)" }}>3*</strong> in the menu to set up your own.
        </div>
      </div>
    </div>
  );
}
