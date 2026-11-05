import { useState } from "react";
import { Pressable } from "./ui.jsx";

// "Ask Coach anything…" bar at the top of Home (TODO §32 D2). Sends the question straight into
// the chat through the same one-shot seed the "Ask Coach about this" buttons use (App.jsx
// openCoachAbout, A1) — Anthony's 2026-11-04 call: no suggestion step in between. Only mounted
// when the account can open Coach (HomePanel receives onAskCoach only then). Nothing is saved.
export function CoachAskBar({ onAsk }) {
  const [draft, setDraft] = useState("");
  const text = draft.trim();
  const submit = (e) => {
    e.preventDefault();
    if (!text) return;
    onAsk(text);
    setDraft("");
  };
  return (
    <form onSubmit={submit} role="search" aria-label="Ask Coach" style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ask Coach anything…"
        aria-label="Ask Coach anything"
        enterKeyHint="send"
        style={{
          flex: 1,
          minWidth: 0,
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          borderRadius: "12px",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-sans)",
          fontSize: "16px",
          padding: "12px 14px",
        }}
      />
      <Pressable
        type="submit"
        disabled={!text}
        className="text-xs"
        style={{
          background: text ? "var(--color-accent-primary)" : "var(--color-bg-raised)",
          border: "none",
          borderRadius: "12px",
          color: text ? "var(--color-bg-base)" : "var(--color-text-disabled)",
          letterSpacing: "1px",
          textTransform: "uppercase",
          fontWeight: 700,
          padding: "0 18px",
          minHeight: "44px",
          cursor: text ? "pointer" : "default",
        }}
      >
        Ask
      </Pressable>
    </form>
  );
}
