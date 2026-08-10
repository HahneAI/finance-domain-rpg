import { useMemo, useState } from "react";
import { Pressable, SH } from "./ui.jsx";

/**
 * ReemploymentTracker — embedded in NewJobSeasonDashboard (TODO §1.C6).
 *
 * Three sections:
 *   1. Target income — annual + estimated weekly net, pre-filled from
 *      baseRate × maxWeeklyHours × 52 when not yet set
 *   2. Expected return-to-work date — feeds into buildYear so the engine
 *      resumes earned-income math from that week forward
 *   3. Application log — inline CRUD over a list stored on config.jobApplications
 *
 * Status pills carry the spec colors:
 *   Applied   → gray
 *   Screening → teal
 *   Interview → teal
 *   Offer     → green
 *   Rejected  → red
 *   Withdrawn → muted gray
 */

const STATUS_OPTIONS = [
  { v: "applied",   label: "Applied",   tone: "muted" },
  { v: "screening", label: "Screening", tone: "teal"  },
  { v: "interview", label: "Interview", tone: "teal"  },
  { v: "offer",     label: "Offer",     tone: "green" },
  { v: "rejected",  label: "Rejected",  tone: "red"   },
  { v: "withdrawn", label: "Withdrawn", tone: "muted" },
];

const TONE_BG = {
  muted: "rgba(127,163,154,0.12)",
  teal:  "rgba(245,158,11,0.14)",
  green: "rgba(34,197,94,0.14)",
  red:   "rgba(239,68,68,0.14)",
};
const TONE_FG = {
  muted: "var(--color-text-secondary)",
  teal:  "var(--color-warning)",
  green: "var(--color-green)",
  red:   "var(--color-deduction)",
};

function toneFor(status) {
  return STATUS_OPTIONS.find(o => o.v === status)?.tone ?? "muted";
}

