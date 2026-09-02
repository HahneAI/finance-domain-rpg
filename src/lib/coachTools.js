// §2.G — Coach's drill-down tool surface (docs/coach-entry-points.md §1).
//
// WHY TOOLS AT ALL: buildCoachContext() ships a fixed ~20-line snapshot in a
// prompt-cached system block. That block can only ever carry summary lines —
// growing it to hold every expense's override history, every week's tax
// split, and the full log would balloon the cached prefix for every user on
// every call, and it's exactly the "too many numbers, stated loosely" failure
// DW-19 caught live (docs/coach-personality-rubric.md, Known Limitations).
// These four tools let Coach fetch the depth on demand instead.
//
// WHERE THEY RUN: entirely in the browser. The model emits a tool_use block,
// lib/claude.js executes it against the data the panel already holds, and
// sends a tool_result back. Nothing new crosses the network, no new Vercel
// serverless function is added (the deployment sits at 12/12 on the Hobby
// cap — see CLAUDE.md), and the user's data never leaves the device beyond
// the specific figures Coach asked for.
//
// THE GROUNDING RULE (docs/active-systems.md §6, and the reason this file is
// mostly thin wrappers): every figure returned here MUST resolve through the
// same authoritative function the on-screen panel uses — computeGoalTimeline,
// getExactEffectiveAmountForMonth, computeNetBreakdown, calcEventImpact. Not
// one number below is re-derived locally. A tool that quietly recomputes a
// figure its own way is a parallel formula, which is the app's single most
// expensive documented failure mode (docs/drift-app-warden.md §12).

import {
  computeGoalTimeline,
  computeNetBreakdown,
  calcEventImpact,
  resolveEventWeekMeta,
  getExactEffectiveAmountForMonth,
  getEffectiveAmountForMonth,
  getPhaseIndex,
  computeLoanPayoffDate,
  loanPaymentsRemaining,
  loanWeeklyAmount,
  fmtFullDate,
} from "./finance.js";
import {
  getFiscalWeekNumber,
  FISCAL_WEEKS_PER_YEAR,
  getPayPeriodBounds,
  payPeriodUnit,
  weekNumToPaycheckNum,
} from "./fiscalWeek.js";
import { getNextDueDate, getExpenseDisplayAmount, getExpenseDisplaySuffix, normalizeCycle } from "./expense.js";
import { EVENT_TYPES, PAYCHECKS_PER_YEAR } from "../constants/config.js";

// ── Tool schemas ────────────────────────────────────────────────────────
// Sent as the `tools` array on every Coach request. Static by construction:
// tool definitions sit AHEAD of `system` in Anthropic's cache hierarchy, so
// a frozen array like this caches cleanly alongside the persona prompt. Never
// build this list per-user or per-query — a varying prefix invalidates the
// cache for the system blocks behind it too, which is the same reason
// coachFeatureGuide.js is a static block rather than a retrieval step.
export const COACH_TOOLS = [
  {
    name: "get_goal_detail",
    description:
      "Get the full funding timeline for one of the user's active goals, by its funding-priority rank (1 = funded first). Use when the user asks about a specific goal's pace, finish date, or why it's taking as long as it is. Goals are identified by rank only — you never receive a goal's name.",
    input_schema: {
      type: "object",
      properties: {
        rank: {
          type: "integer",
          description: "Funding-priority rank, 1-based. Goal 1 absorbs surplus first.",
        },
      },
      required: ["rank"],
    },
  },
  {
    name: "get_expense_detail",
    description:
      "Get the full detail for one of the user's expenses or loans by its label: current cost, billing cycle, next due date, any month-specific overrides, and (for loans) payoff timeline. Use when the user asks about a specific bill rather than their spending overall.",
    input_schema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "The expense's label as shown in the app, e.g. \"Rent\". Matched case-insensitively.",
        },
      },
      required: ["label"],
    },
  },
  {
    name: "get_week_breakdown",
    description:
      "Get the itemized paycheck receipt for one pay period: gross pay, hours worked, overtime, federal and state tax, FICA, benefits, 401k, and final take-home. Use when the user asks why a specific check is high or low, or what came out of it.",
    input_schema: {
      type: "object",
      properties: {
        weekOffset: {
          type: "integer",
          description:
            "Which week relative to the current one. 0 = this week, -1 = last week, 1 = next week. Defaults to 0.",
        },
      },
      required: [],
    },
  },
  {
    name: "list_log_entries",
    description:
      "List the user's logged events (missed shifts, PTO, bonuses, tips/commission, other income changes) with each one's real dollar impact. Use when the user asks what they've logged, or what caused a change in their numbers.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: Object.keys(EVENT_TYPES),
          description: "Optional — restrict to a single event type.",
        },
        limit: {
          type: "integer",
          description: "How many of the most recent entries to return. Defaults to 10, capped at 25.",
        },
      },
      required: [],
    },
  },
];

