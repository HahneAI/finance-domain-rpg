import { useState } from "react";
import { createPortal } from "react-dom";
import { getArchetype } from "../constants/goalArchetypes.js";
import { Pressable, useFoldTransition } from "./ui.jsx";

// Identity continuity UI (TODO §31). Two pieces:
//  • IdentityLockedBanner — sits at the top of the Goals page (and New Job
//    Season Home) so the chosen identity is the first thing read there. In
//    "tidy" mode (just switched identity) it asks the user to clean up the list;
//    Done dismisses it.
//  • IdentityChangeDialog — the small "are you sure" popup Profile → Identity
//    opens. Continue → pick the new identity FIRST; goals are tidied after.
// Presentation only: both read config.identity; neither writes anything.

const ghost = {
  flex: 1,
  padding: "9px 0",
  background: "var(--color-bg-raised)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: "8px",
  color: "var(--color-text-primary)",
  letterSpacing: "1.5px",
  textTransform: "uppercase",
  cursor: "pointer",
};
const solid = { ...ghost, background: "var(--color-teal)", border: "none", color: "var(--color-bg-base)", fontWeight: "bold" };

export function IdentityLockedBanner({ identity, tidy = false, onDone }) {
  const a = identity ? getArchetype(identity.archetypeId) : null;
  if (!a) return null;
  return (
    <div
      data-testid="identity-locked-banner"
      style={{
        marginBottom: "20px",
        padding: "14px 16px",
        borderRadius: "14px",
        background: "linear-gradient(180deg, rgba(0,200,150,0.08), rgba(0,200,150,0.02))",
        border: "1px solid var(--color-border-accent)",
        textAlign: "center",
      }}
    >
      <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)" }}>
        {tidy ? "New identity · tidy up your goals" : "Identity locked in"}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "0.02em", lineHeight: 1.15, fontSize: "22px", color: "var(--color-text-primary)", marginTop: "4px" }}>
        {a.name}
      </div>
      <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>
        {tidy
          ? "Your new goals are at the end of the list. Remove the ones that no longer fit, set numbers you can actually hit, and reorder what comes first."
          : `${a.hook} Every goal here is a step toward it.`}
      </div>
      {tidy && onDone && (
        <Pressable scale={0.97} className="text-2xs" style={{ ...solid, flex: "none", padding: "8px 16px", borderRadius: "12px", marginTop: "10px" }} onClick={onDone}>
          Done
        </Pressable>
      )}
    </div>
  );
}

