import { FED_BRACKETS, QUARTER_BOUNDARIES, DHL_PRESET, FISCAL_YEAR_START, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { STATE_TAX_TABLE } from "../constants/stateTaxTable.js";

// ─────────────────────────────────────────────────────────────
// PURE FUNCTIONS — all stateless, no component dependencies
// ─────────────────────────────────────────────────────────────

function toLocalIso(date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export { toLocalIso };

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── DHL 401k tiered employer match ─────────────────────────────────────────
// DHL matches 100% up to 4%, then 50¢ per $1 from 4%→6%, capped at 5% match.
//   Contribute 4% → DHL matches 4.0%
//   Contribute 5% → DHL matches 4.5%
//   Contribute 6% → DHL matches 5.0%  (cap)
//   Contribute 7%+ → DHL matches 5.0% (cap holds)
export function dhlEmployerMatchRate(k401Rate) {
  const tier1 = Math.min(k401Rate, 0.04);
  const tier2 = Math.min(Math.max(k401Rate - 0.04, 0), 0.02) * 0.5;
  return tier1 + tier2;
}

const checksPerYearFor = (schedule) => PAYCHECKS_PER_YEAR[schedule ?? "weekly"] ?? 52;

function perPaycheckBenefitDeductions(cfg) {
  return (
    (cfg.healthPremium || 0) +
    (cfg.dentalPremium || 0) +
    (cfg.visionPremium || 0) +
    (cfg.ltd || 0) +
    (cfg.stdWeekly || 0) +
    (cfg.lifePremium || 0) +
    (cfg.hsaWeekly || 0) +
    (cfg.fsaWeekly || 0)
  );
}

function weeklyBenefitDeductions(cfg) {
  const perCheck = perPaycheckBenefitDeductions(cfg);
  const checksPerYear = checksPerYearFor(cfg.userPaySchedule);
  return perCheck * (checksPerYear / 52);
}

function otherPostTaxDeductions(cfg) {
  const perCheck = (cfg.otherDeductions ?? []).reduce((sum, row) => {
    const amt = row?.weeklyAmount;
    return sum + (typeof amt === "number" ? amt : 0);
  }, 0);
  const checksPerYear = checksPerYearFor(cfg.userPaySchedule);
  return perCheck * (checksPerYear / 52);
}

function dhlWeekendHoursForDate(date, shiftHours) {
  const dow = date.getDay();
  if (dow === 6 || dow === 0) return shiftHours; // Sat/Sun full shift earns diff
  if (dow === 5) return shiftHours / 2;          // Fri night: midnight→Sat 6am only
  return 0;
}

function dhlWeekendHoursPerDayName(dayName, shiftHours) {
  if (dayName === "Sat" || dayName === "Sun") return shiftHours;
  if (dayName === "Fri") return shiftHours / 2;
  return 0;
}

function dhlTotalWeekendHours(isWeek2, shiftHours) {
  const friday = shiftHours / 2;
  return isWeek2 ? (friday + 2 * shiftHours) : friday;
}

function dhlWeekendHoursFromDays(dayNames, shiftHours) {
  if (!Array.isArray(dayNames) || dayNames.length === 0) return 0;
  return dayNames.reduce((sum, day) => sum + dhlWeekendHoursPerDayName(day, shiftHours), 0);
}

function dhlWeekendHoursFromShiftCount(count, isWeek2, shiftHours) {
  if (!count) return 0;
  const contributions = isWeek2 ? [shiftHours / 2, shiftHours, shiftHours] : [shiftHours / 2];
  let remaining = count;
  let total = 0;
  for (const hours of contributions) {
    if (remaining <= 0) break;
    total += hours;
    remaining -= 1;
  }
  return total;
}

export function fedTax(income) {
  let tax = 0, prev = 0;
  for (const [limit, rate] of FED_BRACKETS) { if (income <= prev) break; tax += (Math.min(income, limit) - prev) * rate; prev = limit; }
  return tax;
}

// State income tax — three models: NONE, FLAT, PROGRESSIVE.
// stateConfig comes from STATE_TAX_TABLE[userState].
export function stateTax(income, stateConfig) {
  if (!stateConfig || stateConfig.model === "NONE") return 0;
  if (stateConfig.model === "FLAT") return income * stateConfig.flatRate;
  if (stateConfig.model === "PROGRESSIVE") {
    let tax = 0, prev = 0;
    for (const { max, rate } of stateConfig.brackets) {
      if (income <= prev) break;
      tax += (Math.min(income, max ?? Infinity) - prev) * rate;
      prev = max ?? Infinity;
    }
    return tax;
  }
  return 0;
}

// Resolve state tax config for a given userState code.
// Falls back to MO if state not found (safe default for Anthony).
export function getStateConfig(userState) {
  return STATE_TAX_TABLE[userState] ?? STATE_TAX_TABLE["MO"];
}

// Builds a full 52-week array of pay data from config.
// DHL path: alternates long (6-day) / short (4-day) from firstActiveIdx,
//   using either the DHL_PRESET day arrays (dhlTeam + !dhlCustomSchedule)
//   or Anthony's hardcoded arrays (dhlCustomSchedule: true).
//
// Anthony's custom schedule vs standard DHL B-team rotation:
//   Standard B-team long  = 4 shifts (Tue/Wed/Sat/Sun)   → 48h
//   Standard B-team short = 3 shifts (Mon/Thu/Fri)        → 36h
//   Anthony long  = 4 standard + 2 scheduled OT           → 6-Day (Tue–Sun, 72h)
//   Anthony short = 3 standard + 1 scheduled OT           → 4-Day (Mon/Wed/Thu/Fri, 48h)
//   The hardcoded day arrays below represent his full week including OT.
//
// Standard path: flat weekly hours, no rotation.
// Note: cfg.dhlNightShift is stored but NOT used here — weekend diff (diffRate)
//   applies equally to all shifts. Night differential is tracked separately.
export function buildYear(cfg) {
  const weeks = [], k401Start = new Date(cfg.k401StartDate), taxedSet = new Set(cfg.taxedWeeks);
  const isDHL = cfg.employerPreset === "DHL";
  const benefitsStart = parseIsoDate(cfg.benefitsStartDate);
  // Derive loop bounds from FISCAL_YEAR_START so the range stays in sync with the
  // constant rather than being duplicated as a hardcoded literal.
  const [fyY, fyM, fyD] = FISCAL_YEAR_START.split('-').map(Number);
  let d = new Date(fyY, fyM - 1, fyD), idx = 0;
  const fyEnd = new Date(fyY + 1, fyM - 1, fyD - 1);
  while (d <= fyEnd) {
    const weekEnd = new Date(d), weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - 7);

    let totalHours, regularHours, overtimeHours, weekendHours, grossPay, worked, rotation, isHighWeek;

    if (isDHL) {
      // DHL: alternating long (6-day) / short (4-day) from firstActiveIdx.
      // (offset%2+2)%2 handles negative offsets (pre-employment weeks) correctly.
      const offset = ((idx - cfg.firstActiveIdx) % 2 + 2) % 2;
      isHighWeek = offset === 0 ? Boolean(cfg.startingWeekIsLong) : !Boolean(cfg.startingWeekIsLong);
      const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(x.getDate() + i); return x; });
      if (cfg.dhlTeam && !cfg.dhlCustomSchedule) {
        // Standard preset rotation — days from DHL_PRESET (Team A or B, picked in wizard Step 15)
        const rotDays = isHighWeek ? DHL_PRESET.rotation.long.days : DHL_PRESET.rotation.short.days;
        worked = rotDays.map(d => days[d]);
      } else {
        // Anthony's custom schedule: standard B-team days + scheduled OT baked in.
        // Long:  Tue/Wed/Sat/Sun (standard) + Thu/Fri (2 OT) = Tue–Sun (6-Day, 72h)
        // Short: Mon/Thu/Fri (standard) + Wed (1 OT)         = Mon/Wed/Thu/Fri (4-Day, 48h)
        worked = isHighWeek
          ? [days[1], days[2], days[3], days[4], days[5], days[6]]  // 6-day: Tue–Sun
          : [days[0], days[2], days[3], days[4]];                    // 4-day: Mon/Wed/Thu/Fri
      }
      rotation = isHighWeek ? "6-Day" : "4-Day";
      totalHours = worked.length * cfg.shiftHours;
      // Weekend pay: Sat 12:00am → Mon 6:00am (Fri nights only count midnight→6am Sat)
      weekendHours = worked.reduce((sum, day) => sum + dhlWeekendHoursForDate(day, cfg.shiftHours), 0);
    } else {
      // Standard path: flat weekly hours, no rotation concept.
      isHighWeek = false;
      worked = [];
      rotation = "Standard";
      totalHours = cfg.standardWeeklyHours ?? 40;
      weekendHours = 0;
    }

    regularHours = Math.min(totalHours, cfg.otThreshold);
    overtimeHours = Math.max(totalHours - cfg.otThreshold, 0);
    // OT: all differentials (weekend + night) are included in the 1.5× multiplier.
    // Non-weekend shifts come earlier in the week; weekend (Fri+) begin at hour nonWeekendH+1,
    // so weekend hours that push past the 40h threshold are fully at OT rate.
    const nonWeekendH = totalHours - weekendHours;
    const regWkndH = Math.max(0, Math.min(weekendHours, cfg.otThreshold - nonWeekendH));
    const otWkndH  = weekendHours - regWkndH;
    const nightDiffHr = (isDHL && cfg.dhlNightShift) ? (cfg.nightDiffRate ?? 0) : 0;
    grossPay = regularHours  * (cfg.baseRate + nightDiffHr)
             + regWkndH      * cfg.diffRate
             + overtimeHours * (cfg.baseRate + nightDiffHr) * cfg.otMultiplier
             + otWkndH       * cfg.diffRate * cfg.otMultiplier;

    const active = idx >= cfg.firstActiveIdx;
    const benefitsActive = !benefitsStart || weekEnd >= benefitsStart;
    const benefitsDeduction = benefitsActive ? weeklyBenefitDeductions(cfg) : 0;
    const has401k = active && weekEnd >= k401Start;
    const k401kEmployee = has401k ? grossPay * cfg.k401Rate : 0;
    // DHL match is formula-driven (tiered); other employers use stored flat k401MatchRate.
    const effectiveMatchRate = cfg.employerPreset === "DHL"
      ? dhlEmployerMatchRate(cfg.k401Rate)
      : cfg.k401MatchRate;
    const k401kEmployer = has401k ? grossPay * effectiveMatchRate : 0;
    const taxableGross = active ? Math.max(grossPay - benefitsDeduction - k401kEmployee, 0) : 0;
    const isTaxed = active && taxedSet.has(idx);
    weeks.push({
      idx, weekEnd, weekStart, rotation, isHighWeek,
      workedDayNames: worked.map(w => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.getDay()]),
      totalHours, regularHours, overtimeHours, weekendHours,
      grossPay: active ? grossPay : 0,
      taxableGross,
      active,
      has401k,
      k401kEmployee,
      k401kEmployer,
      taxedBySchedule: isTaxed,
      benefitsDeduction,
      benefitsActive,
    });
    d.setDate(d.getDate() + 7); idx++;
  }
  return weeks;
}