function genId() {
  return `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const inputStyle = {
  width: "100%",
  background: "var(--color-bg-raised)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: "10px",
  color: "var(--color-text-primary)",
  fontSize: "14px",
  fontFamily: "var(--font-sans)",
  padding: "9px 12px",
  colorScheme: "dark",
  boxSizing: "border-box",
};

export function ReemploymentTracker({ config, setConfig, saveConfigNow }) {
  // Pre-fill target annual when not yet user-set.
  const defaultTargetAnnual = useMemo(() => {
    const rate  = config?.baseRate ?? 0;
    const hours = config?.maxWeeklyHours ?? config?.standardWeeklyHours ?? 40;
    return Math.round(rate * hours * 52);
  }, [config?.baseRate, config?.maxWeeklyHours, config?.standardWeeklyHours]);

  const targetAnnual = config?.targetIncomeAnnual ?? defaultTargetAnnual;

  // Rough weekly net using the same flat-rate sketch StepWrapUp uses — fine
  // for a target estimate; the actual figure once re-employed will run through
  // computeNet with full benefits/deductions.
  const targetWeeklyNet = useMemo(() => {
    const gross = targetAnnual / 52;
    const fed   = gross * (config?.fedRateLow   ?? 0);
    const state = gross * (config?.stateRateLow ?? 0);
    const fica  = gross * (config?.ficaRate     ?? 0.0765);
    const k401  = gross * (config?.k401Rate     ?? 0);
    return Math.max(0, gross - fed - state - fica - k401);
  }, [targetAnnual, config?.fedRateLow, config?.stateRateLow, config?.ficaRate, config?.k401Rate]);

  const [targetDraft, setTargetDraft] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ company: "", role: "", dateApplied: "", status: "applied" });
  const [editingId, setEditingId] = useState(null);

  const apps = useMemo(
    () => Array.isArray(config?.jobApplications) ? config.jobApplications : [],
    [config]
  );

  // Eager-save wrapper (docs/TODO.md "Persistence — Eager Save Pattern") — every
  // mutation below (target income, return-to-work date, application CRUD/status)
  // computes its next config synchronously and saves immediately, same shape as
  // BudgetPanel.jsx's applyExpenseUpdate. `updater` matches setState's own
  // functional-updater signature so every call site below only needed renaming.
  const applyConfigUpdate = (updater) => {
    const next = updater(config);
    setConfig(next);
    saveConfigNow?.(next);
  };

  const counts = useMemo(() => {
    let active = 0, offers = 0;
    for (const a of apps) {
      if (a.status === "applied" || a.status === "screening" || a.status === "interview") active += 1;
      else if (a.status === "offer") offers += 1;
    }
    return { active, offers };
  }, [apps]);

  function commitTarget() {
    const v = parseInt(targetDraft, 10);
    if (!Number.isFinite(v) || v <= 0) { setTargetDraft(""); return; }
    applyConfigUpdate(prev => ({ ...prev, targetIncomeAnnual: v }));
    setTargetDraft("");
  }

  function setReturnDate(iso) {
    applyConfigUpdate(prev => ({ ...prev, returnToWorkDate: iso || null }));
  }

  function saveDraft() {
    const company = draft.company.trim();
    const role    = draft.role.trim();
    if (!company || !role || !draft.dateApplied) return;
    const entry = {
      id: editingId ?? genId(),
      company, role,
      dateApplied: draft.dateApplied,
      status: draft.status || "applied",
    };
    applyConfigUpdate(prev => {
      const list = Array.isArray(prev.jobApplications) ? prev.jobApplications : [];
      const next = editingId
        ? list.map(a => (a.id === editingId ? entry : a))
        : [...list, entry];
      return { ...prev, jobApplications: next };
    });
    setDraft({ company: "", role: "", dateApplied: "", status: "applied" });
    setEditingId(null);
    setAddOpen(false);
  }

  function deleteApp(id) {
    applyConfigUpdate(prev => ({
      ...prev,
      jobApplications: (prev.jobApplications ?? []).filter(a => a.id !== id),
    }));
    if (editingId === id) {
      setEditingId(null);
      setAddOpen(false);
      setDraft({ company: "", role: "", dateApplied: "", status: "applied" });
    }
  }

  function startEdit(app) {
    setEditingId(app.id);
    setDraft({
      company: app.company, role: app.role,
      dateApplied: app.dateApplied, status: app.status,
    });
    setAddOpen(true);
  }

  function setAppStatus(id, status) {
    applyConfigUpdate(prev => ({
      ...prev,
      jobApplications: (prev.jobApplications ?? []).map(a => (
        a.id === id ? { ...a, status } : a
      )),
    }));
  }

  const cardStyle = {
    background: "var(--color-bg-raised)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: "10px",
    padding: "10px 12px",
  };

  return (
    <div style={{ marginTop: "16px" }}>
      <SH right={`${counts.active} active · ${counts.offers} ${counts.offers === 1 ? "offer" : "offers"}`}>
        Application Tracker
      </SH>

      {/* ── Target income ── */}
      <div style={{ ...cardStyle, marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div className="text-2xs" style={{ letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
              Target annual
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 700, color: "var(--color-text-primary)", marginTop: "2px" }}>
              ${targetAnnual.toLocaleString()}
            </div>
            <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "3px" }}>
              ≈ ${Math.round(targetWeeklyNet).toLocaleString()}/wk net at current tax config
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="number" min="0" step="500" inputMode="decimal"
              value={targetDraft}
              onChange={(e) => setTargetDraft(e.target.value)}
              placeholder={`${defaultTargetAnnual}`}
              style={{ ...inputStyle, width: "130px" }}
            />
            <Pressable
              onClick={commitTarget}
              disabled={targetDraft === ""}
              className="text-xs" style={{
                background: targetDraft === "" ? "var(--color-bg-surface)" : "var(--color-teal)",
                color: targetDraft === "" ? "var(--color-text-disabled)" : "var(--color-bg-base)",
                border: "none", borderRadius: "10px",
                padding: "8px 12px",
                letterSpacing: "1.5px", textTransform: "uppercase",
                fontWeight: 700, cursor: targetDraft === "" ? "not-allowed" : "pointer",
              }}
            >
              Set
            </Pressable>
            {config?.targetIncomeAnnual != null && (
              <Pressable
                onClick={() => applyConfigUpdate(prev => ({ ...prev, targetIncomeAnnual: null }))}
                className="text-2xs" style={{
                  background: "transparent",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "10px",
                  padding: "7px 10px",
                  letterSpacing: "1.5px", textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Reset
              </Pressable>
            )}
          </div>
        </div>
      </div>

      {/* ── Return-to-work date ── */}
      <div style={{ ...cardStyle, marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <div className="text-2xs" style={{ letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
              Expected return-to-work
            </div>
            <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "2px", maxWidth: "260px", lineHeight: 1.4 }}>
              Setting a date resumes projected income from that week — used by Income & Goals timelines.
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <input
              type="date"
              value={config?.returnToWorkDate ?? ""}
              onChange={(e) => setReturnDate(e.target.value)}
              style={{ ...inputStyle, width: "160px" }}
            />
            {config?.returnToWorkDate && (
              <Pressable
                onClick={() => setReturnDate(null)}
                className="text-2xs" style={{
                  background: "transparent",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "10px",
                  padding: "7px 10px",
                  letterSpacing: "1.5px", textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Clear
              </Pressable>
            )}
          </div>
        </div>
      </div>

      {/* ── Application log ── */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: apps.length > 0 || addOpen ? "10px" : "0" }}>
          <div className="text-2xs" style={{ letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-disabled)" }}>
            Applications ({apps.length})
          </div>
          {!addOpen && (
            <Pressable
              onClick={() => {
                setEditingId(null);
                setDraft({ company: "", role: "", dateApplied: new Date().toISOString().slice(0, 10), status: "applied" });
                setAddOpen(true);
              }}
              className="text-2xs" style={{
                background: "rgba(0,200,150,0.12)",
                color: "var(--color-teal)",
                border: "1px solid rgba(0,200,150,0.32)",
                borderRadius: "10px",
                padding: "6px 12px",
                letterSpacing: "1.5px", textTransform: "uppercase",
                fontWeight: 700, cursor: "pointer",
              }}
            >
              + Add
            </Pressable>
          )}
        </div>

        {/* Inline add/edit form */}
        {addOpen && (
          <div style={{
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "10px",
            padding: "12px",
            marginBottom: "10px",
            display: "flex", flexDirection: "column", gap: "10px",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <input
                placeholder="Company"
                value={draft.company}
                onChange={(e) => setDraft(d => ({ ...d, company: e.target.value }))}
                style={inputStyle}
              />
              <input
                placeholder="Role title"
                value={draft.role}
                onChange={(e) => setDraft(d => ({ ...d, role: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <input
                type="date"
                value={draft.dateApplied}
                onChange={(e) => setDraft(d => ({ ...d, dateApplied: e.target.value }))}
                style={inputStyle}
              />
              <select
                value={draft.status}
                onChange={(e) => setDraft(d => ({ ...d, status: e.target.value }))}
                style={inputStyle}
              >
                {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <Pressable
                onClick={() => {
                  setAddOpen(false);
                  setEditingId(null);
                  setDraft({ company: "", role: "", dateApplied: "", status: "applied" });
                }}
                className="text-xs" style={{
                  background: "var(--color-bg-raised)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "10px",
                  padding: "6px 12px",
                  letterSpacing: "1.5px", textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Cancel
              </Pressable>
              <Pressable
                onClick={saveDraft}
                disabled={!draft.company.trim() || !draft.role.trim() || !draft.dateApplied}
                className="text-xs" style={{
                  background: (!draft.company.trim() || !draft.role.trim() || !draft.dateApplied) ? "var(--color-bg-raised)" : "var(--color-teal)",
                  color: (!draft.company.trim() || !draft.role.trim() || !draft.dateApplied) ? "var(--color-text-disabled)" : "var(--color-bg-base)",
                  border: "none", borderRadius: "10px",
                  padding: "7px 14px",
                  letterSpacing: "1.5px", textTransform: "uppercase",
                  fontWeight: 700,
                  cursor: (!draft.company.trim() || !draft.role.trim() || !draft.dateApplied) ? "not-allowed" : "pointer",
                }}
              >
                {editingId ? "Save" : "Add"}
              </Pressable>
            </div>
          </div>
        )}

        {/* List */}
        {apps.length === 0 ? (
          !addOpen && (
            <div className="text-xs" style={{ color: "var(--color-text-disabled)", textAlign: "center", padding: "12px 0" }}>
              No applications logged yet.
            </div>
          )
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[...apps].sort((a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || "")).map(app => {
              const tone = toneFor(app.status);
              return (
                <div
                  key={app.id}
                  style={{
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border-subtle)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="text-base" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {app.company} <span style={{ color: "var(--color-text-secondary)", fontWeight: 400 }}>· {app.role}</span>
                    </div>
                    <div className="text-xs" style={{ color: "var(--color-text-disabled)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                      {app.dateApplied}
                    </div>
                  </div>
                  <select
                    value={app.status}
                    onChange={(e) => setAppStatus(app.id, e.target.value)}
                    className="text-xs"
                    style={{
                      background: TONE_BG[tone],
                      color: TONE_FG[tone],
                      border: `1px solid ${TONE_FG[tone]}`,
                      borderRadius: "8px",
                      padding: "5px 8px",
                      letterSpacing: "1px", textTransform: "uppercase",
                      fontWeight: 700, cursor: "pointer",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {STATUS_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: "4px" }}>
                    <Pressable
                      onClick={() => startEdit(app)}
                      aria-label="Edit"
                      style={{
                        background: "transparent",
                        color: "var(--color-text-secondary)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: "8px",
                        width: "26px", height: "26px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", padding: 0,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </Pressable>
                    <Pressable
                      onClick={() => deleteApp(app.id)}
                      aria-label="Delete"
                      style={{
                        background: "transparent",
                        color: "var(--color-deduction)",
                        border: "1px solid rgba(239,68,68,0.32)",
                        borderRadius: "8px",
                        width: "26px", height: "26px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", padding: 0,
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" /><path d="M10 11v6" /><path d="M14 11v6" />
                      </svg>
                    </Pressable>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