export const COACH_TOOL_NAMES = COACH_TOOLS.map((t) => t.name);

// ── Per-surface tool sets ───────────────────────────────────────────────
// Module-level constants, never built per-render: the array is serialized
// into the request body, and a set that varies between calls would keep
// invalidating the cached prefix behind it.
//
// A surface may only offer a tool whose data it actually holds. Handing the
// model a tool it can't ground would produce an `error` result at best and an
// invented number at worst — the exact failure the grounding rule exists to
// prevent.
export const ASK_COACH_TOOLS = COACH_TOOLS;

// Job Hunt Assistant is mounted inside NewJobSeasonHomePanel, which receives
// only { config, expenses, effectiveToday, currentWeek } — no goals, logs,
// futureWeeks or allWeeks. So it offers the one tool that grounds cleanly on
// that data, which is also the one its mode actually calls for: "what can I
// cut to stretch runway" is an expense question. The other three are Ask
// Coach's territory by design — that mode coaches the search itself, not the
// household numbers (see JOB_HUNT_ADDENDUM in coachPrompts.js). Widening this
// set means threading the missing props through NewJobSeasonHomePanel first;
// do that deliberately, not by adding a name to this array.
export const JOB_HUNT_TOOLS = COACH_TOOLS.filter((t) => t.name === "get_expense_detail");

// ── Shared helpers ──────────────────────────────────────────────────────

const round2 = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

// Mirrors aiContext.js's own formatPeriodWithDate() intent: Coach's prompt
// requires a full-month-name date paired with the period number, in the unit
// this account's pay schedule actually uses. Returned as separate fields
// rather than a prose string so the model composes the sentence itself.
function periodLabels(weekIdx, allWeeks, checksPerYear) {
  const weekNumber = getFiscalWeekNumber(weekIdx);
  if (weekNumber == null) return { date: null, period: null, unit: payPeriodUnit(checksPerYear, "lower") };
  const bounds = getPayPeriodBounds(weekIdx, allWeeks);
  return {
    date: bounds
      ? (checksPerYear === 52
        ? `the week of ${fmtFullDate(bounds.start)}`
        : `${fmtFullDate(bounds.start)}–${fmtFullDate(bounds.end)}`)
      : null,
    period: weekNumToPaycheckNum(weekNumber, checksPerYear) ?? weekNumber,
    unit: payPeriodUnit(checksPerYear, "lower"),
  };
}

const checksPerYearFor = (config) => PAYCHECKS_PER_YEAR[config?.userPaySchedule ?? "weekly"] ?? 52;

// ── Tool implementations ────────────────────────────────────────────────