export function computeNet(w, cfg, extraPerCheck, showExtra) {
  if (!w.active) return 0;
  const fica = w.grossPay * cfg.ficaRate;
  const benefitDeduction = w.benefitsDeduction ?? (w.active ? weeklyBenefitDeductions(cfg) : 0);
  const ded = benefitDeduction + w.k401kEmployee;
  const otherPostTax = otherPostTaxDeductions(cfg);
  if (!w.taxedBySchedule) return (w.grossPay - fica - ded) - otherPostTax;
  // Use generalized rate fields; fall back to legacy w1/w2 fields for pre-wizard rows.
  const fedLow  = cfg.fedRateLow   ?? cfg.w1FedRate;
  const fedHigh = cfg.fedRateHigh  ?? cfg.w2FedRate;
  const stLow   = cfg.stateRateLow  ?? cfg.w1StateRate;
  const stHigh  = cfg.stateRateHigh ?? cfg.w2StateRate;
  const fed = w.taxableGross * (w.isHighWeek ? fedHigh : fedLow) + (showExtra ? extraPerCheck : 0);
  const st = w.taxableGross * (w.isHighWeek ? stHigh : stLow);
  return (w.grossPay - fed - st - fica - ded) - otherPostTax;
}

export function projectedGross(isWeek2, cfg) {
  const ns = isWeek2 ? 6 : 4, totalH = ns * cfg.shiftHours;
  const reg = Math.min(totalH, cfg.otThreshold), ot = Math.max(totalH - cfg.otThreshold, 0);
  // Long (Tue–Sun) has Fri (half shift) + Sat + Sun; short (Mon/Wed/Thu/Fri) only earns half-shift diff on Fri night.
  const wkndH = dhlTotalWeekendHours(isWeek2, cfg.shiftHours);
  const nonWkndH = totalH - wkndH;
  const regWknd = Math.max(0, Math.min(wkndH, cfg.otThreshold - nonWkndH));
  const otWknd  = wkndH - regWknd;
  const isDHL = cfg.employerPreset === "DHL";
  const nightDiff = (isDHL && cfg.dhlNightShift) ? (cfg.nightDiffRate ?? 0) : 0;
  return reg     * (cfg.baseRate + nightDiff)
       + regWknd * cfg.diffRate
       + ot      * (cfg.baseRate + nightDiff) * cfg.otMultiplier
       + otWknd  * cfg.diffRate * cfg.otMultiplier;
}

