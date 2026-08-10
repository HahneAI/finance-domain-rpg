import { useEffect, useState } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";
import { estimateWeeklyNet } from "../lib/finance.js";

/**
 * RateUpdateModal — modal launched from the LifeEventMenu "Quick Rate Update" tile
 * (TODO §1.D). For a raise/rate change with no structural change — no wizard, just
 * a new `baseRate` + an effective date shown against a before/after net preview.
 *
 * `onActivate({ baseRate, effectiveFrom })` — App.jsx applies `baseRate` to config
 * and tags the account_history snapshot (TODO §3) with `effectiveFrom` as the
 * change's `source: "life_event:rate_update"` date, the same pattern NewJobSeasonEntry
 * uses for `newJobSeasonDate`.
 */
export function RateUpdateModal({ open, onClose, config, onActivate }) {
  const today = new Date().toISOString().slice(0, 10);
  const [rateDraft, setRateDraft] = useState("");
  const [date, setDate] = useState(today);
  const fold = useFoldTransition(open, { ms: 340 });

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRateDraft(config?.baseRate != null ? String(config.baseRate) : "");
    setDate(today);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, today, config?.baseRate]);

  if (!fold.mounted) return null;

  const oldRate = config?.baseRate ?? 0;
  const newRate = rateDraft === "" ? null : Math.max(0, parseFloat(rateDraft) || 0);
  const canActivate = !!date && newRate != null && newRate > 0;

  const oldNet = estimateWeeklyNet(config ?? {}).net;
  const newNet = canActivate ? estimateWeeklyNet({ ...config, baseRate: newRate }).net : oldNet;
  const netDelta = newNet - oldNet;

  const confirm = () => {
    if (!canActivate) return;
    onActivate({ baseRate: newRate, effectiveFrom: date });
    onClose();
  };

  const labelStyle = { fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)", display: "block", marginBottom: "6px" };
  const inputStyle = {
    width: "100%",
    background: "var(--color-bg-base)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "10px",
    color: "var(--color-text-primary)",
    fontSize: "16px",
    fontFamily: "var(--font-sans)",
    padding: "10px 12px",
    colorScheme: "dark",
  };
  const fmt = n => `$${Math.abs(n).toFixed(2)}`;

  return (
    <div
      className="fold-backdrop"
      data-fold={fold.fold}
      onClick={onClose}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        className="fold-modal"
        data-fold={fold.fold}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: "440px",
          maxHeight: "90vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div className="text-2xs" style={{ letterSpacing: "3px", color: "var(--color-teal)", textTransform: "uppercase", marginBottom: "5px" }}>
            Life Event
          </div>
          <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
            Quick Rate Update
          </div>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "18px", overflowY: "auto" }}>
          <p className="text-base" style={{ margin: 0, lineHeight: 1.6, color: "var(--color-text-secondary)" }}>
            For a raise or rate change with everything else the same — schedule, employer, and
            benefits are untouched. Use Pay Structure Changed instead for anything bigger.
          </p>

          <div>
            <label style={labelStyle}>New hourly rate</label>
            <input
              type="number" min="0" step="0.01" inputMode="decimal"
              value={rateDraft}
              onChange={(e) => setRateDraft(e.target.value)}
              placeholder="e.g. 24.50"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Effective date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "12px",
            padding: "14px",
            display: "flex", flexDirection: "column", gap: "8px",
          }}>
            <div className="text-sm" style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-primary)" }}>
              <span>Base rate</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>
                ${oldRate.toFixed(2)}/hr {canActivate && <span style={{ color: "var(--color-text-secondary)" }}>→</span>} {canActivate && <strong style={{ color: "var(--color-teal)" }}>${newRate.toFixed(2)}/hr</strong>}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", marginTop: "2px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>Est. weekly net change</span>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700,
                color: netDelta >= 0 ? "var(--color-green)" : "var(--color-deduction)",
              }}>
                {canActivate ? `${netDelta >= 0 ? "+" : "−"}${fmt(netDelta)}` : "—"}
              </span>
            </div>
          </div>

          <div className="text-xs" style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.28)",
            borderRadius: "10px",
            padding: "10px 12px",
            color: "var(--color-text-secondary)", lineHeight: 1.5,
          }}>
            Goals, expenses, and logs are untouched — only forward-looking projections use the new rate.
          </div>
        </div>

        <div style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex", gap: "10px", justifyContent: "flex-end",
        }}>
          <Pressable
            onClick={onClose}
            className="text-xs" style={{
              background: "var(--color-bg-raised)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "12px", padding: "7px 14px",
              letterSpacing: "2px", textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Cancel
          </Pressable>
          <Pressable
            onClick={confirm}
            disabled={!canActivate}
            className="text-xs" style={{
              background: canActivate ? "var(--color-teal)" : "var(--color-bg-raised)",
              color: canActivate ? "var(--color-bg-base)" : "var(--color-text-disabled)",
              border: "none", borderRadius: "12px", padding: "8px 16px",
              letterSpacing: "2px", textTransform: "uppercase",
              fontWeight: "bold",
              cursor: canActivate ? "pointer" : "not-allowed",
            }}
          >
            Confirm
          </Pressable>
        </div>
      </div>
    </div>
  );
}
