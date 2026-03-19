import { FED_BRACKETS, PTO_RATE, QUARTER_BOUNDARIES } from "../constants/config.js";

// ─────────────────────────────────────────────────────────────
// PURE FUNCTIONS — all stateless, no component dependencies
// ─────────────────────────────────────────────────────────────

function toLocalIso(date) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, "0"), d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
export { toLocalIso };

export function fedTax(income) {
  let tax = 0, prev = 0;
  for (const [limit, rate] of FED_BRACKETS) { if (income <= prev) break; tax += (Math.min(income, limit) - prev) * rate; prev = limit; }
  return tax;
}

export function buildYear(cfg) {
  const weeks = [], k401Start = new Date(cfg.k401StartDate), taxedSet = new Set(cfg.taxedWeeks);
  let d = new Date(2026, 0, 5), idx = 0;
  while (d <= new Date(2027, 0, 4)) {
    const weekEnd = new Date(d), weekStart = new Date(d);
    weekStart.setDate(weekStart.getDate() - 7);
    const isWeek2 = idx % 2 === 0;
    const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(x.getDate() + i); return x; });
    const worked = isWeek2 ? [days[1], days[2], days[3], days[4], days[5], days[6]] : [days[0], days[2], days[3], days[4]];
    const totalHours = worked.length * cfg.shiftHours;
    const regularHours = Math.min(totalHours, cfg.otThreshold);
    const overtimeHours = Math.max(totalHours - cfg.otThreshold, 0);
    const weekendHours = worked.filter(w => w.getDay() === 0 || w.getDay() === 6).length * cfg.shiftHours;
    const grossPay = regularHours * cfg.baseRate + overtimeHours * cfg.baseRate * cfg.otMultiplier + weekendHours * cfg.diffRate;
    const active = idx >= cfg.firstActiveIdx;
    const has401k = active && weekEnd >= k401Start;
    const k401kEmployee = has401k ? grossPay * cfg.k401Rate : 0;
    const k401kEmployer = has401k ? grossPay * cfg.k401MatchRate : 0;
    const taxableGross = active ? grossPay - cfg.ltd - k401kEmployee : 0;
    const isTaxed = active && taxedSet.has(idx);
    weeks.push({
      idx, weekEnd, weekStart, rotation: isWeek2 ? "6-Day" : "4-Day",
      workedDayNames: worked.map(w => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][w.getDay()]),
      totalHours, regularHours, overtimeHours, weekendHours,
      grossPay: active ? grossPay : 0, taxableGross, active, has401k, k401kEmployee, k401kEmployer, taxedBySchedule: isTaxed
    });
    d.setDate(d.getDate() + 7); idx++;
  }
  return weeks;
}

export function computeNet(w, cfg, extraPerCheck, showExtra) {
  if (!w.active) return 0;
  const fica = w.grossPay * cfg.ficaRate, ded = cfg.ltd + w.k401kEmployee;
  if (!w.taxedBySchedule) return w.grossPay - fica - ded;
  const isW2 = w.rotation === "6-Day";
  const fed = w.taxableGross * (isW2 ? cfg.w2FedRate : cfg.w1FedRate) + (showExtra ? extraPerCheck : 0);
  const st = w.taxableGross * (isW2 ? cfg.w2StateRate : cfg.w1StateRate);
  return w.grossPay - fed - st - fica - ded;
}

export function projectedGross(isWeek2, cfg) {
  const ns = isWeek2 ? 6 : 4, totalH = ns * cfg.shiftHours;
  const reg = Math.min(totalH, cfg.otThreshold), ot = Math.max(totalH - cfg.otThreshold, 0);
  const wknd = isWeek2 ? 2 * cfg.shiftHours : 0;
  return reg * cfg.baseRate + ot * cfg.baseRate * cfg.otMultiplier + wknd * cfg.diffRate;
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
  const nonTransfer = expenses.filter(e => e.category !== "Transfers");
  let total = 0;
  for (const week of futureWeeks) {
    const pi = getPhaseIndex(week.weekEnd);
    for (const exp of nonTransfer) total += getEffectiveAmount(exp, week.weekEnd, pi);
  }
  return { totalRemainingSpend: total, avgWeeklySpend: total / futureWeeks.length, weekCount: futureWeeks.length };
}

