import { Pressable } from "./ui.jsx";

// New service worker is installed and waiting (main.jsx's onNeedRefresh).
// Reload is user-initiated only — see vite.config.js registerType comment for why
// an automatic reload here previously reset the app mid-session.
//
// changelogEntry is optional — App.jsx only passes one when there's a real
// PUBLISHED, unseen entry (fetchLatestPublishedChangelog + a localStorage
// "last seen id" check). Deliberately NOT tied to the SW update signal alone:
// that fires on every deploy including trivial fixes, so a changelog prompt
// gated on it too would nag for releases with nothing user-facing to say.
// When there's nothing published for this release, this renders exactly the
// banner that existed before — no behavior change for the common case.
export function UpdateAvailableBanner({ onUpdate, onDismiss, changelogEntry, onShowChangelog }) {
  return (
    <div style={{
      background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)",
      borderRadius: "12px", padding: "10px 14px", marginBottom: "14px",
      display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-teal)", flexShrink: 0 }} />
      <div className="text-sm" style={{ flex: 1, minWidth: "180px", color: "var(--color-text-secondary)" }}>
        {changelogEntry
          ? <>A new version is ready — <strong style={{ color: "var(--color-text-primary)" }}>{changelogEntry.title}</strong>.</>
          : "A new version is ready — refresh when you're done editing."}
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {changelogEntry && (
          <Pressable
            onClick={onShowChangelog}
            className="text-xs" style={{ background: "transparent", color: "var(--color-teal)", border: "1px solid rgba(0,200,150,0.28)", borderRadius: "10px", padding: "6px 14px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
          >
            What's New
          </Pressable>
        )}
        <Pressable
          onClick={onUpdate}
          className="text-xs" style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", padding: "6px 14px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}
        >
          Refresh
        </Pressable>
        <Pressable
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-md" style={{ background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", padding: "2px 6px" }}
        >
          ✕
        </Pressable>
      </div>
    </div>
  );
}
