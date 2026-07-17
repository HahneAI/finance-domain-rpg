import { useEffect, useState } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";

/**
 * JobLossEntry — modal launched from the LifeEventMenu "Lost My Job" tile.
 *
 * Captures the job-loss effective date AND the unemployment-benefit setup
 * (TODO §15.C1 + §15.C2). On confirm, `onActivate` receives the full config
 * patch:
 *   {
 *     jobLossMode: true, jobLossDate,
 *     unemploymentEnabled, unemploymentWeekly, unemploymentDurationWeeks,
 *     unemploymentWaitingWeek,
 *   }
 *
 * App.jsx merges that into config, which flips the engine into Job Loss Mode
 * and starts paying out the weekly benefit during the eligibility window.
 */
export function JobLossEntry({ open, onClose, onActivate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  // null = unanswered (Activate disabled); true/false once user picks.
  const [unemploymentAnswered, setUnemploymentAnswered] = useState(null);
  const [weeklyDraft, setWeeklyDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("");
  const [waitingWeek, setWaitingWeek] = useState(true);

  useEffect(() => {
    if (!open) return;
    setDate(today);
    setUnemploymentAnswered(null);
    setWeeklyDraft("");
    setDurationDraft("");
    setWaitingWeek(true);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, today]);

  const fold = useFoldTransition(open, { ms: 340 });
  if (!fold.mounted) return null;

  const hasUnemployment = unemploymentAnswered === true;
  const weeklyVal   = weeklyDraft   === "" ? null : Math.max(0, parseFloat(weeklyDraft)  || 0);
  const durationVal = durationDraft === "" ? null : Math.max(0, parseInt(durationDraft, 10) || 0);
  const unemploymentFieldsValid = !hasUnemployment || ((weeklyVal ?? 0) > 0 && (durationVal ?? 0) > 0);
  const canActivate = !!date && unemploymentAnswered !== null && unemploymentFieldsValid;

  const confirm = () => {
    if (!canActivate) return;
    onActivate({
      jobLossMode: true,
      jobLossDate: date,
      unemploymentEnabled: hasUnemployment,
      unemploymentWeekly: hasUnemployment ? weeklyVal : null,
      unemploymentDurationWeeks: hasUnemployment ? durationVal : null,
      unemploymentWaitingWeek: hasUnemployment ? waitingWeek : false,
    });
    onClose();
  };

  const labelStyle = { fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", display: "block", marginBottom: "6px" };
  const inputStyle = {
    width: "100%",
    background: "var(--color-bg-base)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "10px",
    color: "var(--color-text-primary)",
    fontSize: "16px",
    fontFamily: "var(--font-mono)",
    padding: "10px 12px",
    colorScheme: "dark",
  };

  return (
    <div
      className="fold-backdrop" data-fold={fold.fold}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 80,
        background: "rgba(0,0,0,0.78)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="fold-modal" data-fold={fold.fold}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "14px",
          width: "100%", maxWidth: "440px",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
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

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "18px", overflowY: "auto" }}>
          <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
            From the date below forward, projected earned income drops to $0.
            Goals, expenses, and logs are preserved — only forward-looking finance
            math recalculates.
          </p>

          <div>
            <label style={labelStyle}>Job loss effective date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* ── Unemployment Y/N gate (§15.C2) ── */}
          <div>
            <label style={labelStyle}>Are you getting unemployment benefits?</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[{ v: true, label: "Yes" }, { v: false, label: "No" }].map(opt => {
                const active = unemploymentAnswered === opt.v;
                return (
                  <Pressable
                    key={opt.label}
                    onClick={() => setUnemploymentAnswered(opt.v)}
                    style={{
                      padding: "8px 18px",
                      fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase",
                      background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
                      color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                      border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                      borderRadius: "10px",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s, color 0.15s",
                    }}
                  >
                    {active && "✓ "}{opt.label}
                  </Pressable>
                );
              })}
            </div>
          </div>

          {/* ── If Yes: weekly benefit, duration, waiting-week toggle ── */}
          {hasUnemployment && (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={labelStyle}>Weekly benefit amount</label>
                <input
                  type="number" min="0" step="1" inputMode="decimal"
                  value={weeklyDraft}
                  onChange={(e) => setWeeklyDraft(e.target.value)}
                  placeholder="e.g. 400"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Benefit duration (weeks)</label>
                <input
                  type="number" min="0" step="1" inputMode="numeric"
                  value={durationDraft}
                  onChange={(e) => setDurationDraft(e.target.value)}
                  placeholder="e.g. 26"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Waiting week (first week unpaid)</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {[{ v: true, label: "Yes" }, { v: false, label: "No" }].map(opt => {
                    const active = waitingWeek === opt.v;
                    return (
                      <Pressable
                        key={opt.label}
                        onClick={() => setWaitingWeek(opt.v)}
                        style={{
                          padding: "7px 14px",
                          fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase",
                          background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
                          color: active ? "var(--color-gold)" : "var(--color-text-secondary)",
                          border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                          borderRadius: "10px",
                          cursor: "pointer",
                          transition: "background 0.15s, border-color 0.15s, color 0.15s",
                        }}
                      >
                        {active && "✓ "}{opt.label}
                      </Pressable>
                    );
                  })}
                </div>
                <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--color-text-disabled)", lineHeight: 1.5 }}>
                  Most states make the first week unpaid; the duration count starts after.
                </div>
              </div>

              <div style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.28)",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.5,
              }}>
                Unemployment income is federally taxable, but withholding is optional and
                not modeled here. Set aside ~10% if you didn't elect withholding when you filed.
              </div>
            </div>
          )}

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
          <Pressable
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
          </Pressable>
          <Pressable
            onClick={confirm}
            disabled={!canActivate}
            style={{
              background: canActivate ? "var(--color-gold)" : "var(--color-bg-raised)",
              color: canActivate ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 16px",
              fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold",
              cursor: canActivate ? "pointer" : "not-allowed",
            }}
          >
            Activate
          </Pressable>
        </div>
      </div>
    </div>
  );
}