// ─────────────────────────────────────────────────────────────
// TIME-SERIES EXPENSE FUNCTIONS
// ─────────────────────────────────────────────────────────────

export function getPhaseIndex(weekEndDate) {
  const iso = toLocalIso(weekEndDate);
  if (iso <= QUARTER_BOUNDARIES[0]) return 0;
  if (iso <= QUARTER_BOUNDARIES[1]) return 1;
  if (iso <= QUARTER_BOUNDARIES[2]) return 2;
  return 3;
}

export function getEffectiveAmount(expense, weekEndDate, phaseIdx) {
  if (!expense.history?.length) return expense.weekly?.[phaseIdx] ?? 0;
  const iso = toLocalIso(weekEndDate);
  let best = null;
  for (const entry of expense.history) {
    if (entry.effectiveFrom <= iso && (best === null || entry.effectiveFrom >= best.effectiveFrom))
      best = entry;
  }
  return best?.weekly[phaseIdx] ?? 0;
}

export function computeRemainingSpend(expenses, futureWeeks) {
  if (!futureWeeks.length) return { totalRemainingSpend: 0, avgWeeklySpend: 0, weekCount: 0 };
  let total = 0;
  for (const week of futureWeeks) {
    const pi = getPhaseIndex(week.weekEnd);
    for (const exp of expenses) total += getEffectiveAmount(exp, week.weekEnd, pi);
  }
  return { totalRemainingSpend: total, avgWeeklySpend: total / futureWeeks.length, weekCount: futureWeeks.length };
}

