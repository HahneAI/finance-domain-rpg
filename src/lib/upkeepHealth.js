// Upkeep Health — one formula, one set of bands (2026-10-30, TODO §32 A4). Home's "Upkeep Health"
// tile, Coach's context line and the Coach panel notes all read these, so the three can never show
// different ratios for the same week (warden F113: a context/notes figure must match its tile).

export function spendRatioOf(avgWeeklySpend, weeklyIncome) {
  return weeklyIncome > 0 ? avgWeeklySpend / weeklyIncome : 0;
}

export function upkeepHealthBand(spendRatio) {
  return spendRatio < 0.5 ? "well-managed" : spendRatio < 0.75 ? "healthy range" : "watch spend";
}
