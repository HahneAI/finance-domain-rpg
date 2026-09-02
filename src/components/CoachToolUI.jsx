import { Pressable } from "./ui.jsx";

// UI for Coach's action tools (src/lib/coachTools.js). Both pieces here are
// driven by TOOL CALLS, never by parsing Coach's prose: COACH_PERSONA_PROMPT
// forbids Markdown outright ("no asterisks, underscores, bullet points"), so
// there is no link syntax in the text to parse even in principle. The model
// asks for a chip by calling navigate_to; the panel renders it.

// What each tool is doing, in the user's language rather than the tool's.
// Deliberately a plain map with a generic fallback — a tool added without a
// label here still shows something sensible instead of leaking its snake_case
// name into the UI.
export const TOOL_ACTIVITY_LABELS = {
  get_goal_detail: "Checking your goal timeline",
  get_expense_detail: "Looking up that expense",
  get_week_breakdown: "Pulling your paycheck breakdown",
  list_log_entries: "Reading your log",
  navigate_to: "Finding the right panel",
  simulate_expense_change: "Running the numbers on that change",
  simulate_new_goal: "Working out what a new goal would cost",
  simulate_overtime_hours: "Working out what those hours are worth",
  simulate_without_logged_event: "Comparing against a version without it",
};

/**
 * The line shown while a tool round is in flight. Without it the bubble sits on
 * a bare "…" through a full extra round-trip with no sign anything is happening
 * — and a simulation round can take several seconds.
 *
 * No spinner: the app's animation rules rule out spin outright, so this is an
 * opacity breathe on the dot only, well inside the 500ms per-step ceiling.
 */
export function CoachToolActivity({ toolName }) {
  if (!toolName) return null;
  const label = TOOL_ACTIVITY_LABELS[toolName] ?? "Checking your numbers";
  return (
    <div
      className="text-xs"
      role="status"
      aria-live="polite"
      style={{
        display: "flex", alignItems: "center", gap: "7px",
        color: "var(--color-text-secondary)",
        padding: "2px 4px 0",
        fontFamily: "var(--font-sans)",
        letterSpacing: "0.3px",
      }}
    >
      <span className="coach-tool-dot" style={{
        width: "6px", height: "6px", borderRadius: "50%",
        background: "var(--color-teal)", flexShrink: 0,
      }} />
      {label}…
    </div>
  );
}

/**
 * The tappable result of a navigate_to call — Coach's closing action, made
 * clickable instead of only described.
 *
 * `chip.focusRef` is already validated against real account data by
 * toolNavigateTo, so this never renders a link to something that doesn't exist.
 * With no onNavigate the chip renders disabled rather than vanishing, so the
 * absence of a handler is visible in development instead of silent.
 */
export function CoachNavChip({ chip, onNavigate }) {
  if (!chip?.viewKey) return null;
  const disabled = typeof onNavigate !== "function";
  return (
    <Pressable
      disabled={disabled}
      onClick={disabled ? undefined : () => onNavigate(chip.viewKey, chip.focusRef ?? null)}
      aria-label={`${chip.linkLabel} — open this panel`}
      className="text-sm"
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        marginTop: "8px",
        padding: "8px 14px",
        borderRadius: "12px",
        background: "var(--color-bg-raised)",
        border: "1px solid var(--color-border-accent)",
        color: disabled ? "var(--color-text-disabled)" : "var(--color-teal)",
        fontFamily: "var(--font-sans)",
        fontWeight: 600,
        letterSpacing: "0.3px",
        cursor: disabled ? "default" : "pointer",
        maxWidth: "100%",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {chip.linkLabel}
      </span>
      {/* Arrow, not a chevron — this leaves the chat rather than expanding
          something in place, and the two should not read the same. */}
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M6 3 L11 8 L6 13" />
      </svg>
    </Pressable>
  );
}