export function computeGoalTimeline(activeGoals, futureWeeks, weeklyNets, expenses, logNetLost, logNetGained, futureEventDeductions = {}) {
  if (!futureWeeks.length || !activeGoals.length)
    return activeGoals.map(g => ({ ...g, sW: 0, eW: 0, wN: 0 }));
  const n = futureWeeks.length;
  const avgNet = weeklyNets.length ? weeklyNets.reduce((a, b) => a + b, 0) / weeklyNets.length : 0;
  // ── Past-event smear: exclude future-week deductions (handled per-week below) ──
  const futureDeductionTotal = Object.values(futureEventDeductions).reduce((a, b) => a + b, 0);
  const perWeekLost = (logNetLost - futureDeductionTotal) / n, perWeekGain = (logNetGained ?? 0) / n;
  const remaining = activeGoals.map(g => g.target);
  const startWeek = activeGoals.map(() => null);
  const endWeek = activeGoals.map(() => null);
  let weekOffset = 0;
  for (const week of futureWeeks) {
    const pi = getPhaseIndex(week.weekEnd);
    let spend = 0;
    for (const exp of expenses)
      spend += getEffectiveAmount(exp, week.weekEnd, pi);
    // ── Targeted deduction: current/future-week events hit their specific week ──
    const weekDeduction = futureEventDeductions[week.idx] ?? 0;
    let surplus = (weeklyNets[weekOffset] ?? 0) - weekDeduction - spend - perWeekLost + perWeekGain;
    if (surplus > 0) {
      for (let i = 0; i < activeGoals.length; i++) {
        if (remaining[i] <= 0 || surplus <= 0) continue;
        if (startWeek[i] === null) startWeek[i] = weekOffset;
        const fund = Math.min(surplus, remaining[i]);
        remaining[i] -= fund;
        surplus -= fund;
        if (remaining[i] <= 0) endWeek[i] = weekOffset + fund / (fund + surplus + 0.0001);
      }
    }
    weekOffset++;
  }
  return activeGoals.map((g, i) => {
    const sw = startWeek[i] ?? 0, ew = endWeek[i] ?? null;
    const wN = ew !== null ? ew - sw : remaining[i] / Math.max(avgNet - 0.01, 0.01);
    return { ...g, sW: sw, eW: ew, wN };
  });
}