export function IdentityChangeDialog({ open, identity, onContinue, onCancel }) {
  const fold = useFoldTransition(open, { ms: 340 });
  const a = identity ? getArchetype(identity.archetypeId) : null;
  if (!fold.mounted) return null;
  // Portaled to document.body — same reason as Profile's sign-out confirm:
  // position:fixed must resolve against the viewport, not a scrolling ancestor.
  return createPortal(
    <div role="dialog" aria-label="Change your identity" className="fold-backdrop" data-fold={fold.fold} style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="fold-modal" data-fold={fold.fold} style={{ width: "100%", maxWidth: "420px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontSize: "16px", fontFamily: "var(--font-display)", color: "var(--color-text-primary)" }}>Change your identity?</div>
        <div className="text-sm" style={{ color: "var(--color-text-primary)", lineHeight: "1.55" }}>
          {a ? `You're locked in as ${a.name}. ` : ""}
          You'll pick a new one, its starter goals get added to your list, then you'll tidy up — remove old goals, adjust the numbers, reorder. Nothing changes until you confirm your pick.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Pressable scale={0.97} className="text-xs" style={solid} onClick={onContinue}>Choose new identity</Pressable>
          <Pressable scale={0.97} className="text-xs" style={{ ...ghost, background: "transparent", border: "none", color: "var(--color-text-secondary)" }} onClick={onCancel}>Cancel</Pressable>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Identity-first Home hero (TODO §31 Phase 3). Replaces the plain banner on the
// employed Goals page once an identity is chosen. Every figure is passed in from
// values HomePanel already shows — `claimed/total` are the "Goals x/y" tile's own
// numbers and `next` is the Next Claim Date hero's own goal/date (F177) — so the
// hero is a second VIEW of those numbers, never a second derivation. No streaks.
export function IdentityHero({ identity, claimed = 0, total = 0, next = null }) {
  const a = identity ? getArchetype(identity.archetypeId) : null;
  if (!a) return null;
  const pct = total > 0 ? Math.min(100, Math.round((claimed / total) * 100)) : 0;
  return (
    <div
      data-testid="identity-hero"
      style={{
        marginBottom: "20px",
        padding: "18px 18px 16px",
        borderRadius: "18px",
        background: "linear-gradient(180deg, rgba(0,200,150,0.10), rgba(0,200,150,0.02))",
        border: "1px solid var(--color-border-accent)",
        textAlign: "center",
      }}
    >
      <div className="text-2xs" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-teal)" }}>
        Identity locked in
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, letterSpacing: "0.04em", lineHeight: 1.15, fontSize: "30px", color: "var(--color-text-primary)", marginTop: "4px" }}>
        {a.name}
      </div>
      <div className="text-sm" style={{ color: "var(--color-text-secondary)", marginTop: "4px" }}>{a.hook}</div>
      {total > 0 && (
        <div style={{ marginTop: "14px" }}>
          <div className="text-sm" data-testid="identity-hero-count" style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>
            {claimed} of {total} goal{total === 1 ? "" : "s"} claimed
          </div>
          <div aria-hidden="true" style={{ height: "6px", background: "var(--color-bg-raised)", borderRadius: "3px", overflow: "hidden", margin: "6px auto 0", maxWidth: "260px" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-teal)", borderRadius: "3px" }} />
          </div>
        </div>
      )}
      {next && (
        <div className="text-xs" data-testid="identity-hero-next" style={{ color: "var(--color-text-secondary)", marginTop: "10px" }}>
          Next: <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{next.label}</span> · {next.date}
        </div>
      )}
    </div>
  );
}

// "Your numbers" (TODO §31 Phase 3): the money tiles, collapsed by default every
// load, behind a one-line summary that is ALWAYS visible. The summary values are
// passed in from the same expressions the tiles use (Left This Week tile value,
// Net Worth Trend's savings rate) — a view, not new math. A negative week renders
// red on the summary line so collapsing never hides a bad week. Children mount
// only when open, so tile countups/entrance stagger play on open, not off-screen.
export function YourNumbers({ leftLabel, leftValue, savingsPct, fmt, children }) {
  const [open, setOpen] = useState(false);
  const negative = Number.isFinite(leftValue) && leftValue < 0;
  return (
    <section data-testid="your-numbers" style={{ marginBottom: "20px" }}>
      <Pressable
        scale={0.97}
        aria-expanded={open}
        aria-controls="your-numbers-body"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "14px",
          padding: "14px 16px",
          cursor: "pointer",
          color: "var(--color-text-primary)",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: open ? "16px" : 0,
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="text-2xs" style={{ display: "block", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-text-secondary)" }}>Your numbers</span>
          <span className="text-base" data-testid="your-numbers-summary" style={{ display: "block", marginTop: "4px" }}>
            {leftLabel}{" "}
            <span data-testid="your-numbers-left" style={{ fontWeight: 700, color: negative ? "var(--color-red)" : "var(--color-green)" }}>{fmt(leftValue)}</span>
            {Number.isFinite(savingsPct) && <> · Saving <span style={{ fontWeight: 700 }}>{savingsPct}%</span></>}
          </span>
        </span>
        <span aria-hidden="true" className="text-md" style={{ color: "var(--color-text-secondary)", transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}>⌄</span>
      </Pressable>
      {open && <div id="your-numbers-body">{children}</div>}
    </section>
  );
}