function toolGetGoalDetail({ rank }, data) {
  const { goals = [], futureWeeks = [], timelineWeekNets = [], expenses = [], logNetLost = 0,
    logNetGained = 0, futureEventDeductions = {}, config = null, currentWeek = null, allWeeks = [] } = data;
  const activeGoals = goals.filter((g) => !g.completed);
  if (!activeGoals.length) return { error: "No active goals are set right now." };

  const idx = Number(rank) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= activeGoals.length) {
    return { error: `Rank must be between 1 and ${activeGoals.length}. There are ${activeGoals.length} active goals.` };
  }

  // Same call, same args, same epoch as HomePanel.jsx and aiContext.js — the
  // goal cards, the context block, and this tool cannot disagree.
  const timeline = computeGoalTimeline(
    activeGoals, futureWeeks, timelineWeekNets, expenses, logNetLost, logNetGained,
    futureEventDeductions, config?.goalTimelineEpochIdx ?? null
  );
  const g = timeline[idx];
  const checksPerYear = checksPerYearFor(config);
  const onTrack = Number.isFinite(g.eW);
  const periods = onTrack
    ? (checksPerYear === 52 ? g.wN : g.wN / (FISCAL_WEEKS_PER_YEAR / checksPerYear))
    : null;
  const finish = onTrack && currentWeek?.idx != null
    ? periodLabels(currentWeek.idx + Math.ceil(g.eW), allWeeks, checksPerYear)
    : null;

  return {
    rank: idx + 1,
    ofTotalActiveGoals: activeGoals.length,
    targetAmount: round2(g.target),
    onTrackThisFiscalYear: onTrack,
    projectedPerPeriodFunding: onTrack && periods > 0 ? round2(g.target / periods) : null,
    periodsToFund: onTrack ? round2(periods) : null,
    payPeriodUnit: payPeriodUnit(checksPerYear, "lower"),
    projectedFinishDate: finish?.date ?? null,
    projectedFinishPeriodNumber: finish?.period ?? null,
    stillUnfundedAtFiscalYearEnd: onTrack ? 0 : round2(g.remainingAtEnd),
    fundingPosition: idx === 0
      ? "This goal is first in line — it absorbs surplus before any other goal."
      : `Goals ranked 1 through ${idx} fund before this one; nothing reaches it until they're fully funded.`,
    note: "Goal names are withheld from you for privacy — refer to this as a rank unless the user names it themselves.",
  };
}

