import { createPortal } from "react-dom";
import { UpgradeCard } from "./UpgradeCard.jsx";

// Dismissible overlay on top of read-only Home/Budget, which have real
// content behind them (docs/TODO.md §17.E). Income/Log use UpgradePanel
// instead — a full panel replacement with nothing behind it to overlay.
export function UpgradeModal({ onClose }) {
  return createPortal(
    <div
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, overflowY: "auto", padding: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <UpgradeCard onClose={onClose} />
    </div>,
    document.body,
  );
}
