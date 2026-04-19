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

// Source-of-truth payroll deduction contract for weekly rows.
// UI consumers (Budget Breakdown) should read:
//   week.payrollDeductions.total
// where:
//   benefits = active benefit deductions (health/dental/vision/ltd/std/life/hsa/fsa)
//   k401Employee = active employee 401k deduction
//   total = benefits + k401Employee
export function deriveWeeklyPayrollDeductions(week, cfg) {
  const payrollFromWeek = week?.payrollDeductions;
  if (payrollFromWeek && typeof payrollFromWeek === "object") {
    const benefits = payrollFromWeek.benefits ?? 0;
    const k401Employee = payrollFromWeek.k401Employee ?? week.k401kEmployee ?? 0;
    return {
      benefits,
      k401Employee,
      total: benefits + k401Employee,
    };
  }

  const benefits = week.benefitsDeduction ?? ((week.benefitsActive ?? week.active) ? weeklyBenefitDeductions(cfg) : 0);
  const k401Employee = week.k401kEmployee ?? 0;
  return {
    benefits,
    k401Employee,
    total: benefits + k401Employee,
  };
}

// Budget Breakdown source-of-truth: payroll deductions only.
// This intentionally excludes event deductions and all event-adjusted deltas.
export function getWeeklyBudgetBreakdownPayrollDeductions(week, cfg) {
  return deriveWeeklyPayrollDeductions(week, cfg).total;
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

// All day indexes use JS Date convention: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
// This matches DHL_PRESET.rotation.days and Date.getDay() throughout.
const CUSTOM_LONG_DAY_INDEXES = [2, 3, 4, 5, 6, 0]; // Tue/Wed/Thu/Fri/Sat/Sun (Anthony 6-Day)
const CUSTOM_SHORT_DAY_INDEXES = [1, 3, 4, 5];       // Mon/Wed/Thu/Fri (Anthony 4-Day)
const WEEKEND_INDEX_ORDER = [5, 6, 0]; // Fri night (½) → Sat → Sun (JS Date convention)

function dhlWeekendHoursPerDayIndex(idx, shiftHours) {
  // JS Date convention: 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  if (idx === 5) return shiftHours / 2;  // Friday overnight → Sat 6a earns half diff
  if (idx === 6) return shiftHours;      // Saturday earns full diff
  if (idx === 0) return shiftHours;      // Sunday earns full diff
  return 0;
}

function getStandardDhlOtDay(isLongWeek, cfg) {
  if (!DHL_PRESET.requiredOtShifts) return null;
  const meta = isLongWeek ? DHL_PRESET.rotation.long : DHL_PRESET.rotation.short;
  if (!isLongWeek && cfg.dhlOtOnWeekend) return meta.otDefaults?.weekend ?? 6;
  return meta.otDefaults?.weekday ?? (isLongWeek ? 1 : 2);
}

function buildStandardDhlDayIndexes(cfg, isLongWeek) {
  const meta = isLongWeek ? DHL_PRESET.rotation.long : DHL_PRESET.rotation.short;
  const indexes = [...meta.days];
  const otDay = getStandardDhlOtDay(isLongWeek, cfg);
  if (otDay != null && !indexes.includes(otDay)) indexes.push(otDay);
  return indexes;
}

function getDhlPlannedDayIndexes(cfg, isLongWeek) {
  if (cfg.dhlCustomSchedule) {
    return (isLongWeek ? CUSTOM_LONG_DAY_INDEXES : CUSTOM_SHORT_DAY_INDEXES).slice();
  }
  return buildStandardDhlDayIndexes(cfg, isLongWeek);
}

function getDhlRotationLabel(isLongWeek) {
  const meta = isLongWeek ? DHL_PRESET.rotation.long : DHL_PRESET.rotation.short;
  return meta.displayName || meta.label || (isLongWeek ? "Long Week" : "Short Week");
}

function getDhlPlannedPattern(cfg, isLongWeek) {
  const indexes = getDhlPlannedDayIndexes(cfg, isLongWeek);
  const totalHours = indexes.length * cfg.shiftHours;
  const weekendHours = indexes.reduce((sum, idx) => sum + dhlWeekendHoursPerDayIndex(idx, cfg.shiftHours), 0);
  const rotationLabel = getDhlRotationLabel(isLongWeek);
  let requiredOtShifts;
  if (cfg.customWeeklyHours != null && !cfg.dhlCustomSchedule) {
    // Custom hours: additional OT shifts = (weekly target − already-scheduled rotation hours) / shift length.
    // Uses rotationHours (indexes already include the default OT day) so requiredOtShifts represents
    // only the EXTRA shifts beyond the existing schedule needed to reach the custom target.
    // e.g. customWeeklyHours=60: long (5 days×12=60h) → 0 extra; short (4 days×12=48h) → 1 extra.
    const rotationHours = indexes.length * cfg.shiftHours;
    requiredOtShifts = Math.max(0, Math.round((cfg.customWeeklyHours - rotationHours) / cfg.shiftHours));
  } else {
    requiredOtShifts = cfg.dhlCustomSchedule ? 0 : (DHL_PRESET.requiredOtShifts ?? 0);
  }
  return { indexes, totalHours, weekendHours, rotationLabel, requiredOtShifts };
}

function dhlWeekendHoursFromShiftCount(count, isWeek2, cfg) {
  if (!count || cfg.employerPreset !== "DHL") return 0;
  const indexes = getDhlPlannedDayIndexes(cfg, isWeek2);
  const contributions = [];
  for (const day of WEEKEND_INDEX_ORDER) {
    if (indexes.includes(day)) {
      const hours = dhlWeekendHoursPerDayIndex(day, cfg.shiftHours);
      if (hours > 0) contributions.push(hours);
    }
  }
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
//
// Schedule tiers (see DEFAULT_CONFIG.customWeeklyHours for full docs):
//
//   DHL preset   (!customWeeklyHours, !dhlCustomSchedule)
//     Alternates long/short from firstActiveIdx using DHL_PRESET day arrays.
//     requiredOtShifts = 1 for all weeks (user picks OT day in WeekConfirmModal).
//
//   DHL custom hours (customWeeklyHours set, !dhlCustomSchedule)
//     Same rotation day arrays for workedDayNames / WeekConfirmModal display.
//     totalHours overridden to customWeeklyHours for all projection math.
//     requiredOtShifts = (customWeeklyHours − coreHours) / shiftHours per week.
//
//   DHL legacy (dhlCustomSchedule: true) — kept until db.js migration window closes.
//     Uses hardcoded CUSTOM_LONG/SHORT_DAY_INDEXES. requiredOtShifts = 0.
//     If customWeeklyHours is ALSO set, totalHours is still overridden below.
//
//   Standard / non-DHL (!employerPreset)
//     Flat customWeeklyHours ?? standardWeeklyHours hours/week, no rotation.
//     rotation = "Custom" when customWeeklyHours is set, "Standard" otherwise.
//
// Note: cfg.dhlNightShift is stored but NOT used here — weekend diff (diffRate)
//   applies equally to all shifts. Night differential is tracked separately.
export function buildYear(cfg) {
  const weeks = [], k401Start = cfg.k401StartDate ? new Date(cfg.k401StartDate) : null, taxedSet = new Set(cfg.taxedWeeks);
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

    let totalHours, regularHours, overtimeHours, weekendHours, grossPay, worked, rotation, rotationLabel = null, requiredOtShifts = 0, isHighWeek, adminRotationTag = null;

    if (isDHL) {
      // DHL: alternating long (preset) / short from firstActiveIdx.
      // (offset%2+2)%2 handles negative offsets (pre-employment weeks) correctly.
      const offset = ((idx - cfg.firstActiveIdx) % 2 + 2) % 2;
      isHighWeek = offset === 0 ? !!cfg.startingWeekIsLong : !cfg.startingWeekIsLong;
      const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(x.getDate() + i); return x; });
      rotation = isHighWeek ? "6-Day" : "4-Day";
      adminRotationTag = rotation;
      if (!cfg.dhlCustomSchedule) {
        const pattern = getDhlPlannedPattern(cfg, isHighWeek);
        // DHL_PRESET.rotation.days uses JS getDay() convention (0=Sun,1=Mon,...,6=Sat).
        // days[] is indexed from weekStart (always Monday), so offset = (getDay + 6) % 7
        // maps JS day values to the correct Mon-relative array positions.
        worked = pattern.indexes.map(d => days[(d + 6) % 7]);
        rotationLabel = pattern.rotationLabel;
        requiredOtShifts = pattern.requiredOtShifts;
      } else {
        // Anthony's custom schedule: standard B-team days + scheduled OT baked in.
        // Long:  Tue/Wed/Sat/Sun (standard) + Thu/Fri (2 OT) = Tue–Sun (6-Day, 72h)
        // Short: Mon/Thu/Fri (standard) + Wed (1 OT)         = Mon/Wed/Thu/Fri (4-Day, 48h)
        worked = isHighWeek
          ? [days[1], days[2], days[3], days[4], days[5], days[6]]  // 6-day: Tue–Sun
          : [days[0], days[2], days[3], days[4]];                    // 4-day: Mon/Wed/Thu/Fri
        rotationLabel = getDhlRotationLabel(isHighWeek);
      }
      totalHours = worked.length * cfg.shiftHours;
      // Weekend pay: Sat 12:00am → Mon 6:00am (Fri nights only count midnight→6am Sat)
      weekendHours = worked.reduce((sum, day) => sum + dhlWeekendHoursForDate(day, cfg.shiftHours), 0);
      // Custom weekly hours: override projection total; rotation days preserved for WeekConfirmModal.
      if (!cfg.dhlCustomSchedule && cfg.customWeeklyHours != null) {
        totalHours = cfg.customWeeklyHours;
      }
    } else {
      // Standard / non-DHL path.
      isHighWeek = false;
      worked = [];
      const customHrs = cfg.customWeeklyHours;
      totalHours = customHrs ?? cfg.standardWeeklyHours ?? 40;
      rotation = customHrs != null ? "Custom" : "Standard";
      rotationLabel = rotation;
      adminRotationTag = rotation;
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
    const k401ActivationDate = k401Start ?? benefitsStart;
    const has401k = active && (!k401ActivationDate || weekEnd >= k401ActivationDate);
    const k401kEmployee = has401k ? grossPay * cfg.k401Rate : 0;
    // DHL match is formula-driven (tiered); other employers use stored flat k401MatchRate.
    const effectiveMatchRate = cfg.employerPreset === "DHL"
      ? dhlEmployerMatchRate(cfg.k401Rate)
      : cfg.k401MatchRate;
    const k401kEmployer = has401k ? grossPay * effectiveMatchRate : 0;
    const taxableGross = active ? Math.max(grossPay - benefitsDeduction - k401kEmployee, 0) : 0;
    const isTaxed = active && taxedSet.has(idx);
    if (!adminRotationTag) adminRotationTag = rotation;
    weeks.push({
      idx, weekEnd, weekStart, rotation, isHighWeek, adminRotationTag,
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
      payrollDeductions: {
        benefits: benefitsDeduction,
        k401Employee: k401kEmployee,
        total: benefitsDeduction + k401kEmployee,
      },
      rotationLabel: rotationLabel || rotation,
      requiredOtShifts,
    });
    d.setDate(d.getDate() + 7); idx++;
  }
  return weeks;
}