function toolGetExpenseDetail({ label }, data) {
  const { expenses = [], today = null } = data;
  const needle = String(label ?? "").trim().toLowerCase();
  if (!needle) return { error: "A label is required." };

  const active = expenses.filter((e) => (e.newJobSeasonStatus ?? "active") === "active");
  const exp = active.find((e) => (e.label ?? "").trim().toLowerCase() === needle)
    ?? active.find((e) => (e.label ?? "").trim().toLowerCase().includes(needle));
  if (!exp) {
    return {
      error: `No active expense matching "${label}".`,
      availableLabels: active.map((e) => e.label ?? "Unnamed"),
    };
  }

  const monthKey = today ? today.slice(0, 7) : null;
  const phaseIdx = today ? getPhaseIndex(new Date(`${today}T12:00:00`)) : null;
  // getExactEffectiveAmountForMonth is the same resolver computeRemainingSpend
  // and computeGoalTimeline use for real totals — deliberately NOT
  // billingMeta.amount, which is only "the value typed on the add form" and
  // has already gone stale against monthlyOverrides in a live incident
  // (aiContext.js's resolveWeeklyCost carries the same scar).
  const weeklyCost = monthKey != null && phaseIdx != null
    ? getExactEffectiveAmountForMonth(exp, monthKey, phaseIdx)
    : null;
  const nextDue = today ? getNextDueDate(exp, new Date(`${today}T12:00:00`)) : null;

  const out = {
    label: exp.label ?? "Unnamed",
    kind: exp.type === "loan" ? "loan" : "expense",
    category: exp.category ?? (exp.type === "loan" ? "Loan" : "Needs"),
    billedAmount: round2(getExpenseDisplayAmount(exp)),
    billedPer: getExpenseDisplaySuffix(exp),
    effectiveWeeklyCost: round2(weeklyCost),
    effectiveMonthlyCost: round2(weeklyCost != null ? weeklyCost * (52 / 12) : null),
    nextDueDate: nextDue ? fmtFullDate(nextDue) : null,
  };

  if (exp.type !== "loan") out.billingCycle = normalizeCycle(exp.billingMeta?.cycle);

  // Month-specific overrides are the single most common reason a bill's real
  // cost differs from the amount the user remembers entering — the main thing
  // the summary line in the context block cannot show.
  const overrides = exp.monthlyOverrides ?? {};
  const overrideMonths = Object.keys(overrides).sort();
  if (overrideMonths.length) {
    out.monthSpecificOverrides = overrideMonths.map((mk) => ({
      month: mk,
      weeklyCost: round2(getExactEffectiveAmountForMonth(exp, mk, getPhaseIndex(new Date(`${mk}-15`)))),
    }));
  }
  if (Array.isArray(exp.history) && exp.history.length > 1) {
    out.costChangeHistory = exp.history
      .slice()
      .sort((a, b) => (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""))
      .map((h) => ({
        effectiveFrom: h.effectiveFrom,
        weeklyByQuarter: (h.weekly ?? []).map(round2),
      }));
  }

  if (exp.type === "loan" && exp.loanMeta) {
    const payoff = computeLoanPayoffDate(exp);
    out.loan = {
      totalAmount: round2(exp.loanMeta.totalAmount),
      paymentAmount: round2(exp.loanMeta.paymentAmount),
      paymentFrequency: exp.loanMeta.paymentFrequency,
      weeklyEquivalent: round2(loanWeeklyAmount(exp.loanMeta)),
      paymentsRemaining: loanPaymentsRemaining(exp),
      projectedPayoffDate: payoff ? fmtFullDate(payoff) : null,
    };
  }
  return out;
}

function toolGetWeekBreakdown({ weekOffset = 0 }, data) {
  const { allWeeks = [], currentWeek = null, config = null, logs = [],
    extraPerCheck = 0, showExtra = false } = data;
  if (!allWeeks.length || !currentWeek) return { error: "No pay weeks are built for this account yet." };

  const offset = Number.isInteger(Number(weekOffset)) ? Number(weekOffset) : 0;
  const targetIdx = currentWeek.idx + offset;
  const week = allWeeks.find((w) => w.idx === targetIdx);
  if (!week) {
    return { error: `No pay week exists at offset ${offset} (fiscal week index ${targetIdx}).` };
  }

  const checksPerYear = checksPerYearFor(config);
  // Every week object is per-week; IncomePanel displays per-paycheck by
  // scaling with this same factor, so the tool mirrors the panel rather than
  // handing Coach a figure no screen in the app actually shows.
  const perCheckFactor = 52 / checksPerYear;
  const b = computeNetBreakdown(week, config, extraPerCheck, showExtra);
  const scale = (n) => round2((n ?? 0) * perCheckFactor);

  // Log entries land on a specific week and move that week's real take-home —
  // same calcEventImpact call weekNetWithLogAdjustments() makes internally.
  const weekLogs = (logs ?? []).filter((e) => e.weekIdx === week.idx);
  const adjustment = weekLogs.reduce((sum, e) => {
    const impact = calcEventImpact(e, config, week);
    return sum + impact.netGained - impact.netLost;
  }, 0);

  const labels = periodLabels(week.idx, allWeeks, checksPerYear);
  return {
    date: labels.date,
    periodNumber: labels.period,
    payPeriodUnit: labels.unit,
    isPayWeek: !!week.isPayWeek,
    active: b.active,
    rotation: week.rotationLabel ?? week.rotation ?? null,
    hours: {
      total: round2(week.totalHours),
      regular: round2(week.regularHours),
      overtime: round2(week.overtimeHours),
      weekend: round2(week.weekendHours),
      daysWorked: week.workedDayNames ?? [],
    },
    grossPay: scale(b.grossPay),
    taxedOnSchedule: b.taxedBySchedule,
    deductions: {
      federalTax: scale(b.federalTax),
      stateTax: scale(b.stateTax),
      fica: scale(b.fica),
      benefits: scale(b.benefits),
      k401Employee: scale(b.k401Employee),
      otherPostTax: scale(b.otherPostTax),
    },
    unemploymentIncome: scale(b.unemploymentIncome),
    takeHomeBeforeLoggedEvents: scale(b.net),
    loggedEventAdjustment: scale(adjustment),
    takeHome: scale(b.net + adjustment),
    loggedEventsThisPeriod: weekLogs.map((e) => EVENT_TYPES[e.type]?.label ?? e.type),
    note: b.taxedBySchedule
      ? null
      : "This period is exempt from the tax schedule, so no federal or state withholding came out of it.",
  };
}

