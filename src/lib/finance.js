import { FED_BRACKETS, PTO_RATE } from "../constants/config.js";

// ─────────────────────────────────────────────────────────────
// PURE FUNCTIONS — all stateless, no component dependencies
// ─────────────────────────────────────────────────────────────

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
      idx, weekEnd, weekStart, rotation: isWeek2 ? "Week 2" : "Week 1",
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
  const isW2 = w.rotation === "Week 2";
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

export function calcEventImpact(event, cfg) {
  const isWeek2 = event.weekRotation === "Week 2";
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
  } else if (event.type === "partial") {
    grossLost = (event.hoursLost || 0) * cfg.baseRate; hoursLostForPTO = event.hoursLost || 0;
  } else if (event.type === "bonus") {
    grossGained = event.amount || 0;
  } else if (event.type === "other_loss") { grossLost = event.amount || 0; }
  const netLost = grossLost * (1 - cfg.ficaRate), netGained = grossGained * (1 - cfg.ficaRate);
  const weekDate = event.weekEnd ? new Date(event.weekEnd) : null;
  const affectsK401 = weekDate && weekDate >= new Date(cfg.k401StartDate);
  return {
    grossLost, grossGained, netLost, netGained, baseGross, hoursLostForPTO,
    k401kLost: affectsK401 ? grossLost * cfg.k401Rate : 0,
    k401kMatchLost: affectsK401 ? grossLost * cfg.k401MatchRate : 0,
    k401kGained: affectsK401 ? grossGained * cfg.k401Rate : 0,
    k401kMatchGained: affectsK401 ? grossGained * cfg.k401MatchRate : 0
  };
}
