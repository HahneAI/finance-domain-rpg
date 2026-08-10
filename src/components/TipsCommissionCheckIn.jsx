import { useState } from "react";
import { Pressable } from "./ui.jsx";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ordinalSuffix = d => {
  const v = d % 100;
  return (v >= 11 && v <= 13) ? "th" : (["th", "st", "nd", "rd"][d % 10] ?? "th");
};

// A small, dismissible daily check-in card — a skin over the same "log gained
// money" mechanism as the bonus event type (App.jsx wires onLog into a
// tips_commission log entry). Deliberately NOT a full-screen modal: the daily
// cadence of this prompt would make that treatment intrusive.
//
// dateIso: "YYYY-MM-DD" of the day being asked about.
// isYesterday: true when dateIso is exactly effectiveToday - 1 day — drives the
// "yesterday" phrasing; older backlog days spell out the weekday + date instead.
export function TipsCommissionCheckIn({ label, dateIso, isYesterday, onLog, onSkip }) {
  const [showAmount, setShowAmount] = useState(false);
  const [amount, setAmount] = useState("");

  const [y, m, d] = dateIso.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayLabel = isYesterday
    ? "yesterday"
    : `${WEEKDAY_NAMES[dateObj.getDay()]}, the ${d}${ordinalSuffix(d)}`;

  function reset() {
    setShowAmount(false);
    setAmount("");
  }

  function handleNo() {
    onLog(0);
    reset();
  }

  function handleSaveAmount() {
    const n = parseFloat(amount);
    onLog(Number.isFinite(n) && n > 0 ? n : 0);
    reset();
  }

  function handleSkip() {
    onSkip();
    reset();
  }

  return (
    <div style={{
      background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)",
      borderRadius: "12px", padding: "12px 14px", marginBottom: "14px",
      display: "flex", flexDirection: "column", gap: "10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--color-green)", flexShrink: 0 }} />
        <div className="text-sm" style={{ flex: 1, color: "var(--color-text-primary)" }}>
          Did you make any {label} {dayLabel}?
        </div>
        <Pressable
          onClick={handleSkip}
          aria-label="Skip"
          className="text-md" style={{ background: "transparent", color: "var(--color-text-secondary)", border: "none", cursor: "pointer", padding: "2px 6px" }}
        >
          ✕
        </Pressable>
      </div>

      {!showAmount ? (
        <div style={{ display: "flex", gap: "8px" }}>
          <Pressable
            onClick={() => setShowAmount(true)}
            className="text-xs" style={{ flex: 1, background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", padding: "8px 0", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
          >
            Yes
          </Pressable>
          <Pressable
            onClick={handleNo}
            className="text-xs" style={{ flex: 1, background: "var(--color-bg-raised)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "8px 0", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer" }}
          >
            No
          </Pressable>
        </div>
      ) : (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            type="number" min="0" step="0.01" autoFocus placeholder="Amount ($)"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="text-base" style={{ flex: 1, background: "var(--color-bg-raised)", border: "1px solid var(--color-border-subtle)", borderRadius: "10px", padding: "8px 10px", color: "var(--color-text-primary)", fontFamily: "var(--font-sans)" }}
          />
          <Pressable
            onClick={handleSaveAmount}
            className="text-xs" style={{ background: "var(--color-green)", color: "var(--color-bg-base)", border: "none", borderRadius: "10px", padding: "8px 16px", letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer" }}
          >
            Save
          </Pressable>
        </div>
      )}
    </div>
  );
}