function toolListLogEntries({ type = null, limit = 10 }, data) {
  const { logs = [], config = null, allWeeks = [] } = data;
  let rows = Array.isArray(logs) ? logs.slice() : [];
  if (type) {
    if (!EVENT_TYPES[type]) return { error: `Unknown event type "${type}".`, validTypes: Object.keys(EVENT_TYPES) };
    rows = rows.filter((e) => e.type === type);
  }
  if (!rows.length) {
    return { entries: [], totalMatching: 0, note: type ? `Nothing logged of type "${type}".` : "Nothing logged yet." };
  }

  const cap = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const sorted = rows.sort((a, b) => (b.weekEnd ?? "").localeCompare(a.weekEnd ?? ""));
  const checksPerYear = checksPerYearFor(config);

  const entries = sorted.slice(0, cap).map((e) => {
    // resolveEventWeekMeta, not a local allWeeks.find(): an unresolved event
    // carries weekIdx === "", which Number() turns into 0 and would silently
    // misattribute the entry to fiscal week 0 (finance.js says every caller
    // needing this answer must go through that helper so it stays one fact).
    const { weekMeta: week } = resolveEventWeekMeta(e, allWeeks);
    // Same impact call LogPanel's own effect display uses — never a
    // re-derived "hours times rate" estimate.
    const impact = calcEventImpact(e, config, week);
    const labels = week ? periodLabels(week.idx, allWeeks, checksPerYear) : null;
    return {
      type: EVENT_TYPES[e.type]?.label ?? e.type,
      weekEnding: e.weekEnd ? fmtFullDate(e.weekEnd) : null,
      periodNumber: labels?.period ?? null,
      netImpact: round2(impact.netGained - impact.netLost),
      note: e.note || null,
    };
  });

  return {
    entries,
    totalMatching: sorted.length,
    shown: entries.length,
    combinedNetImpactOfShown: round2(entries.reduce((s, e) => s + (e.netImpact ?? 0), 0)),
  };
}

const HANDLERS = {
  get_goal_detail: toolGetGoalDetail,
  get_expense_detail: toolGetExpenseDetail,
  get_week_breakdown: toolGetWeekBreakdown,
  list_log_entries: toolListLogEntries,
};

/**
 * Runs one Coach tool against the caller's live data bag — the exact same
 * props AskCoachPanel/JobHuntChatPanel already receive for buildCoachContext(),
 * so no new data plumbing is needed to add tools to a Coach surface.
 *
 * Never throws: a thrown error inside a tool would abort the whole chat turn,
 * so a failure is returned to the model as an `error` field it can explain to
 * the user instead. Returns a plain object; lib/claude.js JSON-stringifies it
 * into the tool_result block.
 */
export function executeCoachTool(name, input, data = {}) {
  const handler = HANDLERS[name];
  if (!handler) return { error: `Unknown tool "${name}".` };
  try {
    return handler(input ?? {}, data);
  } catch (err) {
    return { error: `That lookup failed: ${err?.message ?? "unknown error"}` };
  }
}
