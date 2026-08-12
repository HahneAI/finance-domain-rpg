// ─────────────────────────────────────────────────────────────
// CONFIG HISTORY — TODO §3 phase 1 (write path)
//
// The v1 historically-sensitive field whitelist and the diff that decides
// whether a config transition earns an account_history snapshot. Everything
// NOT listed here (UI prefs, dismissal state, goalTimelineEpochIdx, investor
// display fields, wizard gate flags) is noise and must never trigger a row.
//
// Future fields with no schema yet (employer name, §1.C triage stances,
// §4 taxedWeeksFed/State) are parked in the commented-out block in
// docs/TODO.md §3.D2 — add them here when they exist in DEFAULT_CONFIG.
// ─────────────────────────────────────────────────────────────

export const HISTORY_SENSITIVE_FIELDS = [
  // Pay structure
  "baseRate", "annualSalary", "shiftHours", "diffRate", "nightDiffRate",
  "nightDiffEnabled", "otThreshold", "otMultiplier", "commissionMonthly",
  "tipsOrCommissionEnabled", "tipsOrCommissionLabel", "tipsCommissionOnlyPosition",
  // Schedule
  "maxWeeklyHours", "customWeeklyHours", "customWeeklyHoursLong",
  "customWeeklyHoursShort", "scheduleIsVariable", "userPaySchedule",
  "payPeriodEndDay", "biweeklyPayWeekParity", "startDate", "firstActiveIdx",
  // Employer identity — a DHL↔base flip swaps the entire buildYear branch
  "employerPreset", "dhlSite", "startingWeekIsLong", "dhlTeam", "dhlOtOnWeekend",
  "dhlCustomSchedule", "dhlNightShift",
  // Tax
  "fedRateLow", "fedRateHigh", "stateRateLow", "stateRateHigh",
  "taxRatesEstimated", "ficaRate", "fedStdDeduction", "filingStatus",
  "userState", "targetOwedAtFiling", "taxedWeeks", "taxExemptOptIn",
  // Deductions / benefits
  "selectedBenefits", "healthPremium", "dentalPremium", "visionPremium",
  "ltd", "stdWeekly", "lifePremium", "hsaWeekly", "fsaWeekly",
  "otherDeductions", "k401Rate", "k401MatchRate", "k401StartDate",
  "benefitsStartDate",
  // Attendance / PTO / bucket
  "attendanceBucketEnabled", "attendanceUnit", "attendanceWarnThreshold",
  "attendanceTerminateThreshold", "attendanceCurrentBalance", "attendanceIncrement",
  "ptoEnabled", "ptoAccrualMethod", "ptoAccrualRate", "ptoCurrentBalance", "ptoCap",
  "bucketStartBalance", "bucketCap", "bucketPayoutRate",
  // Freedom Allowance / risk posture
  "freedomAllowanceEnabled", "freedomAllowance",
  // Job loss (jobApplications deliberately excluded — already its own log)
  "newJobSeasonMode", "newJobSeasonDate", "unemploymentEnabled", "unemploymentWeekly",
  "unemploymentDurationWeeks", "unemploymentWaitingWeek", "returnToWorkDate",
  "targetIncomeAnnual", "startedUnemployed",
];

/**
 * Returns the whitelist fields whose value differs between two configs.
 * undefined and null compare equal — DEFAULT_CONFIG spreading introduces
 * fields on old rows, and undefined→null must not fabricate a history row.
 * Arrays/objects (taxedWeeks, otherDeductions, …) compare structurally.
 */
export function diffSensitiveFields(oldConfig, newConfig) {
  if (!oldConfig || !newConfig) return [];
  const changed = [];
  for (const field of HISTORY_SENSITIVE_FIELDS) {
    const a = oldConfig[field] ?? null;
    const b = newConfig[field] ?? null;
    if (a === b) continue;
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(field);
  }
  return changed;
}