export function computeGoalTimeline(activeGoals, futureWeeks, weeklyIncome, expenses, logNetLost, logNetGained) {
  if (!futureWeeks.length || !activeGoals.length)
    return activeGoals.map(g => ({ ...g, sW: 0, eW: 0, wN: 0 }));
  const n = futureWeeks.length;
  const perWeekLost = logNetLost / n, perWeekGain = (logNetGained ?? 0) / n;
  const remaining = activeGoals.map(g => g.target);
  const startWeek = activeGoals.map(() => null);
  const endWeek = activeGoals.map(() => null);
  let weekOffset = 0;
  for (const week of futureWeeks) {
    const pi = getPhaseIndex(week.weekEnd);
    let spend = 0;
    for (const exp of expenses.filter(e => e.category !== "Transfers"))
      spend += getEffectiveAmount(exp, week.weekEnd, pi);
    let surplus = weeklyIncome - spend - perWeekLost + perWeekGain;
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
    const wN = ew !== null ? ew - sw : remaining[i] / Math.max(weeklyIncome - 0.01, 0.01);
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

export function calcEventImpact(event, cfg) {
  const isWeek2 = event.weekRotation === "6-Day" || event.weekRotation === "Week 2"; // "Week 2" kept for backward compat with stored data
  const normalShifts = isWeek2 ? 6 : 4, normalWeekendShifts = isWeek2 ? 2 : 0;
  const baseGross = projectedGross(isWeek2, cfg);
  let grossLost = 0, grossGained = 0, hoursLostForPTO = 0;
  if (event.type === "missed_unpaid") {
    const actualShifts = Math.max(normalShifts - (event.shiftsLost || 0), 0);
    const actualHours = actualShifts * cfg.shiftHours;
    const actualWknd = Math.max(normalWeekendShifts - (event.weekendShifts || 0), 0);
    const actualReg = Math.min(actualHours, cfg.otThreshold), actualOT = Math.max(actualHours - cfg.otThreshold, 0);
    const actualGross = actualReg * cfg.baseRate + actualOT * cfg.baseRate * cfg.otMultiplier + actualWknd * cfg.shiftHours * cfg.diffRate;
    grossLost = Math.max(baseGross - actualGross, 0); hoursLostForPTO = (event.shiftsLost || 0) * cfg.shiftHours;
  } else if (event.type === "pto") {
    const ptoH = event.ptoHours || 0, normalH = normalShifts * cfg.shiftHours;
    const normalOT = Math.max(normalH - cfg.otThreshold, 0), actualOT = Math.max(normalH - ptoH - cfg.otThreshold, 0);
    grossLost = ptoH * (cfg.baseRate - PTO_RATE) + (normalOT - actualOT) * cfg.baseRate * (cfg.otMultiplier - 1);
  } else if (event.type === "missed_unapproved") {
    // Same gross/PTO math as partial — hours missed × base rate; bucket hit tracked separately
    grossLost = (event.hoursLost || 0) * cfg.baseRate; hoursLostForPTO = event.hoursLost || 0;
  } else if (event.type === "partial") {
    grossLost = (event.hoursLost || 0) * cfg.baseRate; hoursLostForPTO = event.hoursLost || 0;
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
    k401kMatchLost: affectsK401 ? grossLost * cfg.k401MatchRate : 0,
    k401kGained: affectsK401 ? grossGained * cfg.k401Rate : 0,
    k401kMatchGained: affectsK401 ? grossGained * cfg.k401MatchRate : 0
  };
}
