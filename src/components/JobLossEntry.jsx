import { useEffect, useState } from "react";

/**
 * JobLossEntry — modal launched from the LifeEventMenu "Lost My Job" tile.
 *
 * Captures the job-loss effective date and, on confirm, calls `onActivate`
 * with `{ jobLossDate, jobLossMode: true }`. App.jsx merges that into config,
 * which flips the engine into Job Loss Mode (buildYear zeros out earned
 * income from that date forward).
 *
 * TODO §15.C1 foundation: this is the entry. The dashboard (§C2–C6) and
 * "Back to Work" exit flow are wired separately.
 */
export function JobLossEntry({ open, onClose, onActivate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, today]);

  if (!open) return null;

  const confirm = () => {
    if (!date) return;
    onActivate({ jobLossDate: date, jobLossMode: true });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "14px",
          width: "100%", maxWidth: "420px",
          display: "flex", flexDirection: "column",
          animation: "weekCardIn 220ms ease-out",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "5px" }}>
            Life Event
          </div>
          <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
            Enter Job Loss Mode
          </div>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
            From the date below forward, projected earned income drops to $0.
            Goals, expenses, and logs are preserved — only forward-looking finance
            math recalculates.
          </p>

          <div>
            <label style={{ fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", display: "block", marginBottom: "6px" }}>
              Job loss effective date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: "100%",
                background: "var(--color-bg-base)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "10px",
                color: "var(--color-text-primary)",
                fontSize: "16px",
                fontFamily: "var(--font-mono)",
                padding: "10px 12px",
                colorScheme: "dark",
              }}
            />
          </div>

          <div style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.28)",
            borderRadius: "10px",
            padding: "10px 12px",
            fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.5,
          }}>
            You can exit Job Loss Mode anytime via the <strong style={{ color: "var(--color-warning)" }}>Back to Work</strong> button
            in the app banner — that flow walks you through re-entering your new pay structure.
          </div>
        </div>

        <div style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex", gap: "10px", justifyContent: "flex-end",
        }}>
          <button
            onClick={onClose}
            style={{
              background: "var(--color-bg-raised)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "12px", padding: "7px 14px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={!date}
            style={{
              background: date ? "var(--color-gold)" : "var(--color-bg-raised)",
              color: date ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 16px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold",
              cursor: date ? "pointer" : "not-allowed",
            }}
          >
            Activate
          </button>
        </div>
      </div>
    </div>
  );
}