export function computeNet(w, cfg, extraPerCheck, showExtra) {
  if (!w.active) return 0;
  const fica = w.grossPay * cfg.ficaRate;
  const payrollDeductions = deriveWeeklyPayrollDeductions(w, cfg);
  const ded = payrollDeductions.total;
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
  let totalH, wkndH;
  if (cfg.employerPreset === "DHL") {
    const pattern = getDhlPlannedPattern(cfg, isWeek2);
    totalH = cfg.customWeeklyHours != null ? cfg.customWeeklyHours : pattern.totalHours;
    wkndH = pattern.weekendHours;
  } else {
    // Non-DHL: no weekend differential. customWeeklyHours overrides everything.
    wkndH = 0;
    if (cfg.customWeeklyHours != null) {
      totalH = cfg.customWeeklyHours;
    } else if (cfg.scheduleIsVariable) {
      // Variable schedule: isWeek2 = long week, !isWeek2 = short week
      totalH = isWeek2
        ? (cfg.longWeeklyHours || cfg.standardWeeklyHours || 40)
        : (cfg.standardWeeklyHours || 40);
    } else {
      totalH = cfg.standardWeeklyHours || 40;
    }
  }
  const reg = Math.min(totalH, cfg.otThreshold), ot = Math.max(totalH - cfg.otThreshold, 0);
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

const MONTHLY_NORMALIZATION_FACTORS = {
  weekly: 4.33,
  biweekly: 2.166,
  monthly: 1,
};

export function normalizeToMonthlyAmount(amount, cadence = "monthly") {
  const safeAmount = Number(amount) || 0;
  const factor = MONTHLY_NORMALIZATION_FACTORS[cadence] ?? 1;
  return safeAmount * factor;
}

export function projectMonthlyNetTakeHome(futureWeekNets = [], weeklyIncome = 0) {
  const source = Array.isArray(futureWeekNets) && futureWeekNets.length
    ? futureWeekNets
    : [weeklyIncome, weeklyIncome, weeklyIncome, weeklyIncome];
  return source.slice(0, 4).reduce((sum, net) => sum + (Number(net) || 0), 0);
}

export function resolveBudgetHealthMonthBoundary({
  previousMonthKey = null,
  now = new Date(),
} = {}) {
  const today = now instanceof Date ? now : new Date(now);
  const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const dayOfMonth = today.getDate();
  const crossedMonth = previousMonthKey !== null && previousMonthKey !== monthKey;
  const shouldReevaluate = dayOfMonth === 1 && (previousMonthKey === null || crossedMonth);
  return { monthKey, dayOfMonth, crossedMonth, shouldReevaluate };
}

export function computeRemainingSpend(expenses, futureWeeks, options = {}) {
  if (!futureWeeks.length) {
    return {
      totalRemainingSpend: 0,
      avgWeeklySpend: 0,
      weekCount: 0,
      monthlyExpenses: 0,
      monthlyNetTakeHome: 0,
      budgetHealth: 0,
      budgetHealthMonthKey: null,
      shouldReevaluateForMonthBoundary: false,
    };
  }
  let total = 0;
  for (const week of futureWeeks) {
    const pi = getPhaseIndex(week.weekEnd);
    for (const exp of expenses) total += getEffectiveAmount(exp, week.weekEnd, pi);
  }
  const avgWeeklySpend = total / futureWeeks.length;
  const monthlyExpenses = normalizeToMonthlyAmount(avgWeeklySpend, "weekly");
  const monthlyNetTakeHome = projectMonthlyNetTakeHome(
    options.futureWeekNets ?? [],
    options.weeklyIncome ?? 0
  );
  const monthBoundary = resolveBudgetHealthMonthBoundary({
    previousMonthKey: options.previousMonthKey ?? null,
    now: options.now ?? new Date(),
  });
  return {
    totalRemainingSpend: total,
    avgWeeklySpend,
    weekCount: futureWeeks.length,
    monthlyExpenses,
    monthlyNetTakeHome,
    budgetHealth: monthlyNetTakeHome > 0 ? monthlyExpenses / monthlyNetTakeHome : 0,
    budgetHealthMonthKey: monthBoundary.monthKey,
    shouldReevaluateForMonthBoundary: monthBoundary.shouldReevaluate,
  };
}

export function traceExpenseCalculationSteps({
  cfg,
  expenses,
  futureWeeks,
  showExtra = false,
  extraPerCheck = 0,
  bufferPerWeek = 0,
  observedQuarterlySpendByPhase = null,
} = {}) {
  const logEntries = [];
  const add = (source, action, values, forwarded) => {
    logEntries.push({ source, action, values, forwarded });
  };

  const safeCfg = cfg ?? {};
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeFutureWeeks = Array.isArray(futureWeeks) ? futureWeeks : [];

  add(
    "traceExpenseCalculationSteps(input)",
    "Initialize income and expense routing inputs.",
    {
      baseRate: safeCfg.baseRate ?? 0,
      shiftHours: safeCfg.shiftHours ?? 0,
      firstActiveIdx: safeCfg.firstActiveIdx ?? 0,
      expenseCount: safeExpenses.length,
      futureWeekCount: safeFutureWeeks.length,
      extraPerCheck,
      showExtra,
      bufferPerWeek,
    },
    "buildYear(cfg)"
  );

  const allWeeks = buildYear(safeCfg);
  const activeWeeks = allWeeks.filter(w => w.active);
  add(
    "buildYear",
    "Build all fiscal weeks and route only active weeks into net-pay calculations.",
    {
      totalWeeks: allWeeks.length,
      activeWeekCount: activeWeeks.length,
      firstActiveWeekIdx: activeWeeks[0]?.idx ?? null,
      lastActiveWeekIdx: activeWeeks[activeWeeks.length - 1]?.idx ?? null,
    },
    "computeNet(activeWeek)"
  );

  const weeklyNets = activeWeeks.map(w => computeNet(w, safeCfg, extraPerCheck, showExtra));
  const spendableNets = weeklyNets.map(n => n - bufferPerWeek);
  const projectedAnnualNet = weeklyNets.reduce((sum, n) => sum + n, 0);
  const weeklyIncome = projectedAnnualNet / 52 - bufferPerWeek;
  add(
    "computeNet + weeklyIncome",
    "Transform weekly gross/tax data into spendable weekly income.",
    {
      projectedAnnualNet,
      averageNetBeforeBuffer: projectedAnnualNet / 52,
      bufferPerWeek,
      spendableWeeklyIncome: weeklyIncome,
      sampledSpendableWeeks: spendableNets.slice(0, 3),
    },
    "computeRemainingSpend(expenses, futureWeeks)"
  );

  const quarterRollup = [0, 0, 0, 0].map(() => ({ weeklyActualTotal: 0, weeklySplitTotal: 0, weekCount: 0 }));
  const weeklyComparisons = [];
  for (const week of safeFutureWeeks) {
    const phaseIdx = getPhaseIndex(week.weekEnd);
    let weekActualTotal = 0;
    let weekSplitTotal = 0;
    const expenseComparisons = [];
    for (const exp of safeExpenses) {
      const effective = getEffectiveAmount(exp, week.weekEnd, phaseIdx);
      const split = exp.weekly?.[phaseIdx] ?? 0;
      const delta = effective - split;
      weekActualTotal += effective;
      weekSplitTotal += split;
      if (delta !== 0) {
        expenseComparisons.push({
          expenseId: exp.id ?? exp.label ?? "unknown-expense",
          effective,
          split,
          delta,
        });
      }
    }
    quarterRollup[phaseIdx].weeklyActualTotal += weekActualTotal;
    quarterRollup[phaseIdx].weeklySplitTotal += weekSplitTotal;
    quarterRollup[phaseIdx].weekCount += 1;
    weeklyComparisons.push({
      weekIdx: week.idx,
      weekEndIso: toLocalIso(week.weekEnd),
      phaseIdx,
      weekActualTotal,
      weekSplitTotal,
      discrepancy: weekActualTotal - weekSplitTotal,
      expenseComparisons,
    });
  }

  add(
    "getPhaseIndex + getEffectiveAmount",
    "Route each future week into its quarter and resolve history-aware weekly expense amounts.",
    {
      auditedFutureWeeks: safeFutureWeeks.length,
      sampleWeekComparisons: weeklyComparisons.slice(0, 3),
    },
    "Quarter rollup + discrepancy checks"
  );

  const quarterlyDiscrepancies = quarterRollup.map((quarter, phaseIdx) => ({
    phaseIdx,
    weekCount: quarter.weekCount,
    weeklyActualTotal: quarter.weeklyActualTotal,
    weeklySplitTotal: quarter.weeklySplitTotal,
    discrepancy: quarter.weeklyActualTotal - quarter.weeklySplitTotal,
  }));

  add(
    "quarterly comparison",
    "Compare aggregated weekly expense outputs against quarterly split totals.",
    { quarterlyDiscrepancies },
    "Audit markdown output"
  );

  const quarterRepresentativeDates = [
    new Date("2026-02-15"),
    new Date("2026-05-15"),
    new Date("2026-08-15"),
    new Date("2026-11-15"),
  ];
  const uiQuarterlySpendByPhase = [0, 1, 2, 3].map(phaseIdx =>
    safeExpenses.reduce((sum, exp) => sum + getEffectiveAmount(exp, new Date(), phaseIdx), 0)
  );
  const representativeQuarterlySpendByPhase = [0, 1, 2, 3].map(phaseIdx =>
    safeExpenses.reduce((sum, exp) => sum + getEffectiveAmount(exp, quarterRepresentativeDates[phaseIdx], phaseIdx), 0)
  );
  const uiVsRepresentativeDelta = uiQuarterlySpendByPhase.map((value, idx) => value - representativeQuarterlySpendByPhase[idx]);
  const observedVsUiDelta = Array.isArray(observedQuarterlySpendByPhase)
    ? observedQuarterlySpendByPhase.map((observed, idx) => (observed ?? 0) - (uiQuarterlySpendByPhase[idx] ?? 0))
    : null;

  add(
    "BudgetPanel quarter tab routing",
    "Compare quarter-tab spend (currentEffective with today's date) against representative quarter-date routing and optional observed app values.",
    {
      uiQuarterlySpendByPhase,
      representativeQuarterlySpendByPhase,
      uiVsRepresentativeDelta,
      observedQuarterlySpendByPhase,
      observedVsUiDelta,
    },
    "Audit markdown output"
  );

  const markdown = [
    "# Expense Calculation Audit Log",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    ...logEntries.map((entry, idx) => [
      `## Step ${idx + 1}: ${entry.source}`,
      `- **What happens:** ${entry.action}`,
      `- **Values:** \`${JSON.stringify(entry.values)}\``,
      `- **Passed on:** ${entry.forwarded}`,
      "",
    ].join("\n")),
  ].join("\n");

  return {
    logEntries,
    markdown,
    weeklyComparisons,
    quarterlyDiscrepancies,
    uiQuarterlySpendByPhase,
    representativeQuarterlySpendByPhase,
    uiVsRepresentativeDelta,
    observedVsUiDelta,
    projectedAnnualNet,
    weeklyIncome,
  };
}

export function isFutureWeek(weekEndIso, todayIso) {
  if (!weekEndIso || !todayIso) return false;
  return weekEndIso > todayIso;
}

export function computeGoalTimeline(activeGoals, futureWeeks, weeklyNets, expenses, logNetLost, logNetGained, futureEventDeductions = {}) {
  if (!futureWeeks.length || !activeGoals.length)
    return activeGoals.map(g => ({ ...g, sW: 0, eW: 0, wN: 0 }));
  const n = futureWeeks.length;
  // ── Past-event smear: exclude future-week deductions (handled per-week below) ──
  const futureDeductionTotal = Object.values(futureEventDeductions).reduce((a, b) => a + b, 0);
  const perWeekLost = (logNetLost - futureDeductionTotal) / n, perWeekGain = (logNetGained ?? 0) / n;
  const remaining = activeGoals.map(g => g.target);
  const startWeek = activeGoals.map(() => null);
  const endWeek = activeGoals.map(() => null);
  let totalSurplus = 0;
  let weekOffset = 0;
  for (const week of futureWeeks) {
    const pi = getPhaseIndex(week.weekEnd);
    let spend = 0;
    for (const exp of expenses)
      spend += getEffectiveAmount(exp, week.weekEnd, pi);
    // ── Targeted deduction: current/future-week events hit their specific week ──
    const weekDeduction = futureEventDeductions[week.idx] ?? 0;
    let surplus = (weeklyNets[weekOffset] ?? 0) - weekDeduction - spend - perWeekLost + perWeekGain;
    totalSurplus += surplus;
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
  const avgSurplus = totalSurplus / n;
  return activeGoals.map((g, i) => {
    const sw = startWeek[i] ?? 0, ew = endWeek[i] ?? null;
    const wN = ew !== null ? ew - sw : remaining[i] / Math.max(avgSurplus - 0.01, 0.01);
    return { ...g, sW: sw, eW: ew, wN };
  });
}

// ─────────────────────────────────────────────────────────────
// LOAN FUNCTIONS
// loanMeta shape: { totalAmount, paymentAmount, paymentFrequency, firstPaymentDate }
// paymentFrequency: "weekly" | "biweekly" | "monthly"
// ─────────────────────────────────────────────────────────────

const DAYS_PER_FREQ = { weekly: 7, biweekly: 14, monthly: 30.4375 };

const getQuarterEndDatesForYear = (year) => [
  `${year}-03-31`,
  `${year}-06-30`,
  `${year}-09-30`,
  `${year}-12-31`,
];

const getQuarterEndIsoForDate = (iso) => {
  if (!iso) return null;
  const parsed = parseIsoDate(iso);
  const year = parsed ? parsed.getFullYear() : parseIsoDate(FISCAL_YEAR_START).getFullYear();
  const boundaries = getQuarterEndDatesForYear(year);
  return boundaries.find(boundary => iso <= boundary) ?? boundaries[boundaries.length - 1];
};

const addDaysToIso = (iso, days) => {
  const parsed = parseIsoDate(iso) ?? new Date();
  parsed.setDate(parsed.getDate() + days);
  return toLocalIso(parsed);
};

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
  const payoffDate = computeLoanPayoffDate(loan);
  const quarterEnd = getQuarterEndIsoForDate(payoffDate) ?? payoffDate;
  const zeroEffectiveFrom = quarterEnd ? addDaysToIso(quarterEnd, 1) : payoffDate;
  return [
    { effectiveFrom: loanRunwayStartDate(loan), weekly: [w, w, w, w] },
    { effectiveFrom: zeroEffectiveFrom, weekly: [0, 0, 0, 0] }
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

  // When both override fields are set, use the override as the rolling starting point for
  // months after the override month. Without bucketOverrideMonth (legacy), fall back to
  // replacing currentBalance at the end (old behavior preserved for backward compat).
  const overrideActive = cfg.bucketBalanceOverride != null && cfg.bucketOverrideMonth != null;
  let balance = overrideActive ? cfg.bucketBalanceOverride : (cfg.bucketStartBalance ?? 64);

  // Job start month — always computed but only used as loop start when override is inactive
  const [wzeY, wzeM, wzeD] = FISCAL_YEAR_START.split('-').map(Number);
  const weekZeroEnd = new Date(wzeY, wzeM - 1, wzeD);
  const firstWeekEnd = new Date(weekZeroEnd.getTime() + (cfg.firstActiveIdx ?? 7) * 7 * 86400000);
  const firstWeekStart = new Date(firstWeekEnd.getTime() - 7 * 86400000);
  const jobStartMonth = toLocalIso(firstWeekStart).slice(0, 7);

  const today = toLocalIso(new Date());
  const currentMonth = today.slice(0, 7);

  // Group unapproved-absence hours by YYYY-MM from event.weekEnd
  const hoursByMonth = {};
  logs.forEach(e => {
    if ((e.type === "missed_unapproved" || e.type === "pto_unapproved") && e.weekEnd) {
      const month = e.weekEnd.slice(0, 7);
      hoursByMonth[month] = (hoursByMonth[month] || 0) + (e.hoursLost || 0);
    }
  });

  // Loop start: month after override month (its balance is given) or job start
  const loopStartMonth = overrideActive ? addOneMonth(cfg.bucketOverrideMonth) : jobStartMonth;
  const lastCompleted = prevMonth(currentMonth);
  const completedMonths = loopStartMonth <= lastCompleted ? monthRange(loopStartMonth, lastCompleted) : [];

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

  // Current balance: naturally computed when overrideActive; legacy snapshot override otherwise
  const currentBalance = (!overrideActive && cfg.bucketBalanceOverride != null) ? cfg.bucketBalanceOverride : balance;
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

// weekMeta: optional week object from buildYear for the event's week.
// When provided, uses the actual scheduled isHighWeek and grossPay so the
// impact calculation stays consistent with computeNet for that same week.
// Falls back to event.weekRotation / projectedGross when weekMeta is absent.
export function calcEventImpact(event, cfg, weekMeta = null) {
  const isDHL = cfg.employerPreset === "DHL";
  const nightDiffPerHour = (isDHL && cfg.dhlNightShift) ? (cfg.nightDiffRate ?? 0) : 0;
  const isWeek2 = weekMeta != null
    ? !!weekMeta.isHighWeek
    : ["6-Day", "Week 2", "Long Week"].includes(event.weekRotation);
  const plannedPattern = isDHL ? getDhlPlannedPattern(cfg, isWeek2) : null;
  // Non-DHL total hours: customWeeklyHours overrides; variable uses long/short; else flat.
  const nonDhlTotalH = cfg.customWeeklyHours != null
    ? cfg.customWeeklyHours
    : cfg.scheduleIsVariable
      ? (isWeek2 ? (cfg.longWeeklyHours || cfg.standardWeeklyHours || 40) : (cfg.standardWeeklyHours || 40))
      : (cfg.standardWeeklyHours || 40);
  // For DHL with customWeeklyHours, the actual shifts worked equals total hours / shift length.
  // plannedPattern.indexes.length only covers the base rotation (may need extra OT shifts to
  // reach the custom target — those are tracked in requiredOtShifts but not in indexes).
  const normalShifts = plannedPattern
    ? (cfg.customWeeklyHours != null
        ? Math.round(cfg.customWeeklyHours / cfg.shiftHours)
        : plannedPattern.indexes.length)
    : nonDhlTotalH / (cfg.shiftHours || 8);
  const normalWeekendHours = plannedPattern ? plannedPattern.weekendHours : 0;
  // Use the actual week's grossPay when available so the impact delta is computed
  // against the same base that computeNet uses for that week.
  const baseGross = weekMeta != null ? weekMeta.grossPay : projectedGross(isWeek2, cfg);
  let grossLost = 0, grossGained = 0, hoursLostForPTO = 0;
  if (event.type === "missed_unpaid") {
    const actualShifts = Math.max(normalShifts - (event.shiftsLost || 0), 0);
    const actualHours = actualShifts * cfg.shiftHours;
    const hasDayResolution = Array.isArray(event.missedDays) && event.missedDays.length > 0;
    const wkndHoursLostFromDays = hasDayResolution ? dhlWeekendHoursFromDays(event.missedDays, cfg.shiftHours) : 0;
    const wkndHoursLostFallback = hasDayResolution
      ? 0
      : dhlWeekendHoursFromShiftCount(event.weekendShifts || 0, isWeek2, cfg);
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
  } else if (event.type === "pto_unapproved") {
    // PTO covers paycheck but absence was unapproved: same gross impact as pto + bucket deducted below
    const ptoH = event.hoursLost || 0, normalH = normalShifts * cfg.shiftHours;
    const normalOT = Math.max(normalH - cfg.otThreshold, 0), actualOT = Math.max(normalH - ptoH - cfg.otThreshold, 0);
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
  const k401ActivationDate = cfg.k401StartDate ? new Date(cfg.k401StartDate) : parseIsoDate(cfg.benefitsStartDate);
  const affectsK401 = weekDate && (!k401ActivationDate || weekDate >= k401ActivationDate);
  return {
    grossLost, grossGained, netLost, netGained, baseGross, hoursLostForPTO,
    bucketHoursDeducted: (event.type === "missed_unapproved" || event.type === "pto_unapproved") ? (event.hoursLost || 0) : 0,
    k401kLost: affectsK401 ? grossLost * cfg.k401Rate : 0,
    k401kMatchLost: affectsK401 ? grossLost * (cfg.employerPreset === "DHL" ? dhlEmployerMatchRate(cfg.k401Rate) : cfg.k401MatchRate) : 0,
    k401kGained: affectsK401 ? grossGained * cfg.k401Rate : 0,
    k401kMatchGained: affectsK401 ? grossGained * (cfg.employerPreset === "DHL" ? dhlEmployerMatchRate(cfg.k401Rate) : cfg.k401MatchRate) : 0
  };
}
