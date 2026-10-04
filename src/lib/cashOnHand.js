// Employed Cash on Hand engine (TODO §22 — merged Weekly Cash Check-In + New Job
// Season cash runway). Single source of truth for the Home "Cash on Hand" card,
// the Log panel's Paycheck Credits ledger, and any future Coach context — no
// consumer may re-derive these numbers (drift-app-warden §8, §22 rows).
//
// Model (design decisions locked in TODO §22):
//   cash = user-entered anchor (as of a date)
//        + every paycheck credited since then (confirmed correction, else estimate)
//        − every live Needs bill occurrence due since then (same occurrence walk
//          New Job Season's decay uses — sumBillOccurrencesSince)
// Freedom Allowance is counted (it's real money in the account) and reported
// separately so the card can show it as its own line.
import { PAYCHECKS_PER_YEAR } from "../constants/config.js";
import { getExactEffectiveAmountForMonth, getPhaseIndex, isExpenseRemoved, toLocalIso } from "./finance.js";
import { listBillOccurrencesSince, sumBillOccurrencesSince } from "./newJobSeasonRunway.js";

// A paycheck is credited the day after its pay period closes — the same moment
// the pay-period check-in becomes due (App.jsx isPayPeriodPast, base-user rule),
// so a credit and its check-in prompt always appear together.
export function resolvePaycheckCreditIso(week) {
  const d = new Date(week.payPeriodEndDate);
  d.setDate(d.getDate() + 1);
  return toLocalIso(d);
}

// The active weeks a pay week's check covers: itself (weekly), itself + the
// prior week (biweekly/salary — WeekConfirmModal's two-week period), or every
// active week ending in the same month (monthly — buildYear marks the month's
// last active week as the pay week).
export function resolvePayPeriodWeeks(payWeek, allWeeks, userPaySchedule) {
  const sched = userPaySchedule ?? "weekly";
  if (sched === "biweekly" || sched === "salary") {
    const prior = allWeeks.find(w => w.idx === payWeek.idx - 1);
    return prior?.active ? [prior, payWeek] : [payWeek];
  }
  if (sched === "monthly") {
    const m = payWeek.weekEnd.getMonth();
    const y = payWeek.weekEnd.getFullYear();
    return allWeeks.filter(w => w.active && w.idx <= payWeek.idx && w.weekEnd.getMonth() === m && w.weekEnd.getFullYear() === y);
  }
  return [payWeek];
}

// Needs-per-check: exactly the "Needs" category total the Upkeep panel shows
// (BudgetPanel overview: regular Needs expenses + every loan, each at
// getExactEffectiveAmountForMonth for the month/phase, × perCheckFactor).
// Parity is pinned by src/test/lib/cashOnHand.test.js — change both or neither.
export function computeNeedsSetAsidePerCheck(expenses, todayIso, userPaySchedule) {
  const today = new Date(todayIso + "T12:00:00");
  const monthKey = todayIso.slice(0, 7);
  const phaseIdx = getPhaseIndex(today);
  const checksPerYear = PAYCHECKS_PER_YEAR[userPaySchedule ?? "weekly"] ?? 52;
  const perCheckFactor = 52 / checksPerYear;
  const weekly = (expenses ?? [])
    .filter(e => e.type === "loan" || e.category === "Needs")
    .reduce((s, e) => s + getExactEffectiveAmountForMonth(e, monthKey, phaseIdx), 0);
  return { weeklyNeeds: weekly, perCheck: weekly * perCheckFactor, perCheckFactor, checksPerYear };
}

export const ORANGE_BAND_MIN = 200;
export const ORANGE_BAND_PCT = 0.2;

// Every live (not deleted/zeroed-forward) Needs bill or loan counts against cash.
function isLiveNeedsBill(exp, todayIso) {
  return (exp.type === "loan" || exp.category === "Needs") && !isExpenseRemoved(exp, todayIso);
}

/**
 * @returns null when the user hasn't set a starting balance yet (card shows the
 * setup prompt) or when New Job Season mode owns cash on hand instead.
 */