// ─────────────────────────────────────────────────────────────
// LOAN FUNCTIONS
// loanMeta shape: { totalAmount, paymentAmount, paymentFrequency, firstPaymentDate }
// paymentFrequency: "weekly" | "biweekly" | "monthly"
// ─────────────────────────────────────────────────────────────

const DAYS_PER_FREQ = { weekly: 7, biweekly: 14, monthly: 30.4375 };

export function loanWeeklyAmount(loan) {
  const amt = loan.paymentAmount ?? loan.paymentPerCheck ?? 0; // backward compat
  const freq = loan.paymentFrequency ?? loan.payFrequency ?? "weekly";
  if (freq === "monthly") return amt * 12 / 52;
  if (freq === "biweekly") return amt / 2;
  return amt; // weekly
}

// One payment cycle before firstPaymentDate — when weekly set-aside begins
export function loanRunwayStartDate(loan) {
  const freq = loan.paymentFrequency ?? loan.payFrequency ?? "weekly";
  const daysBack = DAYS_PER_FREQ[freq] ?? 7;
  const d = new Date(loan.firstPaymentDate);
  d.setDate(d.getDate() - Math.round(daysBack));
  return toLocalIso(d);
}

export function computeLoanPayoffDate(loan) {
  const amt = loan.paymentAmount ?? loan.paymentPerCheck ?? 0;
  const freq = loan.paymentFrequency ?? loan.payFrequency ?? "weekly";
  const paymentsTotal = amt > 0 ? Math.ceil(loan.totalAmount / amt) : 0;
  const d = new Date(loan.firstPaymentDate);
  d.setDate(d.getDate() + Math.round(paymentsTotal * (DAYS_PER_FREQ[freq] ?? 7)));
  return toLocalIso(d);
}

// History is always derived from loanMeta — runway start → payoff
export function buildLoanHistory(loan) {
  const w = loanWeeklyAmount(loan);
  return [
    { effectiveFrom: loanRunwayStartDate(loan), weekly: [w, w, w, w] },
    { effectiveFrom: computeLoanPayoffDate(loan), weekly: [0, 0, 0, 0] }
  ];
}

export function loanPaymentsRemaining(loan) {
  const today = toLocalIso(new Date());
  const payoffDate = computeLoanPayoffDate(loan);
  if (today >= payoffDate) return 0;
  const amt = loan.paymentAmount ?? loan.paymentPerCheck ?? 0;
  const freq = loan.paymentFrequency ?? loan.payFrequency ?? "weekly";
  const total = amt > 0 ? Math.ceil(loan.totalAmount / amt) : 0;
  if (today < loan.firstPaymentDate) return total;
  const daysPerPayment = DAYS_PER_FREQ[freq] ?? 7;
  const elapsed = Math.floor(
    (new Date(today) - new Date(loan.firstPaymentDate)) / (daysPerPayment * 24 * 60 * 60 * 1000)
  );
  return Math.max(total - elapsed, 0);
}

// ─────────────────────────────────────────────────────────────
// ATTENDANCE BUCKET MODEL
// ─────────────────────────────────────────────────────────────

function monthRange(startYYYYMM, endYYYYMM) {
  const result = [];
  let [y, m] = startYYYYMM.split("-").map(Number);
  const [ey, em] = endYYYYMM.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return result;
}

