import { useState } from "react";

/**
 * NumberKeypad — custom full-width large-key numeric overlay.
 *
 * Slides up from the bottom (above any open BottomSheet) when visible.
 * Prevents the native iOS keyboard from appearing on dollar/number fields.
 *
 * Props:
 *   visible   {boolean}   controls slide-up visibility
 *   value     {string}    current numeric string (e.g. "123.45")
 *   onChange  {function}  called with new string on every key press
 *   onClose   {function}  called when user taps DONE
 *
 * Key layout:
 *   1  2  3
 *   4  5  6
 *   7  8  9
 *   .  0  ⌫
 */

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "⌫"],
];

/**
 * NumDisplay — a tap-target that looks like an input but opens the keypad.
 *
 * Use this instead of <input type="number"> inside BottomSheets so iOS
 * never invokes its native keyboard and never triggers the 16px zoom bug.
 *
 * Props:
 *   value     {string}    display value
 *   onPress   {function}  called on click/tap
 *   active    {boolean}   true when this field's keypad is open (gold border)
 *   prefix    {string}    optional prefix (e.g. "$")
 *   style     {object}    merged into the outer div style
 */
export function NumDisplay({ value, onPress, active, prefix = "$", style = {} }) {
  return (
    <div
      onClick={onPress}
      style={{
        background: "#111",
        border: `1px solid ${active ? "#c8a84b" : "#333"}`,
        borderRadius: "3px",
        padding: "10px 12px",
        fontSize: "16px",
        color: value && value !== "0" ? "#e8e0d0" : "#555",
        fontFamily: "'Courier New',monospace",
        cursor: "pointer",
        minHeight: "44px",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        userSelect: "none",
        WebkitUserSelect: "none",
        ...style,
      }}
    >
      {prefix && (
        <span style={{ color: "#666", fontSize: "14px" }}>{prefix}</span>
      )}
      <span>{value || "0"}</span>
    </div>
  );
}

export function NumberKeypad({ visible, value, onChange, onClose }) {
  const [pressed, setPressed] = useState(null);

  const handleKey = (key) => {
    if (key === "⌫") {
      onChange(value.slice(0, -1) || "");
    } else if (key === ".") {
      if (!value.includes(".")) onChange((value || "0") + ".");
    } else {
      // Prevent leading zero when adding a digit before any decimal
      const newVal =
        value === "0" && key !== "."
          ? key
          : (value || "") + key;
      if (newVal.replace(".", "").length > 9) return; // max 9 significant digits
      onChange(newVal);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 300,
        background: "#141414",
        borderTop: "1px solid #2a2a2a",
        borderRadius: "12px 12px 0 0",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        transform: visible ? "translateY(0)" : "translateY(100%)",
        transition: "transform 280ms ease",
        userSelect: "none",
        WebkitUserSelect: "none",
        willChange: "transform",
      }}
    >
      {/* Value display bar + DONE button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px 10px",
          borderBottom: "1px solid #1e1e1e",
        }}
      >
        <div
          style={{
            fontSize: "30px",
            fontWeight: "bold",
            color: "#c8a84b",
            fontFamily: "'Courier New',monospace",
            letterSpacing: "1px",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          ${value || "0"}
        </div>
        <button
          onPointerDown={onClose}
          style={{
            background: "#c8a84b",
            color: "#0d0d0d",
            border: "none",
            borderRadius: "6px",
            padding: "10px 24px",
            fontSize: "11px",
            letterSpacing: "2px",
            textTransform: "uppercase",
            fontFamily: "'Courier New',monospace",
            fontWeight: "bold",
            cursor: "pointer",
            minHeight: "44px",
            minWidth: "80px",
            flexShrink: 0,
            marginLeft: "12px",
          }}
        >
          DONE
        </button>
      </div>

      {/* Key grid */}
      <div style={{ padding: "8px 8px 4px" }}>
        {ROWS.map((row, ri) => (
          <div
            key={ri}
            style={{
              display: "flex",
              gap: "6px",
              marginBottom: ri < ROWS.length - 1 ? "6px" : 0,
            }}
          >
            {row.map((key) => {
              const isPressed = pressed === key;
              return (
                <button
                  key={key}
                  onPointerDown={() => {
                    setPressed(key);
                    handleKey(key);
                  }}
                  onPointerUp={() => setPressed(null)}
                  onPointerLeave={() => setPressed(null)}
                  style={{
                    flex: 1,
                    height: "58px",
                    background: isPressed ? "#2e2e2e" : "#212121",
                    border: "1px solid #2a2a2a",
                    borderRadius: "8px",
                    color:
                      key === "⌫"
                        ? "#e8856a"
                        : key === "."
                        ? "#c8a84b"
                        : "#e8e0d0",
                    fontSize: key === "⌫" ? "20px" : "24px",
                    fontFamily: "'Courier New',monospace",
                    cursor: "pointer",
                    transform: isPressed ? "scale(0.95)" : "scale(1)",
                    transition: "transform 80ms ease, background 80ms ease",
                    minWidth: "44px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
