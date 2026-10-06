import { useState } from "react";
import { ARCHETYPES, getArchetype } from "../constants/goalArchetypes.js";
import { resolveTemplateGoals, isStretchDate } from "../lib/goalArchetypes.js";
import { Pressable, iS } from "./ui.jsx";

// Identity picker (TODO §31). Step 1: choose ONE archetype. Step 2: preview the
// 3–5 starter goals it would seed — toggle any off, edit any target, see the
// Claim Date each would land on — then confirm. Nothing is written until
// confirm; the parent commits through one eager save (App.handleApplyArchetype).
//
// Dates are NOT computed here: `projectGoals(candidates)` is HomePanel's
// computeClaimDates() with the candidates appended after the user's real
// goals, so every previewed date is the same derivation the goal cards use
// (warden §8 F177 — never a second estimate).

const cardStyle = {
  background: "var(--color-bg-surface)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: "12px",
  padding: "14px 16px",
  textAlign: "left",
  color: "var(--color-text-primary)",
  cursor: "pointer",
  width: "100%",
};

const primaryBtn = {
  background: "var(--color-teal)",
  color: "var(--color-bg-base)",
  border: "none",
  borderRadius: "12px",
  padding: "8px 16px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "1px",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};

const ghostBtn = {
  background: "var(--color-bg-raised)",
  color: "var(--color-text-secondary)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: "12px",
  padding: "7px 14px",
  textTransform: "uppercase",
  letterSpacing: "1px",
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
};

function dateLabel(info) {
  if (!info) return "Date pending";
  if (info.stalemate) return "No date at current pace";
  return info.text ?? (info.finishDate ? "Beyond the horizon" : "Date pending");
}

export function ArchetypePicker({
  avgWeeklySpend = 0,
  existingGoals = [],
  today,
  projectGoals,
  onApply,
  onSkip,
  // New Job Season (no income): Claim Dates are paused, so there is nothing
  // honest to preview — rows say when they start instead of showing a date.
  datesPaused = false,
  title = "Who are you becoming?",
  subtitle = "Pick one. We'll start you with a few goals to make it real — change any of them.",
}) {
  "use no memo";
  const [archetypeId, setArchetypeId] = useState(null);
  // drafts[templateKey] = { on, targetStr } — string draft, parsed at commit
  // (Numeric Input Standard: never coerce on change).
  const [drafts, setDrafts] = useState({});

  const archetype = getArchetype(archetypeId);
  const templates = archetype ? resolveTemplateGoals(archetype, { avgWeeklySpend, existingGoals }) : [];

  const choose = (id) => {
    const next = {};
    for (const t of resolveTemplateGoals(id, { avgWeeklySpend, existingGoals })) {
      next[t.templateKey] = { on: true, targetStr: String(t.target) };
    }
    setDrafts(next);
    setArchetypeId(id);
  };

  const back = () => { setArchetypeId(null); setDrafts({}); };

  const patch = (key, p) => setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...p } }));

  // Read a draft as a goal. Targets parse here (at render, from the string) —
  // an empty/invalid field yields 0 and is dropped, never seeded as $0.
  const rows = templates.map((t) => {
    const d = drafts[t.templateKey] ?? { on: true, targetStr: String(t.target) };
    const target = parseFloat(d.targetStr);
    return { ...t, on: d.on, targetStr: d.targetStr, target: Number.isFinite(target) && target > 0 ? target : 0 };
  });
  const selected = rows.filter((r) => r.on && r.target > 0);

  const infoByKey = (() => {
    if (!archetype || !projectGoals || datesPaused || selected.length === 0) return {};
    return projectGoals(selected.map(({ templateKey, label, target, note }) => ({ templateKey, label, target, note })));
  })();

  const confirm = () => {
    if (selected.length === 0) return;
    onApply?.({
      archetypeId,
      selected: selected.map(({ templateKey, label, note, target }) => ({ templateKey, label, note, target })),
    });
  };

  if (!archetype) {
    return (
      <section data-testid="archetype-picker" style={{ marginBottom: "20px" }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1.15, fontSize: "28px", color: "var(--color-accent-primary)" }}>
            {title}
          </div>
          <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "6px" }}>
            {subtitle}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {ARCHETYPES.map((a) => (
            <Pressable key={a.id} scale={0.97} style={cardStyle} onClick={() => choose(a.id)}>
              <div className="text-md" style={{ fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "0.02em" }}>{a.name}</div>
              <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>{a.hook}</div>
            </Pressable>
          ))}
        </div>
        {onSkip && (
          <div style={{ textAlign: "center", marginTop: "12px" }}>
            <Pressable scale={0.97} className="text-xs" style={{ ...ghostBtn, border: "none", background: "transparent" }} onClick={onSkip}>
              Not now
            </Pressable>
          </div>
        )}
      </section>
    );
  }

  return (
    <section data-testid="archetype-preview" style={{ marginBottom: "20px" }}>
      <div style={{ textAlign: "center", marginBottom: "14px" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1.15, fontSize: "28px", color: "var(--color-accent-primary)" }}>
          {archetype.name}
        </div>
        <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "6px" }}>
          {archetype.hook} Keep what fits, edit the amounts, drop the rest.
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm" style={{ color: "var(--color-text-secondary)", textAlign: "center", marginBottom: "12px" }}>
          You already have every starter goal for this one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {rows.map((r) => {
            const info = infoByKey[r.templateKey];
            const stretch = r.on && r.target > 0 && isStretchDate(info?.finishDate, today ?? new Date().toISOString().slice(0, 10));
            return (
              <div key={r.templateKey} data-testid={`archetype-row-${r.templateKey}`} style={{ ...cardStyle, cursor: "default", opacity: r.on ? 1 : 0.55 }}>
                <label style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    checked={r.on}
                    aria-label={`Include ${r.label}`}
                    onChange={(e) => patch(r.templateKey, { on: e.target.checked })}
                    style={{ marginTop: "3px", accentColor: "var(--color-teal)" }}
                  />
                  <span style={{ flex: 1 }}>
                    <span className="text-base" style={{ display: "block", fontWeight: 700 }}>{r.label}</span>
                    <span className="text-xs" style={{ display: "block", color: "var(--color-text-secondary)" }}>{r.note}</span>
                  </span>
                </label>
                {r.on && (
                  <div style={{ display: "flex", gap: "12px", alignItems: "center", marginTop: "10px" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`Target for ${r.label}`}
                      value={r.targetStr}
                      onChange={(e) => patch(r.templateKey, { targetStr: e.target.value })}
                      style={{ ...iS, width: "110px" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div className="text-2xs" style={{ color: "var(--color-text-disabled)", letterSpacing: "2px", textTransform: "uppercase" }}>Claim Date</div>
                      <div className="text-sm" style={{ color: stretch ? "var(--color-warning)" : "var(--color-text-primary)", fontWeight: 600 }}>
                        {r.target <= 0 ? "Enter an amount" : datesPaused ? "Starts with your first paycheck" : dateLabel(info)}{stretch ? " · stretch" : ""}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "16px" }}>
        <Pressable scale={0.97} className="text-2xs" style={ghostBtn} onClick={back}>Back</Pressable>
        <Pressable
          scale={0.97}
          className="text-2xs"
          disabled={selected.length === 0}
          style={{ ...primaryBtn, opacity: selected.length === 0 ? 0.5 : 1 }}
          onClick={confirm}
        >
          {selected.length === 0 ? "Pick at least one" : `Add ${selected.length} goal${selected.length === 1 ? "" : "s"}`}
        </Pressable>
      </div>
    </section>
  );
}