function addOneMonth(yyyyMM) {
  let [y, m] = yyyyMM.split("-").map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function prevMonth(yyyyMM) {
  let [y, m] = yyyyMM.split("-").map(Number);
  m--; if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function computeBucketModel(logs, cfg) {
  const payoutRate = cfg.bucketPayoutRate ?? (cfg.baseRate / 2);
  const cap = cfg.bucketCap ?? 128;
  let balance = cfg.bucketStartBalance ?? 64;

  // Job start month: week 0 ends at FISCAL_YEAR_START; firstActiveIdx weeks of 7 days forward = first active week end
  const [wzeY, wzeM, wzeD] = FISCAL_YEAR_START.split('-').map(Number);
  const weekZeroEnd = new Date(wzeY, wzeM - 1, wzeD);
  const firstWeekEnd = new Date(weekZeroEnd.getTime() + (cfg.firstActiveIdx ?? 7) * 7 * 86400000);
  const firstWeekStart = new Date(firstWeekEnd.getTime() - 7 * 86400000);
  const jobStartMonth = toLocalIso(firstWeekStart).slice(0, 7);

  const today = toLocalIso(new Date());
  const currentMonth = today.slice(0, 7);

  // Group missed_unapproved hours by YYYY-MM from event.weekEnd
  const hoursByMonth = {};
  logs.forEach(e => {
    if (e.type === "missed_unapproved" && e.weekEnd) {
      const month = e.weekEnd.slice(0, 7);
      hoursByMonth[month] = (hoursByMonth[month] || 0) + (e.hoursLost || 0);
    }
  });

  // Completed months: job start through the month before current month
  const lastCompleted = prevMonth(currentMonth);
  const completedMonths = jobStartMonth <= lastCompleted ? monthRange(jobStartMonth, lastCompleted) : [];

  const monthHistory = [];
  for (const month of completedMonths) {
    const M = hoursByMonth[month] || 0;
    let bonus, deduction;
    if (M === 0)       { bonus = 18; deduction = 0; }
    else if (M <= 12)  { bonus = 12; deduction = M; }
    else if (M <= 24)  { bonus = 6;  deduction = M; }
    else               { bonus = 0;  deduction = M; }
    const newBalance = balance + bonus - deduction;
    const overflow = Math.max(0, newBalance - cap);
    const closingBalance = Math.min(newBalance, cap);
    monthHistory.push({ month, M, bonus, deduction, net: bonus - deduction, openingBalance: balance, closingBalance, overflow, payout: overflow * payoutRate });
    balance = closingBalance;
  }

  // Current in-progress month
  const currentBalance = balance;
  const currentM = hoursByMonth[currentMonth] || 0;
  const currentTier = currentM === 0 ? 1 : currentM <= 12 ? 2 : currentM <= 24 ? 3 : 4;
  const hoursToNextTier = currentTier === 1 ? null : currentTier === 2 ? 12 - currentM : currentTier === 3 ? 24 - currentM : 0;
  const status = currentBalance >= 48 ? "safe" : currentBalance >= 12 ? "caution" : "critical";

  // Future months: next month through Dec 2026, assuming perfect attendance (M=0)
  const nextMonth = addOneMonth(currentMonth);
  const futureMonths = nextMonth <= "2026-12" ? monthRange(nextMonth, "2026-12") : [];
  let projBalance = currentBalance;
  const projectedHistory = [];
  for (const month of futureMonths) {
    const newBal = projBalance + 18;
    const overflow = Math.max(0, newBal - cap);
    const closingBal = Math.min(newBal, cap);
    projectedHistory.push({ month, M: 0, bonus: 18, deduction: 0, net: 18, openingBalance: projBalance, closingBalance: closingBal, overflow, payout: overflow * payoutRate, projected: true });
    projBalance = closingBal;
  }

  const realizedPayout  = monthHistory.reduce((s, r) => s + r.payout, 0);
  const projectedPayout = projectedHistory.reduce((s, r) => s + r.payout, 0);

  return { currentBalance, currentM, currentTier, hoursToNextTier, status, monthHistory, projectedHistory, realizedPayout, projectedPayout, totalProjectedBonus: realizedPayout + projectedPayout };
}

export function calcEventImpact(event, cfg) {
  const isDHL = cfg.employerPreset === "DHL";
  const nightDiffPerHour = (isDHL && cfg.dhlNightShift) ? (cfg.nightDiffRate ?? 0) : 0;
  const isWeek2 = event.weekRotation === "6-Day" || event.weekRotation === "Week 2"; // "Week 2" kept for backward compat with stored data
  const normalShifts = isWeek2 ? 6 : 4;
  const normalWeekendHours = dhlTotalWeekendHours(isWeek2, cfg.shiftHours);
  const baseGross = projectedGross(isWeek2, cfg);
  let grossLost = 0, grossGained = 0, hoursLostForPTO = 0;
  if (event.type === "missed_unpaid") {
    const actualShifts = Math.max(normalShifts - (event.shiftsLost || 0), 0);
    const actualHours = actualShifts * cfg.shiftHours;
    const hasDayResolution = Array.isArray(event.missedDays) && event.missedDays.length > 0;
    const wkndHoursLostFromDays = hasDayResolution ? dhlWeekendHoursFromDays(event.missedDays, cfg.shiftHours) : 0;
    const wkndHoursLostFallback = hasDayResolution
      ? 0
      : dhlWeekendHoursFromShiftCount(event.weekendShifts || 0, isWeek2, cfg.shiftHours);
    const weekendHoursRemaining = Math.max(normalWeekendHours - wkndHoursLostFromDays - wkndHoursLostFallback, 0);
    const actualWkndH = Math.min(actualHours, weekendHoursRemaining);
    const actualNonWkndH = Math.max(actualHours - actualWkndH, 0);
    const actualRegWkndH = Math.max(0, Math.min(actualWkndH, cfg.otThreshold - actualNonWkndH));
    const actualOTWkndH  = actualWkndH - actualRegWkndH;
    const actualReg = Math.min(actualHours, cfg.otThreshold), actualOT = Math.max(actualHours - cfg.otThreshold, 0);
    const actualGross = actualReg      * (cfg.baseRate + nightDiffPerHour)
                      + actualRegWkndH * cfg.diffRate
                      + actualOT       * (cfg.baseRate + nightDiffPerHour) * cfg.otMultiplier
                      + actualOTWkndH  * cfg.diffRate * cfg.otMultiplier;
    grossLost = Math.max(baseGross - actualGross, 0); hoursLostForPTO = (event.shiftsLost || 0) * cfg.shiftHours;
  } else if (event.type === "pto") {
    const ptoH = event.ptoHours || 0, normalH = normalShifts * cfg.shiftHours;
    const normalOT = Math.max(normalH - cfg.otThreshold, 0), actualOT = Math.max(normalH - ptoH - cfg.otThreshold, 0);
    // PTO pays at baseRate; night diff applies to hours worked only — both deltas included
    grossLost = ptoH * nightDiffPerHour + (normalOT - actualOT) * cfg.baseRate * (cfg.otMultiplier - 1);
  } else if (event.type === "missed_unapproved") {
    // Hours missed × (base rate + night diff); bucket hit tracked separately
    grossLost = (event.hoursLost || 0) * (cfg.baseRate + nightDiffPerHour); hoursLostForPTO = event.hoursLost || 0;
  } else if (event.type === "partial") {
    grossLost = (event.hoursLost || 0) * (cfg.baseRate + nightDiffPerHour); hoursLostForPTO = event.hoursLost || 0;
  } else if (event.type === "bonus") {
    grossGained = event.amount || 0;
  } else if (event.type === "other_loss") { grossLost = event.amount || 0; }
  // Net impact accounts for FICA always, plus withholding on taxed weeks
  const isTaxedWeek = Array.isArray(cfg.taxedWeeks) && cfg.taxedWeeks.includes(Number(event.weekIdx));
  const withholdingRate = isTaxedWeek
    ? (isWeek2 ? cfg.w2FedRate + cfg.w2StateRate : cfg.w1FedRate + cfg.w1StateRate)
    : 0;
  const effectiveTaxRate = cfg.ficaRate + withholdingRate;
  const netLost = grossLost * (1 - effectiveTaxRate), netGained = grossGained * (1 - effectiveTaxRate);
  const weekDate = event.weekEnd ? new Date(event.weekEnd) : null;
  const affectsK401 = weekDate && weekDate >= new Date(cfg.k401StartDate);
  return {
    grossLost, grossGained, netLost, netGained, baseGross, hoursLostForPTO,
    bucketHoursDeducted: event.type === "missed_unapproved" ? (event.hoursLost || 0) : 0,
    k401kLost: affectsK401 ? grossLost * cfg.k401Rate : 0,
    k401kMatchLost: affectsK401 ? grossLost * (cfg.employerPreset === "DHL" ? dhlEmployerMatchRate(cfg.k401Rate) : cfg.k401MatchRate) : 0,
    k401kGained: affectsK401 ? grossGained * cfg.k401Rate : 0,
    k401kMatchGained: affectsK401 ? grossGained * (cfg.employerPreset === "DHL" ? dhlEmployerMatchRate(cfg.k401Rate) : cfg.k401MatchRate) : 0
  };
}
