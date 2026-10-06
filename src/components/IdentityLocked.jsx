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
