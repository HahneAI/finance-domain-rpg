import { useState } from "react";
import { Pressable } from "./ui.jsx";
import { DueDatePicker } from "./DueDatePicker.jsx";
import { getNextDueDate, resolveDueDateAnchor } from "../lib/expense.js";

/**
 * ExpenseDueDateField — the OPTIONAL due-date control in Budget's expense
 * detail sheet (TODO §20.A, shotgun 2026-10-01). Writes the existing
 * `dueDateAnchor` field (already read by getNextDueDate and the New Job Season
 * flow) — no new schema, no migration, and an expense with no anchor behaves
 * exactly as before. Same picker NewJobSeasonEntry uses, so the two entry
 * points can't drift. `onSave(anchorIso | null)`; null clears it.
 */
export function ExpenseDueDateField({ expense, referenceIso, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(null);
  const [attempted, setAttempted] = useState(false);

  const next = expense?.dueDateAnchor && referenceIso ? getNextDueDate(expense, new Date(`${referenceIso}T12:00:00`)) : null;
  const label = next
    ? next.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const save = () => {
    const anchor = resolveDueDateAnchor(value, referenceIso);
    if (!anchor) { setAttempted(true); return; }
    onSave(anchor);
    setEditing(false); setValue(null); setAttempted(false);
  };

  return (
    <div style={{ marginBottom: "20px" }}>
      <div className="text-2xs" style={{ color: "var(--color-text-secondary)", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" }}>
        Due date <span style={{ color: "var(--color-text-disabled)" }}>(optional)</span>
      </div>
      {!editing ? (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="text-base" style={{ flex: 1, color: label ? "var(--color-text-primary)" : "var(--color-text-disabled)" }}>
            {label ? `Next due ${label}` : "Not set"}
          </div>
          <Pressable onClick={() => setEditing(true)} aria-label={label ? "Change due date" : "Set due date"} className="text-xs" style={{ padding: "7px 12px", background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", color: "var(--color-text-primary)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>
            {label ? "Change" : "Set"}
          </Pressable>
          {label && (
            <Pressable onClick={() => onSave(null)} aria-label="Clear due date" className="text-xs" style={{ padding: "7px 12px", background: "transparent", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", color: "var(--color-text-secondary)", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>
              Clear
            </Pressable>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <DueDatePicker value={value} onChange={setValue} attempted={attempted} />
          <div style={{ display: "flex", gap: "8px" }}>
            <Pressable onClick={save} aria-label="Save due date" className="text-xs" style={{ flex: 1, padding: "9px", background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}>Save</Pressable>
            <Pressable onClick={() => { setEditing(false); setValue(null); setAttempted(false); }} className="text-xs" style={{ padding: "9px 14px", background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}>Cancel</Pressable>
          </div>
        </div>
      )}
    </div>
  );
}
