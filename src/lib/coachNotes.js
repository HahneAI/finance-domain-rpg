// Coach panel notes (TODO §32 A4, decided 2026-10-30: fixed templates, no model call). One sentence
// or two at the top of a panel, in Coach's voice, filled ONLY with figures the panel already shows —
// each function takes the exact value its tile renders, so a note can't disagree with the screen
// (warden F113). Pure: no React, no dates computed here. At most one light corner-man phrase, per
// the persona; none when the news is a problem.

const usd = (n) => Math.round(Math.abs(n)).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// Home. leftThisCheck / nextCheck / avgCheck are the per-check values the "Left This Week|Check" and
// "Next Week Takehome|Next Paycheck|Next Check" tiles display; spendRatio is Upkeep Health's.
export function homeCoachNote({ leftThisCheck, nextCheck = null, avgCheck, unit = "week", spendRatio }) {
  if (!Number.isFinite(leftThisCheck) || !(avgCheck > 0)) return null;
  if (leftThisCheck < 0) {
    return `This ${unit} runs ${usd(leftThisCheck)} short of your average spend. Upkeep is where that gets fixed.`;
  }
  if (spendRatio >= 0.75) {
    return `Bills are taking ${Math.round(spendRatio * 100)}% of your take-home. That's the number to bring down, starting in Upkeep.`;
  }
  if (nextCheck != null && nextCheck >= avgCheck * 1.03) {
    return `${usd(leftThisCheck)} free this ${unit}, and your next check runs ${usd(nextCheck - avgCheck)} above average. A good round to point extra at your first goal.`;
  }
  if (nextCheck != null && nextCheck < avgCheck * 0.95) {
    return `${usd(leftThisCheck)} free this ${unit}, but your next check comes in ${usd(avgCheck - nextCheck)} under average. Keep this ${unit}'s spending tight.`;
  }
  return `${usd(leftThisCheck)} free this ${unit}, and your next check is on pace. Steady round.`;
}

// Upkeep. spendRatio + band from lib/upkeepHealth.js — the same pair Home's tile uses.
export function upkeepCoachNote({ spendRatio, band, hasExpenses = true }) {
  if (!hasExpenses) return "No bills tracked yet. Add your rent first — every number on Home starts here.";
  if (!Number.isFinite(spendRatio) || spendRatio <= 0) return null;
  const pct = Math.round(spendRatio * 100);
  if (band === "watch spend") return `Upkeep is taking ${pct}% of your take-home. Start with your largest Needs line — that's where the room is.`;
  if (band === "healthy range") return `Upkeep is taking ${pct}% of your take-home, a healthy range. Any bill you trim goes straight to your goals.`;
  return `Upkeep is taking ${pct}% of your take-home. Well-managed — your corner has room to fund goals.`;
}

// Log. netLost / netGained are App's logTotals (the "Cash Left Behind" tile's figure and its gain side).
export function logCoachNote({ entryCount, netLost = 0, netGained = 0 }) {
  if (!entryCount) return "Nothing logged yet. When a missed shift, bonus or PTO day changes a check, log it here so your Claim Dates stay true.";
  const net = netGained - netLost;
  if (Math.abs(net) < 1) return `Your ${entryCount} logged ${entryCount === 1 ? "entry nets" : "entries net"} out to about even on take-home.`;
  return net > 0
    ? `Your ${entryCount} logged ${entryCount === 1 ? "entry adds" : "entries add"} ${usd(net)} to take-home this year.`
    : `Your ${entryCount} logged ${entryCount === 1 ? "entry costs" : "entries cost"} ${usd(net)} in take-home this year. Missed shifts are the bigger side.`;
}
