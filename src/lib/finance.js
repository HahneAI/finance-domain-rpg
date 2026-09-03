import { FED_BRACKETS, QUARTER_BOUNDARIES, DHL_PRESET, FISCAL_YEAR_START, TOTAL_FISCAL_WEEKS, PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { STATE_TAX_TABLE } from "../constants/stateTaxTable.js";
import { exactWeeklyCost } from "./expense.js";

// ─────────────────────────────────────────────────────────────
// PURE FUNCTIONS — all stateless, no component dependencies
// ─────────────────────────────────────────────────────────────

function toLocalIso(date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export { toLocalIso };

const _MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function _ordinal(d) {
  const v = d % 100;
  return d + ((v >= 11 && v <= 13) ? "th" : (["th","st","nd","rd"][d % 10] ?? "th"));
}

// Formats an ISO date string or Date object as "June 17th, 2027".
export function fmtFullDate(dateOrIso) {
  if (!dateOrIso) return "";
  let y, m, d;
  if (typeof dateOrIso === "string") {
    [y, m, d] = dateOrIso.split("-").map(Number);
  } else {
    y = dateOrIso.getFullYear(); m = dateOrIso.getMonth() + 1; d = dateOrIso.getDate();
  }
  return `${_MONTH_FULL[m - 1]} ${_ordinal(d)}, ${y}`;
}

// Formats a loan ISO date string. Year is omitted when the date falls within the
// current fiscal year (isoStr <= fiscalYearEnd).
export function fmtLoanDate(isoStr, fiscalYearEnd) {
  if (!isoStr) return "";
  const [y, m, d] = isoStr.split("-").map(Number);
  const showYear = !fiscalYearEnd || isoStr > fiscalYearEnd;
  return `${_MONTH_FULL[m - 1]} ${_ordinal(d)}${showYear ? `, ${y}` : ""}`;
}

const _FY_YEAR = parseInt(FISCAL_YEAR_START.split('-')[0]);
const _MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Sortable YYYY-MM key for a Date within the fiscal year.
export function fiscalMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Display label for a fiscal month. Months outside the fiscal year's primary
// calendar year get a short-year suffix (e.g. "Jan '27") so they sort to the
// bottom of year-end charts rather than collapsing into the January position.
export function fiscalMonthLabel(date) {
  const yr = date.getFullYear();
  return _MONTH_SHORT[date.getMonth()] + (yr !== _FY_YEAR ? ` '${String(yr).slice(2)}` : "");
}

// Goals project out at most this many years from today (a rolling window — since
// it's measured from "today" at call time, not a fixed constant, the reachable
// horizon date advances by one day for every real day that passes, with no code
// change needed). Applies only to the flat-rate estimate below, which is the sole
// path a goal's ETA can land in a future fiscal year through (see TODO.md §9 —
// the underlying fiscal-week engine itself is still single-year, so this is a
// display/estimate-level cap, not a claim that a real per-week simulation exists
// out to 5 years).
export const GOAL_PROJECTION_HORIZON_YEARS = 5;

// The rolling cutoff date itself: `today` + GOAL_PROJECTION_HORIZON_YEARS. Exported
// so callers needing "is this date within the goal-projection horizon" (e.g. a
// future goal-target-date input) can reuse the exact same cutoff estimateGoalNextYear
// applies, rather than re-deriving it.
export function getGoalProjectionHorizonDate(today = new Date()) {
  const horizon = new Date(today);
  horizon.setFullYear(horizon.getFullYear() + GOAL_PROJECTION_HORIZON_YEARS);
  return horizon;
}

// Projects a goal that won't complete in the current fiscal year into a future one.
// Uses Q4/December deductions and expenses as the next-year proxy:
//   - Paycheck deductions: benefits + 401k derived from cfg (fully active all next year)
//   - Expenses: Q4 weekly total; December values take priority if they differ from Q4
//   - Taxes: standard withholding assumed (no extra withholding, taxExemptOptIn ignored)
// The flat weekly surplus this derives is assumed constant for every future week —
// so the resulting estDate is valid at any distance, but only within
// GOAL_PROJECTION_HORIZON_YEARS of `today` (passed in, defaults to now): beyond that,
// `withinHorizon` comes back false and callers should show "beyond N-year horizon"
// rather than a specific date nobody should trust that far out.
// `weeklyLogAdjustment` (default 0) folds in logged Bonus/Extra Pay, Tips/Commission,
// and loss events — WITHOUT it, this estimate is completely blind to the Log panel:
// a goal that doesn't finish within the current fiscal year (the only case this
// function is ever consulted for — see HomePanel's resolveGoalFinishInfo) would show
// an ETA that never moves no matter what gets logged, while a goal finishing within
// the current year (computeGoalTimeline's own real per-week simulation) already
// reflects every log entry correctly. Callers MUST pass the same
// (logNetGained - logNetLost) / futureWeeks.length rate computeGoalTimeline itself
// uses to smear logged events (its perWeekGain - perWeekLost) — computing a second,
// differently-derived adjustment here would just trade one drift bug for another.
// Returns { estDate, weeksFromFYStart, label, weeklyNet, weeklyExpenses, weeklySurplus,
// withinHorizon, horizonDate } or null if surplus is non-positive or inputs are invalid.
export function estimateGoalNextYear(remainingAmount, cfg, expenses, today = new Date(), weeklyLogAdjustment = 0) {
  if (!Number.isFinite(remainingAmount) || remainingAmount <= 0 || !cfg) return null;

  const isEmployerDHL = cfg.employerPreset === "DHL";
  const longGross  = projectedGross(true,  cfg);
  const shortGross = projectedGross(false, cfg);

  // Flat per-week deductions — same in Q4 and December (no date dependency on cfg fields)
  const benefitDed  = weeklyBenefitDeductions(cfg);
  const otherPostTax = otherPostTaxDeductions(cfg);
  const k401Rate    = cfg.k401Rate ?? 0;
  const ficaRate    = cfg.ficaRate ?? 0.0765;

  // Tax rates — standard withholding, no exemption
  const fedLow  = cfg.fedRateLow   ?? cfg.w1FedRate   ?? 0.0784;
  const fedHigh = cfg.fedRateHigh  ?? cfg.w2FedRate   ?? 0.1283;
  const stLow   = cfg.stateRateLow  ?? cfg.w1StateRate ?? 0.0338;
  const stHigh  = cfg.stateRateHigh ?? cfg.w2StateRate ?? 0.040;

  const weekNet = (gross, isHighWeek) => {
    const k401 = gross * k401Rate;
    const fica  = gross * ficaRate;
    const taxable = Math.max(gross - benefitDed - k401, 0);
    const fed = taxable * (isHighWeek ? fedHigh : fedLow);
    const st  = taxable * (isHighWeek ? stHigh  : stLow);
    return gross - fica - fed - st - benefitDed - k401 - otherPostTax;
  };

  // DHL alternates long (high) / short (low) weeks; average both for a representative week
  const avgWeeklyNet = isEmployerDHL
    ? (weekNet(longGross, true) + weekNet(shortGross, false)) / 2
    : weekNet(shortGross, false);

  // Q4 expenses — phase 3, mid-November representative date
  // December expenses — phase 3 still, but history-aware lookup may pick up a newer entry
  // December takes priority when it differs from the rest of Q4 (best passover proxy)
  const Q4_PHASE = 3;
  const q4Date  = new Date(_FY_YEAR, 10, 15); // Nov 15 — Q4 non-December
  const decDate = new Date(_FY_YEAR, 11, 15); // Dec 15 — December
  const q4Exp  = (expenses ?? []).reduce((s, e) => s + getEffectiveAmount(e, q4Date,  Q4_PHASE), 0);
  const decExp = (expenses ?? []).reduce((s, e) => s + getEffectiveAmount(e, decDate, Q4_PHASE), 0);
  const weeklyExpenses = Math.abs(decExp - q4Exp) > 0.001 ? decExp : q4Exp;

  const weeklySurplus = avgWeeklyNet - weeklyExpenses + (weeklyLogAdjustment || 0);
  if (weeklySurplus <= 0) return null;

  const weeksNeeded = Math.ceil(remainingAmount / weeklySurplus);
  const [fy, fm, fd] = FISCAL_YEAR_START.split('-').map(Number);
  const nextFYStart = new Date(fy + 1, fm - 1, fd);
  const estDate = new Date(nextFYStart);
  estDate.setDate(estDate.getDate() + weeksNeeded * 7);

  const horizonDate = getGoalProjectionHorizonDate(today);

  return {
    estDate,
    weeksFromFYStart: weeksNeeded,
    label: fiscalMonthLabel(estDate),
    weeklyNet: avgWeeklyNet,
    weeklyExpenses,
    weeklySurplus,
    withinHorizon: estDate <= horizonDate,
    horizonDate,
  };
}

function parseIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Estimate a typical weekly gross from a config-shaped object — does not
// require a built week object. Used by SetupWizard's live net preview (before
// buildYear() has anything to read) and the Quick Rate Update modal's
// before/after diff (TODO §1.D).
export function estimateWeeklyGross(d) {
  const isEmployerDHL = d.employerPreset === "DHL";
  if (isEmployerDHL) {
    // Delegate to projectedGross() — the same long/short-week rotation, custom-hours,
    // weekend-diff, and night-diff formula buildYear() itself uses — instead of a second,
    // hand-rolled approximation. The prior version here hardcoded a stale 4-shift/5-shift
    // (48h/60h) rotation guess that no longer matched DHL_PRESET's actual 3-shift/4-shift
    // (36h/48h) rotation, and omitted diffRate/nightDiffRate entirely — a real drift bug
    // (docs/drift-app-warden.md §7 F6) that overstated the DHL Wrap Up preview by hundreds
    // of dollars/week. Delegating makes this structurally unable to diverge from buildYear.
    return (projectedGross(true, d) + projectedGross(false, d)) / 2;
  }
  // Base user: flat ceiling. customWeeklyHours overrides maxWeeklyHours; standardWeeklyHours is legacy fallback.
  const h = d.customWeeklyHours ?? d.maxWeeklyHours ?? d.standardWeeklyHours ?? 40;
  const base = d.baseRate || 0;
  const nightDiff = d.nightDiffEnabled === true ? (d.nightDiffRate ?? 0) : 0;
  const effectiveOtThreshold = d.otThreshold ?? h;
  const reg = Math.min(h, effectiveOtThreshold);
  const ot = Math.max(h - effectiveOtThreshold, 0);
  return reg * (base + nightDiff) + ot * (base + nightDiff) * (d.otMultiplier || 1.5);
}

// Estimate a typical weekly net (+ the deduction breakdown) from a config-shaped
// object. Shared by SetupWizard's StepWrapUp live preview and the Quick Rate
// Update modal's before/after diff (TODO §1.D) — keep both callers reading
// the same formula rather than letting two independent "estimated net"
// implementations drift.
export function estimateWeeklyNet(cfg) {
  const gross = estimateWeeklyGross(cfg);
  const fica     = gross * (cfg.ficaRate || 0.0765);
  const k401k    = gross * (cfg.k401Rate || 0);
  const baseBenefits =
    (cfg.healthPremium || 0) + (cfg.dentalPremium || 0) +
    (cfg.visionPremium || 0) + (cfg.stdWeekly || 0) +
    (cfg.lifePremium || 0)   + (cfg.hsaWeekly || 0) +
    (cfg.fsaWeekly || 0)     + (cfg.ltd || 0);
  const benefitsStart = cfg.benefitsStartDate ? new Date(cfg.benefitsStartDate) : null;
  const benefitsActive = !benefitsStart || Number.isNaN(benefitsStart.getTime()) || benefitsStart <= new Date();
  const checksPerYear = PAYCHECKS_PER_YEAR[cfg.userPaySchedule ?? "weekly"] ?? 52;
  const perWeekFactor = checksPerYear / 52; // weekly deduction factor (e.g. 0.5 for biweekly)
  const benefits = benefitsActive ? baseBenefits * perWeekFactor : 0;
  const otherPerCheck = (cfg.otherDeductions || []).reduce((s, r) => s + (r.perCheckAmount ?? r.weeklyAmount ?? 0), 0);
  const other = otherPerCheck * perWeekFactor;
  const fed   = gross * (cfg.fedRateLow || 0);
  const state = gross * (cfg.stateRateLow || 0);
  const net   = gross - fica - k401k - benefits - other - fed - state;
  return { gross, fica, k401k, benefits, other, fed, state, net };
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
    const amt = row?.perCheckAmount ?? row?.weeklyAmount;
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
  if (cfg.dhlSite === "WAREHOUSE") {
    // Warehouse: fixed team days, same every week — isLongWeek is meaningless here.
    return [...(DHL_PRESET.warehouseTeams[cfg.dhlTeam] ?? DHL_PRESET.warehouseTeams.MT).days];
  }
  if (cfg.dhlCustomSchedule) {
    return (isLongWeek ? CUSTOM_LONG_DAY_INDEXES : CUSTOM_SHORT_DAY_INDEXES).slice();
  }
  return buildStandardDhlDayIndexes(cfg, isLongWeek);
}

function getDhlRotationLabel(isLongWeek) {
  const meta = isLongWeek ? DHL_PRESET.rotation.long : DHL_PRESET.rotation.short;
  return meta.displayName || meta.label || (isLongWeek ? "Long Week" : "Short Week");
}

function resolveDhlWeeklyHours(cfg, isLongWeek, rotationHours) {
  const perWeekTypeHours = isLongWeek ? cfg.customWeeklyHoursLong : cfg.customWeeklyHoursShort;
  if (perWeekTypeHours != null) return perWeekTypeHours;
  if (cfg.customWeeklyHours != null) return cfg.customWeeklyHours;
  return rotationHours;
}

function getDhlPlannedPattern(cfg, isLongWeek) {
  const indexes = getDhlPlannedDayIndexes(cfg, isLongWeek);
  const totalHours = indexes.length * cfg.shiftHours;
  const weekendHours = indexes.reduce((sum, idx) => sum + dhlWeekendHoursPerDayIndex(idx, cfg.shiftHours), 0);
  if (cfg.dhlSite === "WAREHOUSE") {
    // No rotation, so no custom-hours-extension concept (v1 scope) — always the fixed team pattern.
    const rotationLabel = (DHL_PRESET.warehouseTeams[cfg.dhlTeam] ?? DHL_PRESET.warehouseTeams.MT).label;
    return { indexes, totalHours, weekendHours, rotationLabel, requiredOtShifts: 0 };
  }
  const rotationLabel = getDhlRotationLabel(isLongWeek);
  let requiredOtShifts;
  const resolvedHours = resolveDhlWeeklyHours(cfg, isLongWeek, totalHours);
  const hasCustomTarget = !cfg.dhlCustomSchedule && (
    cfg.customWeeklyHoursLong != null ||
    cfg.customWeeklyHoursShort != null ||
    cfg.customWeeklyHours != null
  );
  if (hasCustomTarget) {
    // Custom hours: additional OT shifts = (weekly target − already-scheduled rotation hours) / shift length.
    // Uses rotationHours (indexes already include the default OT day) so requiredOtShifts represents
    // only the EXTRA shifts beyond the existing schedule needed to reach the custom target.
    // e.g. customWeeklyHours=60: long (5 days×12=60h) → 0 extra; short (4 days×12=48h) → 1 extra.
    requiredOtShifts = Math.max(0, Math.round((resolvedHours - totalHours) / cfg.shiftHours));
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
//     requiredOtShifts = 0 — no mandatory OT; extra shifts are optional pickups.
//
//   DHL custom hours (customWeeklyHours set, !dhlCustomSchedule)
//     Same rotation day arrays for workedDayNames / WeekConfirmModal display.
//     totalHours overridden to customWeeklyHours for all projection math.
//     requiredOtShifts = (customWeeklyHours − coreHours) / shiftHours per week —
//     "schedule extension" shifts needed to reach the custom target (not OT).
//
//   DHL legacy (dhlCustomSchedule: true) — kept until db.js migration window closes.
//     Uses hardcoded CUSTOM_LONG/SHORT_DAY_INDEXES. requiredOtShifts = 0.
//     If customWeeklyHours is ALSO set, totalHours is still overridden below.
//
//   Standard / base user (!employerPreset)
//     Flat customWeeklyHours ?? maxWeeklyHours ?? standardWeeklyHours hours/week, no rotation.
//     rotation = "Custom" when customWeeklyHours is set, "Standard" otherwise.
//
// Note: cfg.dhlNightShift is stored but NOT used here — weekend diff (diffRate)
//   applies equally to all shifts. Night differential is tracked separately.

// Returns the date within [weekStart, weekStart+6] that matches payPeriodEndDay.
// weekStart is always Monday (JS getDay() === 1).
// payPeriodEndDay convention: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
// Formula: Mon=offset 0, Tue=1, ..., Sat=5, Sun=6 → (payPeriodEndDay - 1 + 7) % 7.
export function getPayPeriodEndDate(weekStart, payPeriodEndDay) {
  const offset = (payPeriodEndDay - 1 + 7) % 7;
  const result = new Date(weekStart);
  result.setDate(result.getDate() + offset);
  return result;
}

// Resolves the baseRate actually in effect for a given week, from a sorted-or-
// unsorted rateHistory list of { effectiveFrom: "YYYY-MM-DD", baseRate }. Mirrors
// getEffectiveAmount's exact algorithm (latest entry with effectiveFrom <= the
// target date) so this reads as one consistent point-in-time pattern rather than
// a second one invented from scratch. Falls back to liveBaseRate — never 0 —
// when no entry covers the date: that's the correct behavior both for weeks
// before any recorded rate change (nothing to look up yet) and for the instant
// after a fresh edit, before its own history row has round-tripped into memory
// (the live config IS the newest truth at that point).
//
// TODO §1.D / §3: a deliberately narrow slice of the deferred Master Timeline
// read-path — scoped to baseRate only, not a general point-in-time config
// resolver. Every other historically-sensitive field (schedule, tax rates,
// benefits, ...) still applies uniformly to every week, past and future, exactly
// as before. Don't read this as §3 being "done" — only this one field's gap
// (the one Quick Rate Update surfaced) is closed.
export function resolveBaseRateForWeek(rateHistory, weekEnd, liveBaseRate) {
  if (!rateHistory?.length) return liveBaseRate;
  const iso = toLocalIso(weekEnd);
  let best = null;
  for (const entry of rateHistory) {
    if (entry.effectiveFrom <= iso && (best === null || entry.effectiveFrom >= best.effectiveFrom))
      best = entry;
  }
  return best ? best.baseRate : liveBaseRate;
}

export function buildYear(cfg, baseRateHistory = null) {
  const weeks = [], k401Start = cfg.k401StartDate ? new Date(cfg.k401StartDate) : null, taxedSet = new Set(cfg.taxedWeeks);
  const isEmployerDHL = cfg.employerPreset === "DHL";
  const benefitsStart = parseIsoDate(cfg.benefitsStartDate);
  // New Job Season (TODO §1.C): when active, weeks on/after newJobSeasonDate have
  // earned income forced to $0. Benefits/401k naturally fall to $0 too because
  // grossPay drives them. Historical weeks before newJobSeasonDate are untouched.
  // §1.C6: returnToWorkDate, when set, ends New Job Season at that boundary —
  // weeks on/after returnToWorkDate resume normal earned-income math.
  const newJobSeasonStart = cfg.newJobSeasonMode ? parseIsoDate(cfg.newJobSeasonDate) : null;
  const returnToWork = cfg.newJobSeasonMode ? parseIsoDate(cfg.returnToWorkDate) : null;
  // Biweekly/salary: parity determines which idx%2 value marks a pay week.
  // Falls back to firstActiveIdx%2 when the user hasn't answered the wizard question.
  const isBiweeklyOrSalary = cfg.userPaySchedule === "biweekly" || cfg.userPaySchedule === "salary";
  const biweeklyParity = isBiweeklyOrSalary
    ? (cfg.biweeklyPayWeekParity ?? ((cfg.firstActiveIdx ?? 0) % 2))
    : null;
  // Loop bound is TOTAL_FISCAL_WEEKS (constants/config.js) — derived from
  // FISCAL_YEAR_START by the identical day-count arithmetic, so this loop
  // can't silently drift out of sync with anything else that needs "the real
  // number of weeks in the fiscal-week grid" the way it once did (see that
  // constant's comment for the incident this fixed).
  const [fyY, fyM, fyD] = FISCAL_YEAR_START.split('-').map(Number);
  let d = new Date(fyY, fyM - 1, fyD), idx = 0;
  while (idx < TOTAL_FISCAL_WEEKS) {
    const weekEnd = new Date(d), weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - 7);

    let totalHours, regularHours, overtimeHours, weekendHours, grossPay, worked, rotation, rotationLabel = null, requiredOtShifts = 0, isHighWeek, adminRotationTag = null;

    if (isEmployerDHL) {
      // DHL: alternating long (preset) / short from firstActiveIdx.
      // (offset%2+2)%2 handles negative offsets (pre-employment weeks) correctly.
      const offset = ((idx - cfg.firstActiveIdx) % 2 + 2) % 2;
      isHighWeek = offset === 0 ? !!cfg.startingWeekIsLong : !cfg.startingWeekIsLong;
      // Warehouse: fixed schedule, no long/short alternation — the offset/parity math
      // above is meaningless here, so force it off. Financially inert: isHighWeek only
      // ever selects fedHigh/fedLow in computeNet(), and PaystubCalc always writes
      // fedRateHigh === fedRateLow when scheduleIsVariable is false (Warehouse's case).
      if (cfg.dhlSite === "WAREHOUSE") isHighWeek = false;
      const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(x.getDate() + i); return x; });
      rotation = cfg.dhlSite === "WAREHOUSE"
        ? (DHL_PRESET.warehouseTeams[cfg.dhlTeam] ?? DHL_PRESET.warehouseTeams.MT).label
        : (isHighWeek ? "6-Day" : "4-Day");
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
      if (!cfg.dhlCustomSchedule) {
        const resolvedHours = resolveDhlWeeklyHours(cfg, isHighWeek, totalHours);
        const targetShifts = Math.round(resolvedHours / cfg.shiftHours);
        if (targetShifts < worked.length) {
          // Trim rotation to target shifts: preserve weekend days (Sat/Sun > Fri > core weekdays),
          // dropping the default OT day first, then non-weekend core days.
          const otDayDow = getStandardDhlOtDay(isHighWeek, cfg);
          const shiftPriority = (date) => {
            const dow = date.getDay();
            if (dow === 6 || dow === 0) return 3;
            if (dow === 5) return 2;
            if (otDayDow != null && dow === otDayDow) return 0;
            return 1;
          };
          worked = [...worked].sort((a, b) => shiftPriority(b) - shiftPriority(a)).slice(0, targetShifts);
          weekendHours = worked.reduce((sum, day) => sum + dhlWeekendHoursForDate(day, cfg.shiftHours), 0);
        }
        totalHours = resolvedHours;
      }
    } else {
      // Standard / base user path.
      isHighWeek = false;
      worked = [];
      const customHrs = cfg.customWeeklyHours;
      totalHours = customHrs ?? cfg.maxWeeklyHours ?? cfg.standardWeeklyHours ?? 40;
      rotation = customHrs != null ? "Custom" : "Standard";
      rotationLabel = rotation;
      adminRotationTag = rotation;
      weekendHours = 0;
    }

    const effectiveOtThreshold = cfg.otThreshold ?? totalHours;
    regularHours = Math.min(totalHours, effectiveOtThreshold);
    overtimeHours = Math.max(totalHours - effectiveOtThreshold, 0);
    // OT: all differentials (weekend + night) are included in the 1.5× multiplier.
    // Non-weekend shifts come earlier in the week; weekend (Fri+) begin at hour nonWeekendH+1,
    // so weekend hours that push past the 40h threshold are fully at OT rate.
    const nonWeekendH = totalHours - weekendHours;
    const regWkndH = Math.max(0, Math.min(weekendHours, effectiveOtThreshold - nonWeekendH));
    const otWkndH  = weekendHours - regWkndH;
    const nightDiffHr = resolveNightDiffPerHour(cfg);
    // Point-in-time baseRate (TODO §1.D / §3 narrow slice — see resolveBaseRateForWeek):
    // a rate change only recomputes weeks from its effective date forward; weeks before it
    // keep resolving to whatever baseRate was actually in effect at the time.
    const weekBaseRate = resolveBaseRateForWeek(baseRateHistory, weekEnd, cfg.baseRate);
    grossPay = regularHours  * (weekBaseRate + nightDiffHr)
             + regWkndH      * cfg.diffRate
             + overtimeHours * (weekBaseRate + nightDiffHr) * cfg.otMultiplier
             + otWkndH       * cfg.diffRate * cfg.otMultiplier;

    // New Job Season boundary: collapse earned-income inputs to zero from the
    // loss date forward so all downstream math (taxable gross, 401k, benefits
    // deduction, net) cascades naturally. Closes at returnToWorkDate (§1.C6)
    // so projected income resumes from that week onward.
    const inNewJobSeason = newJobSeasonStart
      && weekEnd >= newJobSeasonStart
      && (!returnToWork || weekEnd < returnToWork);
    if (inNewJobSeason) {
      totalHours = 0;
      regularHours = 0;
      overtimeHours = 0;
      weekendHours = 0;
      grossPay = 0;
      worked = [];
    }

    // Unemployment benefits (§1.C2): paid weekly during the eligibility
    // window. Treated as non-taxed income — added to net by computeNet.
    let unemploymentIncome = 0;
    if (
      inNewJobSeason
      && cfg.unemploymentEnabled === true
      && (cfg.unemploymentWeekly ?? 0) > 0
      && (cfg.unemploymentDurationWeeks ?? 0) > 0
    ) {
      const weeksSinceLoss = Math.floor((weekEnd - newJobSeasonStart) / (7 * 86400000));
      const offset = cfg.unemploymentWaitingWeek ? 1 : 0;
      if (weeksSinceLoss >= offset && weeksSinceLoss < offset + cfg.unemploymentDurationWeeks) {
        unemploymentIncome = cfg.unemploymentWeekly;
      }
    }

    const active = idx >= cfg.firstActiveIdx && !inNewJobSeason;
    const benefitsActive = !benefitsStart || weekEnd >= benefitsStart;
    const benefitsDeduction = benefitsActive ? weeklyBenefitDeductions(cfg) : 0;
    const k401ActivationDate = k401Start ?? benefitsStart;
    const has401k = active && (!k401ActivationDate || weekEnd >= k401ActivationDate);
    const { k401kEmployee, k401kEmployer, taxableGross } =
      deriveWeekPayComponents(cfg, { grossPay, benefitsDeduction, has401k, active });
    const isTaxed = active && taxedSet.has(idx);
    if (!adminRotationTag) adminRotationTag = rotation;
    const payPeriodEndDate = getPayPeriodEndDate(weekStart, cfg.payPeriodEndDay ?? 0);
    const isPayWeek = active && (!isBiweeklyOrSalary || (idx % 2 === biweeklyParity));
    weeks.push({
      idx, weekEnd, weekStart, payPeriodEndDate, isPayWeek, rotation, isHighWeek, adminRotationTag,
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
      unemploymentIncome,
    });
    d.setDate(d.getDate() + 7); idx++;
  }
  // Monthly: the pay week is the last active week whose weekEnd falls in each calendar month.
  if (cfg.userPaySchedule === "monthly") {
    for (let i = 0; i < weeks.length; i++) {
      if (!weeks[i].active) { weeks[i].isPayWeek = false; continue; }
      const m = weeks[i].weekEnd.getMonth(), y = weeks[i].weekEnd.getFullYear();
      weeks[i].isPayWeek = !weeks.some(w => w.active && w.idx > weeks[i].idx && w.weekEnd.getMonth() === m && w.weekEnd.getFullYear() === y);
    }
  }
  return weeks;
}

/**
 * The one place "which withholding rates apply to this week" is answered.
 *
 * Two field families exist: the generalized fedRateLow/fedRateHigh/
 * stateRateLow/stateRateHigh, and the legacy w1/w2 pair they replaced
 * (constants/config.js still defines both; db.js back-fills fedRateLow FROM
 * w1FedRate on load, so a loaded account always carries both and they agree).
 * Every consumer is therefore obliged to read new-first with a legacy
 * fallback — and calcEventImpact was the one that didn't, reading only the
 * legacy names. A config carrying just the generalized family made its
 * withholdingRate NaN, which silently propagated through netLost/netGained
 * into computeGoalTimeline's per-week surplus and reported every goal as
 * "not on track" — a plausible-looking wrong answer, not a crash.
 *
 * Extracted rather than fixed inline: two hand-maintained copies of this
 * resolution IS the parallel-formula pattern (docs/drift-app-warden.md §12),
 * and fixing one copy while leaving the other free to drift again would only
 * reset the clock. Callers pass the week's own isHighWeek (computeNetBreakdown)
 * or the event's derived isWeek2 (calcEventImpact) — the same boolean.
 *
 * Deliberately no `?? 0` tail: an account missing BOTH families is a broken
 * config, and a loud NaN is safer there than a silent 0% withholding that
 * overstates take-home. This matches what computeNet has always done.
 */
export function resolveWithholdingRates(cfg, isHighWeek) {
  return isHighWeek
    ? { fed: cfg.fedRateHigh ?? cfg.w2FedRate, state: cfg.stateRateHigh ?? cfg.w2StateRate }
    : { fed: cfg.fedRateLow ?? cfg.w1FedRate, state: cfg.stateRateLow ?? cfg.w1StateRate };
}

/**
 * Itemized counterpart to computeNet() — same inputs, same arithmetic, but
 * returns every component instead of only the final scalar. computeNet()
 * below is a thin `.net` accessor over this function, which is the whole
 * point: an itemized week breakdown and the app's authoritative net figure
 * are computed once, here, and cannot drift apart the way a hand-copied
 * second derivation would (docs/drift-app-warden.md's parallel-formula case
 * law; §6's grounding rule).
 *
 * Added for the Coach `get_week_breakdown` tool (docs/coach-entry-points.md
 * §1), which needs the fed/state/FICA/benefits/401k split that computeNet()
 * deliberately collapses. BudgetPanel.jsx's `checkBreakdown` memo is the app's
 * other itemized consumer and now calls this too (converged 2026-09-02) — its
 * old inline copy had drifted to reading `row.weeklyAmount`, a field db.js
 * renames away on load, so the modal silently omitted other deductions for
 * every account. See docs/drift-app-warden.md §21 F166. There is exactly one
 * paycheck derivation in the app; keep it that way.
 *
 * All figures are PER WEEK, matching computeNet()'s own basis — callers that
 * display per-paycheck amounts scale by 52/checksPerYear themselves, exactly
 * as IncomePanel does.
 */
/**
 * Derives the 401k and taxable-gross components of a week from its gross pay.
 *
 * Extracted from buildYear (which is still its only production caller) so a
 * SIMULATED week — "what if I picked up 8 more overtime hours" — can be built
 * from the same rules a real week is, instead of a hand-copied second version
 * that would drift the moment the 401k or taxable-gross rule changed
 * (docs/drift-app-warden.md §12's parallel-formula case law). Coach's
 * `simulate_overtime_hours` tool is the other caller.
 *
 * `has401k` and `active` are passed in rather than derived here because both
 * depend on dates (k401StartDate/benefitsStartDate, firstActiveIdx, New Job
 * Season boundaries) that only the caller knows — a simulated week inherits
 * them from the real week it is based on.
 */
/**
 * Per-hour night differential in effect for this account, or 0.
 *
 * DHL and base users express the same setting through different fields — DHL
 * opts OUT via `dhlNightShift === false` (on by default), a base user opts IN
 * via `nightDiffEnabled === true` (off by default) — so the resolution is not
 * a plain truthiness check and was hand-copied at three call sites (buildYear,
 * projectedGross, calcEventImpact). Extracted when a fourth caller appeared
 * (Coach's `simulate_overtime_hours`), rather than adding one more copy of a
 * rule that has an employer-specific default on each side.
 */
export function resolveNightDiffPerHour(cfg) {
  const enabled = cfg.employerPreset === "DHL"
    ? cfg.dhlNightShift !== false
    : cfg.nightDiffEnabled === true;
  return enabled ? (cfg.nightDiffRate ?? 0) : 0;
}

export function deriveWeekPayComponents(cfg, { grossPay, benefitsDeduction, has401k, active }) {
  const k401kEmployee = has401k ? grossPay * cfg.k401Rate : 0;
  // DHL match is formula-driven (tiered); other employers use stored flat k401MatchRate.
  const effectiveMatchRate = cfg.employerPreset === "DHL"
    ? dhlEmployerMatchRate(cfg.k401Rate)
    : cfg.k401MatchRate;
  return {
    k401kEmployee,
    k401kEmployer: has401k ? grossPay * effectiveMatchRate : 0,
    taxableGross: active ? Math.max(grossPay - benefitsDeduction - k401kEmployee, 0) : 0,
  };
}

export function computeNetBreakdown(w, cfg, extraPerCheck, showExtra) {
  // Unemployment benefits (§1.C2) are non-taxed at the engine layer — withholding
  // is optional and out of scope for v1. Surfaces on every week regardless of
  // active state so the user sees benefit income even though the job-loss week
  // isn't "active" in the employment sense.
  const unemployment = w.unemploymentIncome ?? 0;
  const base = {
    active: !!w.active,
    taxedBySchedule: !!w.taxedBySchedule,
    isHighWeek: !!w.isHighWeek,
    grossPay: 0,
    taxableGross: 0,
    federalTax: 0,
    stateTax: 0,
    fica: 0,
    benefits: 0,
    k401Employee: 0,
    otherPostTax: 0,
    unemploymentIncome: unemployment,
  };
  if (!w.active) return { ...base, net: unemployment };

  const fica = w.grossPay * cfg.ficaRate;
  const payrollDeductions = deriveWeeklyPayrollDeductions(w, cfg);
  const ded = payrollDeductions.total;
  const otherPostTax = otherPostTaxDeductions(cfg);
  const common = {
    ...base,
    grossPay: w.grossPay,
    taxableGross: w.taxableGross ?? 0,
    fica,
    benefits: payrollDeductions.benefits,
    k401Employee: payrollDeductions.k401Employee,
    otherPostTax,
  };
  if (!w.taxedBySchedule) {
    return { ...common, net: (w.grossPay - fica - ded) - otherPostTax + unemployment };
  }
  const rates = resolveWithholdingRates(cfg, w.isHighWeek);
  const fed = w.taxableGross * rates.fed + (showExtra ? extraPerCheck : 0);
  const st = w.taxableGross * rates.state;
  return {
    ...common,
    federalTax: fed,
    stateTax: st,
    net: (w.grossPay - fed - st - fica - ded) - otherPostTax + unemployment,
  };
}

export function computeNet(w, cfg, extraPerCheck, showExtra) {
  return computeNetBreakdown(w, cfg, extraPerCheck, showExtra).net;
}

export function projectedGross(isWeek2, cfg) {
  let totalH, wkndH;
  if (cfg.employerPreset === "DHL") {
    const pattern = getDhlPlannedPattern(cfg, isWeek2);
    totalH = resolveDhlWeeklyHours(cfg, isWeek2, pattern.totalHours);
    wkndH = pattern.weekendHours;
  } else {
    // Base user: no weekend differential. customWeeklyHours overrides everything.
    wkndH = 0;
    totalH = cfg.customWeeklyHours ?? cfg.maxWeeklyHours ?? cfg.standardWeeklyHours ?? 40;
  }
  const effectiveOtThreshold = cfg.otThreshold ?? totalH;
  const reg = Math.min(totalH, effectiveOtThreshold), ot = Math.max(totalH - effectiveOtThreshold, 0);
  const nonWkndH = totalH - wkndH;
  const regWknd = Math.max(0, Math.min(wkndH, effectiveOtThreshold - nonWkndH));
  const otWknd  = wkndH - regWknd;
  const nightDiff = resolveNightDiffPerHour(cfg);
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

// Returns the quarter index (0–3) for a "YYYY-MM" month key.
export function phaseIdxForMonth(monthKey) {
  return getPhaseIndex(new Date(`${monthKey}-15`));
}

// Resolves the per-paycheck amount for a specific calendar month.
// Checks monthlyOverrides first; falls back to the history-based resolver
// using the 15th of the month as the representative date.
export function getEffectiveAmountForMonth(expense, monthKey, phaseIdx) {
  const override = expense.monthlyOverrides?.[monthKey];
  if (override != null) return override.perPaycheck ?? 0;
  return getEffectiveAmount(expense, new Date(`${monthKey}-15`), phaseIdx);
}

// Exact ("penny-true") counterpart to getEffectiveAmountForMonth — used only
// by backend totals (computeRemainingSpend, computeGoalTimeline, the budget
// breakdown's Annual/Weekly/Monthly columns), never by front-facing bill
// card/preview displays, which stay on the rounded 48-week-year math above
// (product decision, 2026-08-31 — see expense.js's exactWeeklyCost comment).
//
// Every monthlyOverrides entry stores its own {amount, cycle} alongside the
// rounded perPaycheck (every writer in expense.js does this — applyMonthEdit,
// applyMonthEditForward, applyQuarterForward, applyAllQuarters, clearMonth*),
// so this re-derives an exact weekly figure straight from that entry's own
// amount/cycle instead of its rounded perPaycheck.
//
// Deliberately does NOT fall back to expense.billingMeta for a month with no
// override — aiContext.js's resolveWeeklyCost carries a real incident scar
// over exactly that shortcut (billingMeta.amount is "value entered on the
// form," not necessarily the current figure — it went stale against
// monthlyOverrides once already and reported numbers off by double digits).
// Absent an override, this falls back to the same history-based resolver
// getEffectiveAmountForMonth uses — still the rounded 48-week figure, since
// history[] stores only the already-rounded weekly value with no amount/
// cycle to re-derive from. Known scope limit: expenses added via "ALL QTR"
// (BudgetPanel.jsx's addExpAllQuarters, history-only, no monthlyOverrides)
// don't get the exact treatment until/unless they're edited through a scope
// that does write monthlyOverrides.
export function getExactEffectiveAmountForMonth(expense, monthKey, phaseIdx) {
  const override = expense.monthlyOverrides?.[monthKey];
  if (override != null) return exactWeeklyCost(override.amount, override.cycle);
  return getEffectiveAmountForMonth(expense, monthKey, phaseIdx);
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
    const monthKey = toLocalIso(week.weekEnd).slice(0, 7);
    // Exact math (see getExactEffectiveAmountForMonth) — this total feeds Home's
    // "Left This Week", Coach's grounding, and budget health, all real financial
    // figures, not front-facing bill-card mental math.
    for (const exp of expenses) total += getExactEffectiveAmountForMonth(exp, monthKey, pi);
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
  freedomAllowancePerWeek = 0,
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
      freedomAllowancePerWeek,
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
  const spendableNets = weeklyNets.map(n => n - freedomAllowancePerWeek);
  const projectedAnnualNet = weeklyNets.reduce((sum, n) => sum + n, 0);
  // Divide by the weeks actually active, not a flat 52 (TODO §1, 2026-07-19)
  // — same fix as App.jsx's weeklyIncome, mirrored here so this trace explains
  // the real production formula instead of the diluted one it replaced.
  const weeklyIncome = activeWeeks.length > 0 ? projectedAnnualNet / activeWeeks.length - freedomAllowancePerWeek : -freedomAllowancePerWeek;
  add(
    "computeNet + weeklyIncome",
    "Transform weekly gross/tax data into spendable weekly income.",
    {
      projectedAnnualNet,
      activeWeekCount: activeWeeks.length,
      averageNetBeforeFreedomAllowance: activeWeeks.length > 0 ? projectedAnnualNet / activeWeeks.length : 0,
      freedomAllowancePerWeek,
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

export function computeGoalTimeline(activeGoals, futureWeeks, weeklyNets, expenses, logNetLost, logNetGained, futureEventDeductions = {}, timelineEpochIdx = null) {
  if (!futureWeeks.length || !activeGoals.length)
    return activeGoals.map(g => ({ ...g, sW: 0, eW: 0, wN: 0 }));
  const n = futureWeeks.length;
  // ── Past-event smear: exclude future-week deductions (handled per-week below) ──
  const futureDeductionTotal = Object.values(futureEventDeductions).reduce((a, b) => a + b, 0);
  const perWeekLost = (logNetLost - futureDeductionTotal) / n, perWeekGain = (logNetGained ?? 0) / n;
  const remaining = activeGoals.map(g => g.target);
  const startWeek = activeGoals.map(() => null);
  const endWeek = activeGoals.map(() => null);
  // ── Timeline epoch: when set (via the "Reset Timeline" action), no surplus funds
  // goals until the simulation reaches this fiscal week idx. Re-anchors the whole
  // funding sequence to the user's next paycheck. Null = fund from the first future week.
  const hasEpoch = Number.isFinite(timelineEpochIdx);
  let totalSurplus = 0;
  let eligibleWeeks = 0;
  let weekOffset = 0;
  for (const week of futureWeeks) {
    const pi = getPhaseIndex(week.weekEnd);
    const monthKey = toLocalIso(week.weekEnd).slice(0, 7);
    let spend = 0;
    // Exact math (see getExactEffectiveAmountForMonth) — goal ETAs are a
    // longer-term projection, not front-facing bill-card mental math.
    for (const exp of expenses)
      spend += getExactEffectiveAmountForMonth(exp, monthKey, pi);
    // ── Targeted deduction: current/future-week events hit their specific week ──
    const weekDeduction = futureEventDeductions[week.idx] ?? 0;
    let surplus = (weeklyNets[weekOffset] ?? 0) - weekDeduction - spend - perWeekLost + perWeekGain;
    const beforeEpoch = hasEpoch && Number.isFinite(week.idx) && week.idx < timelineEpochIdx;
    if (!beforeEpoch) {
      totalSurplus += surplus;
      eligibleWeeks++;
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
    }
    weekOffset++;
  }
  const avgSurplus = totalSurplus / Math.max(eligibleWeeks, 1);
  return activeGoals.map((g, i) => {
    const sw = startWeek[i] ?? 0, ew = endWeek[i] ?? null;
    const wN = ew !== null ? ew - sw : remaining[i] / Math.max(avgSurplus - 0.01, 0.01);
    // remainingAtEnd: amount still unfunded after the full fiscal year simulation.
    // Non-zero only when eW === null (goal never completes within futureWeeks).
    return { ...g, sW: sw, eW: ew, wN, remainingAtEnd: remaining[i] };
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
  ) + 1; // firstPaymentDate itself is payment #1
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

// DHL preset only. Encodes DHL's specific tier system (Tier 1–4), 18h/month perfect-attendance
// bonus, and overflow payout mechanic. payoutRate is a DHL-exclusive concept — do not port
// this to general attendance tracking for base users.
export function computeBucketModel(logs, cfg) {
  const payoutRate = cfg.bucketPayoutRate ?? (cfg.baseRate / 2); // DHL-only: bucket overflow earns pay
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

// Resolves an event's real fiscal weekIdx (or null if unset/unmatched) plus
// its matching week object from allWeeks. event.weekIdx is "" on a blank/
// unresolved form (LogPanel's resolveWeek()) — Number("") and Number(null)
// both evaluate to 0, so a naive Number(event.weekIdx) silently misattributes
// an unresolved event to week 0 instead of excluding it. Every caller that
// needs "does this event have a real week" should go through here rather
// than re-deriving it, so that answer stays one fact in one place.
export function resolveEventWeekMeta(event, allWeeks) {
  const raw = event.weekIdx;
  const hasWeekIdx = raw !== "" && raw != null && Number.isFinite(Number(raw));
  const weekIdx = hasWeekIdx ? Number(raw) : null;
  const weekMeta = weekIdx != null ? ((allWeeks ?? []).find(w => w.idx === weekIdx) ?? null) : null;
  return { weekIdx, weekMeta };
}

// weekMeta: optional week object from buildYear for the event's week.
// When provided, uses the actual scheduled isHighWeek and grossPay so the
// impact calculation stays consistent with computeNet for that same week.
// Falls back to event.weekRotation / projectedGross when weekMeta is absent.
export function calcEventImpact(event, cfg, weekMeta = null) {
  const isEmployerDHL = cfg.employerPreset === "DHL";
  const nightDiffPerHour = resolveNightDiffPerHour(cfg);
  const isWeek2 = weekMeta != null
    ? !!weekMeta.isHighWeek
    : ["6-Day", "Week 2", "Long Week"].includes(event.weekRotation);
  const plannedPattern = isEmployerDHL ? getDhlPlannedPattern(cfg, isWeek2) : null;
  const resolvedDhlHours = plannedPattern ? resolveDhlWeeklyHours(cfg, isWeek2, plannedPattern.totalHours) : null;
  // Base user total hours: customWeeklyHours overrides; variable uses long/short; else flat.
  const nonDhlTotalH = cfg.customWeeklyHours ?? cfg.maxWeeklyHours ?? cfg.standardWeeklyHours ?? 40;
  // For DHL with customWeeklyHours, the actual shifts worked equals total hours / shift length.
  // plannedPattern.indexes.length only covers the base rotation (may need extra OT shifts to
  // reach the custom target — those are tracked in requiredOtShifts but not in indexes).
  const normalShifts = plannedPattern
    ? (resolvedDhlHours != null
        ? Math.round(resolvedDhlHours / cfg.shiftHours)
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
    const effectiveOtThreshold = cfg.otThreshold ?? Infinity;
    const actualRegWkndH = Math.max(0, Math.min(actualWkndH, effectiveOtThreshold - actualNonWkndH));
    const actualOTWkndH  = actualWkndH - actualRegWkndH;
    const actualReg = Math.min(actualHours, effectiveOtThreshold), actualOT = Math.max(actualHours - effectiveOtThreshold, 0);
    const actualGross = actualReg      * (cfg.baseRate + nightDiffPerHour)
                      + actualRegWkndH * cfg.diffRate
                      + actualOT       * (cfg.baseRate + nightDiffPerHour) * cfg.otMultiplier
                      + actualOTWkndH  * cfg.diffRate * cfg.otMultiplier;
    grossLost = Math.max(baseGross - actualGross, 0); hoursLostForPTO = (event.shiftsLost || 0) * cfg.shiftHours;
  } else if (event.type === "pto") {
    const ptoH = event.ptoHours || 0;
    if (event.extraDay) {
      // Extra PTO day outside the normal schedule → additional pay beyond the
      // projection, earned at the flat base rate (no schedule hours replaced).
      grossGained = ptoH * cfg.baseRate;
    } else {
      const normalH = normalShifts * cfg.shiftHours;
      const _ot = cfg.otThreshold ?? Infinity;
      const normalOT = Math.max(normalH - _ot, 0), actualOT = Math.max(normalH - ptoH - _ot, 0);
      // PTO pays at baseRate; night diff applies to hours worked only — both deltas included
      grossLost = ptoH * nightDiffPerHour + (normalOT - actualOT) * cfg.baseRate * (cfg.otMultiplier - 1);
    }
  } else if (event.type === "pto_unapproved") {
    // PTO covers paycheck but absence was unapproved: same gross impact as pto + bucket deducted below
    const ptoH = event.hoursLost || 0;
    if (event.extraDay) {
      grossGained = ptoH * cfg.baseRate;
    } else {
      const normalH = normalShifts * cfg.shiftHours;
      const _ot = cfg.otThreshold ?? Infinity;
      const normalOT = Math.max(normalH - _ot, 0), actualOT = Math.max(normalH - ptoH - _ot, 0);
      grossLost = ptoH * nightDiffPerHour + (normalOT - actualOT) * cfg.baseRate * (cfg.otMultiplier - 1);
    }
  } else if (event.type === "missed_unapproved") {
    // Hours missed × (base rate + night diff); bucket hit tracked separately
    grossLost = (event.hoursLost || 0) * (cfg.baseRate + nightDiffPerHour); hoursLostForPTO = event.hoursLost || 0;
  } else if (event.type === "partial") {
    grossLost = (event.hoursLost || 0) * (cfg.baseRate + nightDiffPerHour); hoursLostForPTO = event.hoursLost || 0;
  } else if (event.type === "bonus") {
    grossGained = event.amount || 0;
  } else if (event.type === "tips_commission") {
    grossGained = event.amount || 0;
  } else if (event.type === "other_loss") { grossLost = event.amount || 0; }
  // Net impact accounts for FICA always, plus withholding on taxed weeks.
  // Past-week overrides (pastWeekTaxStatusOverrides) take precedence over the
  // scheduled status so net projections stay consistent with the tax plan view.
  // event.weekIdx of "" or null must NOT resolve to week 0 via Number() coercion —
  // an event with no real week has no real tax status to borrow (see
  // resolveEventWeekMeta's comment for why this guard exists).
  const _hasWIdx = event.weekIdx !== "" && event.weekIdx != null && Number.isFinite(Number(event.weekIdx));
  const _wIdx = _hasWIdx ? Number(event.weekIdx) : null;
  const _overrides = cfg.pastWeekTaxStatusOverrides ?? {};
  const isTaxedWeek = _wIdx != null && (
    Object.prototype.hasOwnProperty.call(_overrides, _wIdx)
      ? Boolean(_overrides[_wIdx])
      : (Array.isArray(cfg.taxedWeeks) && cfg.taxedWeeks.includes(_wIdx))
  );
  // resolveWithholdingRates, not the legacy w1/w2 fields directly: reading
  // those alone made this NaN for any config carrying only the generalized
  // rate names (see that function's comment for the full failure path).
  const eventRates = resolveWithholdingRates(cfg, isWeek2);
  const withholdingRate = isTaxedWeek ? eventRates.fed + eventRates.state : 0;
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

// A specific week's spendable net, with any confirmed log-entry adjustments
// for that week folded in (missed shifts, etc.) — the same per-week math
// "This Week's Check" style tiles need, factored out so callers can't drift.
function weekNetWithLogAdjustments(week, cfg, extraPerCheck, showExtra, freedomAllowancePerWeek, logs) {
  const baseNet = computeNet(week, cfg, extraPerCheck, showExtra) - freedomAllowancePerWeek;
  const weekAdjustment = (logs ?? [])
    .filter(e => e.weekIdx === week.idx)
    .reduce((sum, e) => {
      const impact = calcEventImpact(e, cfg, week);
      return sum + impact.netGained - impact.netLost;
    }, 0);
  return baseNet + weekAdjustment;
}

// Resolves the "last finalized paycheck" figure that "This Week's Check" /
// "Left This Week" style tiles read (TODO §1 New Job Season investigation,
// 2026-07-19). Prefers the most recent past active week; when there isn't
// one yet (a brand-new account, or the very first week after Back to Work —
// firstActiveIdx pointing at the current week), falls back to the CURRENT
// active week's real computed net rather than weeklyIncome. weeklyIncome is
// projectedAnnualNet/52 — a full fiscal-year average that's deliberately
// diluted by every inactive $0 week before firstActiveIdx, so on day one of
// a new active period it understates a real paycheck by however much of the
// year hasn't started yet. Only falls back to weeklyIncome when there's no
// active week at all to read (currentWeek null — before firstActiveIdx, or
// mid-Job-Loss-Mode).
export function resolvePrevWeekNet({ allWeeks, todayIso, config, extraPerCheck, showExtra, freedomAllowancePerWeek, weeklyIncome, logs, currentWeek }) {
  const pastWeeks = allWeeks.filter(w => w.active && toLocalIso(w.weekEnd) < todayIso);
  const referenceWeek = pastWeeks.length ? pastWeeks[pastWeeks.length - 1] : (currentWeek?.active ? currentWeek : null);
  if (!referenceWeek) return weeklyIncome;
  return weekNetWithLogAdjustments(referenceWeek, config, extraPerCheck, showExtra, freedomAllowancePerWeek, logs);
}

// ── Net worth health ──────────────────────────────────────────────────────
// "Net worth" in this app is the projected annual savings flow shown on the
// Home "Net Worth Trend" tile (avgWeeklySurplus*52 - fundedGoalSpend), since no
// accumulated balance is stored. We flag a thin cushion when that flow falls
// below 10% of projected annual take-home — i.e. a savings rate under 10%.
// Pure + side-effect free so it can back both the UI gate and unit tests.
export const NET_WORTH_HEALTH_THRESHOLD = 0.10;

export function netWorthHealthStatus(annualSavings, annualIncome) {
  if (!Number.isFinite(annualSavings) || !Number.isFinite(annualIncome) || annualIncome <= 0) {
    return { rate: null, belowThreshold: false };
  }
  const rate = annualSavings / annualIncome;
  return { rate, belowThreshold: rate < NET_WORTH_HEALTH_THRESHOLD };
}
