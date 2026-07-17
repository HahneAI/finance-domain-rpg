import { useEffect } from "react";
import { Pressable, useFoldTransition } from "./ui.jsx";

/**
 * LifeEventMenu — modal launcher for the Life Events flow (TODO §15.A).
 *
 * Replaces the inline dropdown that lived in the desktop sidebar and mobile
 * drawer. Three icon-forward tiles route to the appropriate flow:
 *  - Pay Structure Changed → SetupWizard re-entry (`structure_change`, §15.B)
 *  - Lost My Job          → JobLossEntry modal (§15.C1)
 *  - Quick Rate Update    → RateUpdateModal (§15.D)
 *
 * `onSelect(route)` is called with either a SetupWizard life-event string or
 * the sentinel `"job_loss"`, which the parent interprets as "open the
 * JobLossEntry modal" rather than the wizard.
 */
export function LifeEventMenu({ open, onClose, onSelect }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fold = useFoldTransition(open, { ms: 340 });
  if (!fold.mounted) return null;

  const tiles = [
    {
      id: "structure_change",
      title: "Pay Structure Changed",
      desc: "New employer, salary, raise, or commission added.",
      route: "structure_change",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 3h5v5" /><path d="M8 21H3v-5" />
          <path d="M21 3l-7 7" /><path d="M3 21l7-7" />
        </svg>
      ),
    },
    {
      id: "lost_job",
      title: "Lost My Job",
      desc: "Switch to Job Loss Mode and manage your runway.",
      route: "job_loss",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 13.5V8a2 2 0 0 0-2-2h-5l-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
          <path d="M16 19h6" />
        </svg>
      ),
    },
    {
      id: "rate_update",
      title: "Quick Rate Update",
      desc: "Just changed your hourly rate? No structure change.",
      route: "rate_update",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v20" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="fold-backdrop" data-fold={fold.fold}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 70,
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "9px", letterSpacing: "3px", color: "var(--color-gold)", textTransform: "uppercase", marginBottom: "5px" }}>
                Life Events
              </div>
              <div style={{ fontSize: "16px", fontWeight: "bold", color: "var(--color-text-primary)" }}>
                What changed?
              </div>
            </div>
            <Pressable
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "var(--color-bg-raised)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "8px",
                color: "var(--color-text-secondary)",
                width: "32px", height: "32px",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" /><path d="M6 6l12 12" />
              </svg>
            </Pressable>
          </div>
        </div>

        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px", overflowY: "auto" }}>
          {tiles.map((t) => {
            const disabled = t.comingSoon;
            return (
              <Pressable
                key={t.id}
                onClick={() => {
                  if (disabled) return;
                  onSelect(t.route);
                  onClose();
                }}
                disabled={disabled}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "14px",
                  padding: "16px",
                  minHeight: "76px",
                  background: "var(--color-bg-raised)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "12px",
                  textAlign: "left",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.55 : 1,
                  transition: "border-color 150ms ease, background 150ms ease",
                  color: "var(--color-text-primary)",
                  width: "100%",
                }}
              >
                <div style={{
                  flexShrink: 0,
                  width: "40px", height: "40px",
                  borderRadius: "10px",
                  background: "rgba(0,200,150,0.10)",
                  border: "1px solid var(--color-border-accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--color-accent-primary)",
                }}>
                  {t.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {t.title}
                    </span>
                    {t.comingSoon && (
                      <span style={{
                        fontSize: "8px", letterSpacing: "1.5px", textTransform: "uppercase",
                        color: "var(--color-bg-base)", background: "var(--color-warning)",
                        padding: "2px 6px", borderRadius: "3px", fontWeight: "bold",
                      }}>
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", lineHeight: 1.4, color: "var(--color-text-secondary)" }}>
                    {t.desc}
                  </div>
                </div>
              </Pressable>
            );
          })}
        </div>
      </div>
    </div>
  );
}