export function computeCashOnHand({ config, expenses, allWeeks, weekNetLookup, weekConfirmations, effectiveToday }) {
  if (!config || config.newJobSeasonMode || !effectiveToday) return null;
  const anchor = config.cashOnHandAnchor;
  const asOf = config.cashOnHandAnchorAsOf;
  if (anchor == null || !asOf) return null;

  const sched = config.userPaySchedule ?? "weekly";
  const corrections = config.cashOnHandCreditCorrections ?? {};
  const faPerCheck = (config.freedomAllowanceEnabled ?? true) ? (config.freedomAllowance ?? 50) : 0;

  const credits = [];
  for (const w of allWeeks ?? []) {
    if (!w.active || !w.isPayWeek) continue;
    const dateIso = resolvePaycheckCreditIso(w);
    if (dateIso <= asOf || dateIso > effectiveToday) continue;
    const periodWeeks = resolvePayPeriodWeeks(w, allWeeks, sched);
    const estimate = periodWeeks.reduce((s, pw) => s + (weekNetLookup?.[pw.idx]?.adjustedNet ?? 0), 0);
    const correction = corrections[w.idx];
    const confirmed = !!weekConfirmations?.[w.idx];
    credits.push({
      weekIdx: w.idx,
      dateIso,
      periodStartIso: toLocalIso(periodWeeks[0].weekStart),
      periodEndIso: toLocalIso(w.payPeriodEndDate),
      estimate,
      amount: correction != null ? correction : estimate,
      corrected: correction != null,
      status: confirmed ? "confirmed" : "pending",
      freedomAllowance: faPerCheck,
    });
  }
  credits.sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1)); // newest first

  const creditsTotal = credits.reduce((s, c) => s + c.amount, 0);
  const pending = credits.filter(c => c.status === "pending");
  const billsDueSince = sumBillOccurrencesSince(expenses, asOf, effectiveToday, isLiveNeedsBill);
  const cashOnHand = anchor + creditsTotal - billsDueSince;

  const setAside = computeNeedsSetAsidePerCheck(expenses, effectiveToday, sched);
  const gap = cashOnHand - setAside.perCheck;
  // Traffic light (TODO §22.B; thresholds set by Anthony 2026-10-03):
  //   green  — cash covers this period's Needs set-aside.
  //   orange — short by up to max($200, 20% of the set-aside): "tighten up".
  //   red    — short by more than that band, OR (rule (b), per-bill) a specific
  //            Needs bill due before the next payday can't be covered by the
  //            cash on hand, walking upcoming bills in due-date order.
  const orangeBand = Math.max(ORANGE_BAND_MIN, setAside.perCheck * ORANGE_BAND_PCT);
  const nextPayWeek = (allWeeks ?? [])
    .filter(w => w.active && w.isPayWeek)
    .map(w => ({ w, iso: resolvePaycheckCreditIso(w) }))
    .filter(x => x.iso > effectiveToday)
    .sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0))[0] ?? null;
  const nextPaydayIso = nextPayWeek?.iso ?? null;
  // The amount that payday will credit, estimated exactly the way a credit's
  // `estimate` is above (sum of the pay period's adjustedNet) — TODO §22.F
  // passes it to the Cyborg Resource snapshot; never re-derive it elsewhere.
  const nextPaycheckEstimate = nextPayWeek
    ? resolvePayPeriodWeeks(nextPayWeek.w, allWeeks, sched)
      .reduce((s, pw) => s + (weekNetLookup?.[pw.idx]?.adjustedNet ?? 0), 0)
    : null;
  const dayBefore = (iso) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() - 1); return toLocalIso(d); };
  const upcomingBills = nextPaydayIso
    ? listBillOccurrencesSince(expenses, effectiveToday, dayBefore(nextPaydayIso), isLiveNeedsBill)
      .sort((a, b) => (a.dueIso < b.dueIso ? -1 : a.dueIso > b.dueIso ? 1 : 0))
    : [];
  let running = cashOnHand;
  let atRiskBill = null;
  for (const o of upcomingBills) {
    running -= o.amount;
    if (running < 0) { atRiskBill = { id: o.expense.id, label: o.expense.label, dueIso: o.dueIso, amount: o.amount }; break; }
  }
  const status = atRiskBill ? "red" : gap >= 0 ? "green" : (-gap <= orangeBand ? "orange" : "red");

  // Secondary "if paychecks stopped" line — NJS-style cash ÷ Needs burn.
  const ifStoppedWeeks = setAside.weeklyNeeds > 0 ? Math.max(0, cashOnHand) / setAside.weeklyNeeds : null;

  return {
    anchor,
    asOf,
    credits,
    creditsTotal,
    pendingCount: pending.length,
    pendingTotal: pending.reduce((s, c) => s + c.amount, 0),
    freedomAllowanceIncluded: credits.reduce((s, c) => s + c.freedomAllowance, 0),
    billsDueSince,
    cashOnHand,
    setAside: setAside.perCheck,
    weeklyNeeds: setAside.weeklyNeeds,
    gap,
    status,
    orangeBand,
    atRiskBill,
    nextPaydayIso,
    nextPaycheckEstimate,
    dueBeforePayday: upcomingBills.reduce((t, o) => t + o.amount, 0),
    ifStoppedWeeks,
  };
}
