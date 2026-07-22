/**
 * TrialExplainerScreen — free trial breakdown shown once after account
 * creation, before a first-run user reaches SetupWizard (docs/TODO.md §17).
 *
 * Rendered by App.jsx in place of the wizard/app whenever wizardEntry===false
 * (fresh signup, not a life-event re-entry) and the account actually has a
 * real trial window (entitlement.state === "trial"). Not persisted server-side
 * — `onContinue` just flips local App.jsx state for the rest of the session,
 * same "re-prompts until setupComplete" behavior wizardEntry itself already has.
 *
 * Copy only ever states the public trial length (trialDaysLeft, computed by
 * getEntitlement) — never the hidden grace window or access_ends_at cutoff.
 */
import { useState } from "react";
import { Shell } from "./LoginScreen.jsx";
import { Pressable } from "./ui.jsx";

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  : null;

export function TrialExplainerScreen({ trialDaysLeft, trialEndsAt, onContinue }) {
  const [understood, setUnderstood] = useState(false);
  const days = trialDaysLeft ?? 14;
  const dayWord = days === 1 ? "day" : "days";
  const endDate = fmtDate(trialEndsAt);

  const rows = [
    {
      label: "Full access",
      detail: `Every feature — income modeling, budgeting, goals, and event logging — unlocked for ${days} ${dayWord}.`,
    },
    {
      label: "No card required",
      detail: "Your trial starts today, free, with nothing charged.",
    },
    {
      label: "A heads-up first",
      detail: "Around day 7 we'll remind you to add a card so there's no interruption when the trial ends.",
    },
    endDate && {
      label: "Trial ends",
      detail: `${endDate} — add a card any time before then to keep full access.`,
    },
    {
      label: "After your trial",
      detail: "Plans start at $14.99/mo, or $10.00/mo billed annually ($120/yr).",
    },
  ].filter(Boolean);

  return (
    <Shell title="Your free trial" subtitle={`${days} ${dayWord} of full access, on us.`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "22px" }}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-teal)" }}>
              {row.label}
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
              {row.detail}
            </div>
          </div>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", marginBottom: "18px" }}>
        <input
          type="checkbox"
          checked={understood}
          onChange={e => setUnderstood(e.target.checked)}
          style={{ marginTop: "3px", accentColor: "var(--color-teal)", width: "16px", height: "16px", flexShrink: 0 }}
        />
        <span style={{ fontSize: "12px", color: "var(--color-text-primary)", lineHeight: 1.6 }}>
          I understand my free trial lasts {days} {dayWord}, no card required to start{endDate ? `, and ends ${endDate}` : ""}.
        </span>
      </label>

      <Pressable
        onClick={onContinue}
        disabled={!understood}
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: "12px",
          border: "none",
          background: understood ? "var(--color-teal)" : "var(--color-bg-raised)",
          color: understood ? "var(--color-bg-base)" : "var(--color-text-disabled)",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          cursor: understood ? "pointer" : "default",
        }}
      >
        Continue to setup
      </Pressable>
    </Shell>
  );
}
