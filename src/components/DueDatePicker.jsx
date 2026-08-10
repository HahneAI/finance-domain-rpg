import { Pressable, iS } from "./ui.jsx";
import { WEEK_OF_MONTH_OPTIONS } from "../lib/expense.js";

/**
 * DueDatePicker — quick "week of month" pills plus a manual date fallback.
 * Shared between NewJobSeasonEntry's payment-date step and NewJobSeasonBudgetPanel's
 * add-expense form so both stay in sync (TODO §1 expense due-date work) and
 * neither silently defaults a bill's due date to its creation date.
 *
 * `value`: { mode: "week" | "custom", week?: string, date?: string } | null
 * `onChange(next)` receives the same shape. `attempted` shows the red
 * "required" state once the user has tried to proceed without picking one.
 */
export function DueDatePicker({ value, onChange, attempted = false }) {
  const mode = value?.mode ?? null;
  const showError = attempted && !(mode === "week" ? value?.week : mode === "custom" && value?.date);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {WEEK_OF_MONTH_OPTIONS.map(opt => {
          const active = mode === "week" && value?.week === opt.value;
          return (
            <Pressable
              key={opt.value}
              onClick={() => onChange({ mode: "week", week: opt.value })}
              className="text-xs"
              style={{
                padding: "6px 10px", letterSpacing: "0.5px",
                background: active ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
                color: active ? "var(--color-teal)" : "var(--color-text-secondary)",
                border: `1px solid ${active ? "rgba(0,200,150,0.32)" : "var(--color-border-subtle)"}`,
                borderRadius: "8px", cursor: "pointer",
              }}
            >
              {active && "✓ "}{opt.label}
            </Pressable>
          );
        })}
        <Pressable
          onClick={() => onChange({ mode: "custom", date: value?.date ?? "" })}
          className="text-xs"
          style={{
            padding: "6px 10px", letterSpacing: "0.5px",
            background: mode === "custom" ? "rgba(0,200,150,0.10)" : "var(--color-bg-raised)",
            color: mode === "custom" ? "var(--color-teal)" : "var(--color-text-secondary)",
            border: `1px solid ${mode === "custom" ? "rgba(0,200,150,0.32)" : (showError ? "var(--color-deduction)" : "var(--color-border-subtle)")}`,
            borderRadius: "8px", cursor: "pointer",
          }}
        >
          {mode === "custom" && "✓ "}Custom date
        </Pressable>
      </div>

      {mode === "custom" && (
        <input
          type="date"
          value={value?.date ?? ""}
          onChange={(e) => onChange({ mode: "custom", date: e.target.value })}
          style={{ ...iS, marginTop: "8px", colorScheme: "dark", border: showError ? "1px solid var(--color-deduction)" : iS.border }}
        />
      )}

      {showError && (
        <div className="text-xs" style={{ marginTop: "6px", color: "var(--color-deduction)" }}>
          ↑ Pick a due date
        </div>
      )}
    </div>
  );
}
