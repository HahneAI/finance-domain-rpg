import { UpgradeCard } from "./UpgradeCard.jsx";

// Which tab the user was actually trying to reach — a quiet acknowledgment
// that this is standing in for their real panel, not a generic wall.
const TAB_TAGLINES = {
  income: "Ready to get back to tracking your income?",
  log: "Ready to get back to logging your cashflow?",
};

// Full panel replacement for Income/Log once the trial + hidden grace
// window has expired (docs/TODO.md §17.E). Deliberately NOT a portal/overlay
// — it renders as ordinary panel content inside .main-content, same as
// HomePanel/BudgetPanel/etc., so the header, hamburger menu, and bottom nav
// all stay exactly as they are; only the panel body changes. No onClose —
// there's nothing to dismiss back to since the real panel isn't rendered
// underneath; the user keeps browsing by switching tabs (Home/Budget/Account
// stay reachable and read-only/editable respectively).
export function UpgradePanel({ tab } = {}) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
      <UpgradeCard tagline={TAB_TAGLINES[tab]} />
    </div>
  );
}
