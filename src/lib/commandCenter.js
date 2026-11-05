// Command center — "Needs you" queue (TODO §32 D1). Pure ranking over signals Home already
// computes; the cards themselves still decide their own visibility (a dismissed card renders
// nothing), so this only fixes the ORDER, never the content. Every input traces to its own
// single source: the Net Worth tier to resolveNetWorthSignalTier() (F24), bills due today to
// getBillsDueOn() (§20.C), Claim Date slips to detectClaimDateSlips() (F187 / F177).

// Lower = higher on the page. A Net Worth Red/Amber is the one item about the whole budget, so
// it leads; a Green (recovery) note is good news and goes last.
export const NEEDS_YOU_RANK = {
  netWorthAlert: 1,
  dueToday: 2,
  claimSlips: 3,
  netWorthRecovery: 9,
};

/**
 * @param {{ netWorthTier?: "red"|"amber"|"green"|null, dueTodayCount?: number, claimSlipCount?: number }} signals
 * @returns {string[]} keys of NEEDS_YOU_RANK for the items that have something to show, highest first
 */
export function rankNeedsYou({ netWorthTier = null, dueTodayCount = 0, claimSlipCount = 0 } = {}) {
  const items = [];
  if (netWorthTier === "red" || netWorthTier === "amber") items.push("netWorthAlert");
  if (netWorthTier === "green") items.push("netWorthRecovery");
  if (dueTodayCount > 0) items.push("dueToday");
  if (claimSlipCount > 0) items.push("claimSlips");
  return items.sort((a, b) => NEEDS_YOU_RANK[a] - NEEDS_YOU_RANK[b]);
}
