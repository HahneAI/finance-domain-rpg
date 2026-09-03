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
  deriveWeekPayComponents,
  deriveWeeklyPayrollDeductions,
  resolveNightDiffPerHour,
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
  {
    name: "navigate_to",
    description:
      "Offer the user a one-tap link to the panel that backs up what you just told them. The app renders it as a button under your message — so say what to do in words as usual, and call this to make it tappable. Call it at most once per message, and only when a specific panel genuinely follows from your answer. Pass `focus` to point at the exact expense or goal you discussed rather than just the panel.",
    input_schema: {
      type: "object",
      properties: {
        panel: {
          type: "string",
          enum: ["Home", "Income", "Budget", "Log", "Account"],
          description: "Which of the five panels to open.",
        },
        focus: {
          type: "string",
          description:
            "Optional. An expense label as it appears in the app (e.g. \"Groceries\"), or a goal by rank (e.g. \"goal 1\"). The app scrolls to that row and highlights it. Omitted or unrecognised means the panel simply opens.",
        },
      },
      required: ["panel"],
    },
  },
  {
    name: "propose_goal",
    description:
      "Offer the user a new goal to add, with a name you write and a target amount. The app renders it as an editable card under your message — they can reword the name, adjust the amount, and confirm; nothing is saved unless they do. Use this when a conversation lands on something they want to become or achieve, rather than telling them to go add it themselves. Name it the way THEY described it, in their words. Call at most once per message.",
    input_schema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "The goal's name, in the user's own words, e.g. \"Six months of runway\". Short — this is a card title, not a sentence.",
        },
        target: { type: "number", description: "Target amount in dollars." },
        note: {
          type: "string",
          description: "Optional one-line reason it matters to them, in their words. Shown on the goal, not to anyone else.",
        },
      },
      required: ["label", "target"],
    },
  },
  {
    name: "simulate_expense_change",
    description:
      "Recalculate the user's goal timeline as if one expense cost a different amount per week (use 0 for cancelling it entirely). Answers \"how much sooner would my goals land if I cut this?\" Returns the current and simulated finish date for every active goal, so the difference is a real calculation rather than an estimate.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "The expense's label, e.g. \"Groceries\". Matched case-insensitively." },
        newWeeklyCost: { type: "number", description: "The new cost per week in dollars. 0 means the expense goes away entirely." },
      },
      required: ["label", "newWeeklyCost"],
    },
  },
  {
    name: "simulate_new_goal",
    description:
      "Recalculate the goal timeline as if the user added another goal at a given funding priority. Answers \"can I afford another goal, and what would it push back?\" Returns when the new goal would finish and how many periods each existing goal slips.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "number", description: "The new goal's target amount in dollars." },
        insertAtRank: {
          type: "integer",
          description: "Funding priority to insert at, 1-based. 1 funds it before everything else. Defaults to last.",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "simulate_overtime_hours",
    description:
      "Calculate what picking up extra overtime hours in one pay period is actually worth after tax, 401k and deductions. Answers \"is this extra shift worth it?\" Returns the added gross, what each deduction takes, and the real take-home difference — never a gross figure presented as take-home.",
    input_schema: {
      type: "object",
      properties: {
        hours: { type: "number", description: "How many extra overtime hours to add." },
        weekOffset: {
          type: "integer",
          description: "Which period to add them to. 0 = this one, 1 = next. Defaults to 0.",
        },
      },
      required: ["hours"],
    },
  },
  {
    name: "simulate_without_logged_event",
    description:
      "Recalculate the goal timeline as if a logged event had never happened. This is the ONLY way to answer \"did that missed shift push my goal back?\" or \"how much did that bonus help?\" — the goal dates you see everywhere else already include every logged event, so they cannot be compared against a version without it unless you call this.",
    input_schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: Object.keys(EVENT_TYPES),
          description: "Which event type to remove.",
        },
        periodNumber: {
          type: "integer",
          description: "Which occurrence, by its period number. Omit to use the most recent event of that type.",
        },
      },
      required: ["type"],
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

// ── Simulation support ──────────────────────────────────────────────────
//
// Every simulation is the same move: re-run the REAL computeGoalTimeline with
// one input changed, then diff against the unchanged run. Nothing is modelled
// or approximated here — the "what if" number comes from the same function the
// goal cards themselves use, which is what makes a simulated finish date
// comparable to the real one rather than a second opinion about it.
//
// The three goal-based simulations share this helper so they cannot drift into
// three different ideas of what "sooner" means.

function activeGoalsOf(data) {
  return (data.goals ?? []).filter((g) => !g.completed);
}

function runTimeline(data, { goals, expenses, logNetLost, logNetGained, timelineWeekNets } = {}) {
  return computeGoalTimeline(
    goals ?? activeGoalsOf(data),
    data.futureWeeks ?? [],
    timelineWeekNets ?? data.timelineWeekNets ?? [],
    expenses ?? data.expenses ?? [],
    logNetLost ?? data.logNetLost ?? 0,
    logNetGained ?? data.logNetGained ?? 0,
    data.futureEventDeductions ?? {},
    data.config?.goalTimelineEpochIdx ?? null
  );
}

// One goal's timeline entry, in the same shape get_goal_detail reports.
function summarizeGoal(g, data) {
  const checksPerYear = checksPerYearFor(data.config);
  const onTrack = Number.isFinite(g.eW);
  const periods = onTrack
    ? (checksPerYear === 52 ? g.wN : g.wN / (FISCAL_WEEKS_PER_YEAR / checksPerYear))
    : null;
  const currentIdx = data.currentWeek?.idx ?? null;
  const finish = onTrack && currentIdx != null
    ? periodLabels(currentIdx + Math.ceil(g.eW), data.allWeeks ?? [], checksPerYear)
    : null;
  // Two different quantities, and mixing them up inverts a simulation's sign:
  //   wN = eW - sW ....... how long the goal spends FUNDING once it starts
  //   eW ................. when it actually FINISHES, counted from now
  // "Weeks to fund" in the app is wN (the goal cards and the context block both
  // say that), so periodsToFund keeps it. But a simulation must compare eW:
  // inserting a goal ahead of this one delays its START, which can make its
  // funding window shorter even as it finishes later — diffing wN reported
  // "0.09 periods sooner" for a goal that had just been pushed back.
  const periodsUntilFinish = onTrack
    ? (checksPerYear === 52 ? g.eW : g.eW / (FISCAL_WEEKS_PER_YEAR / checksPerYear))
    : null;
  return {
    onTrackThisFiscalYear: onTrack,
    periodsToFund: onTrack ? round2(periods) : null,
    periodsUntilFinish: onTrack ? round2(periodsUntilFinish) : null,
    finishDate: finish?.date ?? null,
    finishPeriodNumber: finish?.period ?? null,
    stillUnfundedAtFiscalYearEnd: onTrack ? 0 : round2(g.remainingAtEnd),
  };
}

// Pairs each goal's real timeline against its simulated one. `periodsSooner` is
// positive when the change helps and negative when it hurts, so the model never
// has to infer direction from two dates.
function diffGoals(baseTimeline, simTimeline, data) {
  return baseTimeline.map((g, i) => {
    const current = summarizeGoal(g, data);
    const simulated = simTimeline[i] ? summarizeGoal(simTimeline[i], data) : null;
    // Measured on periodsUntilFinish, never periodsToFund — see summarizeGoal.
    // Null when either side never completes this fiscal year; `simulated`
    // carries onTrackThisFiscalYear so that case is still readable.
    const sooner = current.periodsUntilFinish != null && simulated?.periodsUntilFinish != null
      ? round2(current.periodsUntilFinish - simulated.periodsUntilFinish)
      : null;
    return {
      rank: i + 1,
      targetAmount: round2(g.target),
      current,
      simulated,
      periodsSooner: sooner,
      payPeriodUnit: payPeriodUnit(checksPerYearFor(data.config), "lower"),
    };
  });
}

const GOAL_PRIVACY_NOTE =
  "Goal names are withheld from you for privacy — refer to a goal by its rank unless the user names it themselves.";

function toolGetGoalDetail({ rank }, data) {
  const activeGoals = activeGoalsOf(data);
  if (!activeGoals.length) return { error: "No active goals are set right now." };

  const idx = Number(rank) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= activeGoals.length) {
    return { error: `Rank must be between 1 and ${activeGoals.length}. There are ${activeGoals.length} active goals.` };
  }

  // runTimeline/summarizeGoal are the same pair the simulation tools use — so
  // a goal reported here and the same goal's "current" side in a simulation
  // are one derivation, not two that happen to agree today. Both bottom out in
  // computeGoalTimeline with HomePanel's own epoch arg.
  const g = runTimeline(data)[idx];
  const summary = summarizeGoal(g, data);
  const checksPerYear = checksPerYearFor(data.config);

  return {
    rank: idx + 1,
    ofTotalActiveGoals: activeGoals.length,
    targetAmount: round2(g.target),
    onTrackThisFiscalYear: summary.onTrackThisFiscalYear,
    projectedPerPeriodFunding: summary.periodsToFund > 0 ? round2(g.target / summary.periodsToFund) : null,
    periodsToFund: summary.periodsToFund,
    payPeriodUnit: payPeriodUnit(checksPerYear, "lower"),
    projectedFinishDate: summary.finishDate,
    projectedFinishPeriodNumber: summary.finishPeriodNumber,
    stillUnfundedAtFiscalYearEnd: summary.stillUnfundedAtFiscalYearEnd,
    fundingPosition: idx === 0
      ? "This goal is first in line — it absorbs surplus before any other goal."
      : `Goals ranked 1 through ${idx} fund before this one; nothing reaches it until they're fully funded.`,
    note: GOAL_PRIVACY_NOTE,
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
    // Both loan helpers take the loanMeta object, not the expense wrapper —
    // every call site in BudgetPanel.jsx passes `meta`. Passing `exp` here
    // silently produced an Invalid Date that formatted as the literal string
    // "undefined NaNth, NaN", which Coach would have read out to a user.
    const payoff = computeLoanPayoffDate(exp.loanMeta);
    out.loan = {
      totalAmount: round2(exp.loanMeta.totalAmount),
      paymentAmount: round2(exp.loanMeta.paymentAmount),
      paymentFrequency: exp.loanMeta.paymentFrequency,
      weeklyEquivalent: round2(loanWeeklyAmount(exp.loanMeta)),
      paymentsRemaining: loanPaymentsRemaining(exp.loanMeta),
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
      // "the week of <START>" + period number — the same convention
      // get_week_breakdown, get_goal_detail and the context block's "Current
      // period" all use. This previously returned `weekEnding`, an END date,
      // and the two conventions collide: week 10 ENDS on the same calendar day
      // week 11 BEGINS, so the identical string "March 9th, 2026" named two
      // different fiscal weeks depending on which field you were reading. Live
      // testing caught Coach attributing a logged event to week 11 when this
      // tool had already told it periodNumber 10.
      date: labels?.date ?? null,
      periodNumber: labels?.period ?? null,
      // Retained: the raw week-end date is still the log row's own identity in
      // the Log panel, and is what a user scanning that list actually sees.
      weekEndingDate: e.weekEnd ? fmtFullDate(e.weekEnd) : null,
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

function toolSimulateExpenseChange({ label, newWeeklyCost }, data) {
  const needle = String(label ?? "").trim().toLowerCase();
  const expenses = data.expenses ?? [];
  const active = expenses.filter((e) => (e.newJobSeasonStatus ?? "active") === "active");
  const target = active.find((e) => (e.label ?? "").trim().toLowerCase() === needle)
    ?? active.find((e) => (e.label ?? "").trim().toLowerCase().includes(needle));
  if (!target) {
    return { error: `No active expense matching "${label}".`, availableLabels: active.map((e) => e.label ?? "Unnamed") };
  }
  const next = Number(newWeeklyCost);
  if (!Number.isFinite(next) || next < 0) return { error: "newWeeklyCost must be a number of dollars, 0 or more." };

  if (!activeGoalsOf(data).length) return { error: "No active goals to measure this against." };

  // Clearing monthlyOverrides and replacing history with a single always-in-
  // effect entry is what makes getExactEffectiveAmountForMonth resolve to the
  // simulated figure for every month — the same resolver the real run uses, not
  // a bypass of it.
  const simExpenses = expenses.map((e) => (e === target
    ? { ...e, monthlyOverrides: undefined, history: [{ effectiveFrom: "1970-01-01", weekly: [next, next, next, next] }] }
    : e));

  const monthKey = data.today ? data.today.slice(0, 7) : null;
  const phaseIdx = data.today ? getPhaseIndex(new Date(`${data.today}T12:00:00`)) : null;
  const currentWeekly = monthKey != null && phaseIdx != null
    ? getExactEffectiveAmountForMonth(target, monthKey, phaseIdx)
    : null;

  return {
    simulated: `${target.label ?? "Unnamed"} at ${next === 0 ? "$0/wk (cancelled)" : `$${next}/wk`}`,
    expenseLabel: target.label ?? "Unnamed",
    currentWeeklyCost: round2(currentWeekly),
    simulatedWeeklyCost: round2(next),
    weeklyDifference: round2(currentWeekly != null ? currentWeekly - next : null),
    goals: diffGoals(runTimeline(data), runTimeline(data, { expenses: simExpenses }), data),
    note: GOAL_PRIVACY_NOTE,
  };
}

function toolSimulateNewGoal({ target, insertAtRank }, data) {
  const amount = Number(target);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "target must be a positive dollar amount." };

  const existing = activeGoalsOf(data);
  const rank = Number.isInteger(insertAtRank)
    ? Math.min(Math.max(insertAtRank, 1), existing.length + 1)
    : existing.length + 1;

  const simGoal = { id: "__simulated__", target: amount, completed: false };
  const simGoals = [...existing];
  simGoals.splice(rank - 1, 0, simGoal);

  const simTimeline = runTimeline(data, { goals: simGoals });
  const baseTimeline = runTimeline(data);
  const simIdx = rank - 1;

  // The simulated goal shifts every goal ranked at or below it, so the diff is
  // aligned by rank with the inserted entry removed, not positionally.
  const shifted = simTimeline.filter((_, i) => i !== simIdx);

  return {
    simulated: `a new $${amount} goal inserted at priority ${rank} of ${existing.length + 1}`,
    newGoal: { insertedAtRank: rank, targetAmount: amount, ...summarizeGoal(simTimeline[simIdx], data) },
    existingGoals: diffGoals(baseTimeline, shifted, data),
    note: `${GOAL_PRIVACY_NOTE} A negative periodsSooner means that goal is pushed back by the new one.`,
  };
}

function toolSimulateOvertimeHours({ hours, weekOffset = 0 }, data) {
  const extra = Number(hours);
  if (!Number.isFinite(extra) || extra <= 0) return { error: "hours must be a positive number." };

  const { allWeeks = [], currentWeek = null, config = null } = data;
  if (!allWeeks.length || !currentWeek) return { error: "No pay weeks are built for this account yet." };
  const offset = Number.isInteger(Number(weekOffset)) ? Number(weekOffset) : 0;
  const week = allWeeks.find((w) => w.idx === currentWeek.idx + offset);
  if (!week) return { error: `No pay week exists at offset ${offset}.` };
  if (!week.active) return { error: "That period isn't an active earning week, so extra hours wouldn't be paid." };

  // Overtime pay rate, resolved the same way buildYear/projectedGross do.
  const otRate = (config.baseRate + resolveNightDiffPerHour(config)) * (config.otMultiplier ?? 1.5);
  const extraGross = extra * otRate;

  // The simulated week is rebuilt through deriveWeekPayComponents — the exact
  // function buildYear uses — so its 401k and taxable gross follow the real
  // rules rather than a second version of them.
  const benefits = deriveWeeklyPayrollDeductions(week, config).benefits;
  const grossPay = week.grossPay + extraGross;
  const parts = deriveWeekPayComponents(config, {
    grossPay, benefitsDeduction: benefits, has401k: week.has401k, active: week.active,
  });
  const simWeek = {
    ...week,
    grossPay,
    totalHours: (week.totalHours ?? 0) + extra,
    overtimeHours: (week.overtimeHours ?? 0) + extra,
    k401kEmployee: parts.k401kEmployee,
    k401kEmployer: parts.k401kEmployer,
    taxableGross: parts.taxableGross,
    payrollDeductions: { benefits, k401Employee: parts.k401kEmployee, total: benefits + parts.k401kEmployee },
  };

  const base = computeNetBreakdown(week, config, 0, false);
  const sim = computeNetBreakdown(simWeek, config, 0, false);
  const checksPerYear = checksPerYearFor(config);
  const scale = (n) => round2(n * (52 / checksPerYear));
  const labels = periodLabels(week.idx, allWeeks, checksPerYear);
  const takeHomeGain = sim.net - base.net;

  // Goal impact is returned, not left to be inferred. Live testing caught Coach
  // answering "worth it?" with "accelerates Goal 1 by roughly two days and Goal
  // 2 by roughly a week" off a payload that carried no goal data at all — the
  // same fabricated-counterfactual failure simulate_without_logged_event exists
  // to remove. Extra pay lands in ONE week, so only that week's net moves.
  const futureWeeks = data.futureWeeks ?? [];
  const nets = data.timelineWeekNets ?? [];
  const slot = futureWeeks.findIndex((w) => w.idx === week.idx);
  let goals = null;
  if (slot >= 0 && slot < nets.length && activeGoalsOf(data).length) {
    const simNets = nets.map((n, i) => (i === slot ? n + takeHomeGain : n));
    goals = diffGoals(runTimeline(data), runTimeline(data, { timelineWeekNets: simNets }), data);
  }

  return {
    simulated: `${extra} extra overtime hours in ${labels.date ?? "that period"}`,
    date: labels.date,
    periodNumber: labels.period,
    payPeriodUnit: labels.unit,
    overtimeRatePerHour: round2(otRate),
    addedGrossPay: scale(extraGross),
    takenBy: {
      federalTax: scale(sim.federalTax - base.federalTax),
      stateTax: scale(sim.stateTax - base.stateTax),
      fica: scale(sim.fica - base.fica),
      k401Employee: scale(sim.k401Employee - base.k401Employee),
    },
    addedTakeHome: scale(takeHomeGain),
    effectiveTakeHomePerHour: round2((takeHomeGain / extra) * (52 / checksPerYear)),
    keptShareOfGross: extraGross > 0 ? round2((takeHomeGain / extraGross) * 100) : null,
    goals,
    note: `addedTakeHome is what actually reaches the user; addedGrossPay is not spendable. The 401k share is still theirs, just not in this paycheck.${
      goals ? ` ${GOAL_PRIVACY_NOTE} goals shows the real effect on each goal's finish — do not estimate it yourself.` : " No goal timeline is available for that period, so do not estimate one."
    }`,
  };
}

function toolSimulateWithoutLoggedEvent({ type, periodNumber }, data) {
  if (!EVENT_TYPES[type]) return { error: `Unknown event type "${type}".`, validTypes: Object.keys(EVENT_TYPES) };
  const { logs = [], config = null, allWeeks = [] } = data;
  const checksPerYear = checksPerYearFor(config);

  const matches = logs.filter((e) => e.type === type);
  if (!matches.length) return { error: `Nothing of type "${type}" is logged, so there's nothing to remove.` };

  const withPeriod = matches.map((e) => {
    const { weekMeta } = resolveEventWeekMeta(e, allWeeks);
    return { event: e, weekMeta, period: weekMeta ? periodLabels(weekMeta.idx, allWeeks, checksPerYear) : null };
  });
  const chosen = Number.isInteger(periodNumber)
    ? withPeriod.find((m) => m.period?.period === periodNumber)
    : withPeriod.sort((a, b) => (b.event.weekEnd ?? "").localeCompare(a.event.weekEnd ?? ""))[0];
  if (!chosen) {
    return {
      error: `No "${EVENT_TYPES[type].label}" logged in that period.`,
      availablePeriods: withPeriod.map((m) => m.period?.period).filter((p) => p != null),
    };
  }

  if (!activeGoalsOf(data).length) return { error: "No active goals to measure this against." };

  // computeGoalTimeline smears logNetLost/logNetGained across the remaining
  // weeks, so removing an event means subtracting its own impact from those
  // totals — the same calcEventImpact figure the Log panel shows for it.
  const impact = calcEventImpact(chosen.event, config, chosen.weekMeta);
  const lostAfter = (data.logNetLost ?? 0) - impact.netLost;
  const gainedAfter = (data.logNetGained ?? 0) - impact.netGained;
  // If the caller's running totals don't actually contain this event's impact,
  // subtracting it would go negative — and clamping that to 0 would silently
  // produce an identical timeline and report "this event cost you nothing,"
  // which is a confident wrong answer rather than a missing one. Refuse instead.
  if (lostAfter < -0.01 || gainedAfter < -0.01) {
    return {
      error: "This event's impact isn't reflected in the account's logged totals, so removing it can't be simulated reliably.",
    };
  }
  const simTimeline = runTimeline(data, {
    logNetLost: Math.max(lostAfter, 0),
    logNetGained: Math.max(gainedAfter, 0),
  });

  return {
    simulated: `${EVENT_TYPES[type].label} in ${chosen.period?.date ?? "an unknown period"} never happened`,
    event: {
      type: EVENT_TYPES[type].label,
      date: chosen.period?.date ?? null,
      periodNumber: chosen.period?.period ?? null,
      netImpact: round2(impact.netGained - impact.netLost),
    },
    goals: diffGoals(runTimeline(data), simTimeline, data),
    note: `${GOAL_PRIVACY_NOTE} "current" already includes this event — that is what every goal date elsewhere in the app shows. "simulated" is the version without it. A positive periodsSooner means removing the event would have finished the goal sooner, i.e. the event cost the user time.`,
  };
}

// The five panels Coach can send someone to, mapped from the user-facing names
// in the tool schema to App.jsx's own viewStack keys. The mapping exists so the
// model never has to know that the Account panel is keyed "profile" internally.
const PANEL_VIEW_KEYS = {
  home: "home", income: "income", budget: "budget", log: "log", account: "profile",
};

function toolNavigateTo({ panel, focus }, data) {
  const key = PANEL_VIEW_KEYS[String(panel ?? "").trim().toLowerCase()];
  if (!key) {
    return { error: `Unknown panel "${panel}".`, validPanels: Object.keys(PANEL_VIEW_KEYS) };
  }
  const panelLabel = String(panel).trim().replace(/^./, (c) => c.toUpperCase());

  // A focus target is resolved against the account's REAL data here, not taken
  // on trust. An unresolvable target degrades to opening the panel rather than
  // producing a link that scrolls to nothing — and the model is told, so it
  // doesn't promise the user something the chip won't do.
  let focusRef = null;
  let focusLabel = null;
  let focusNote = null;
  const raw = String(focus ?? "").trim();
  if (raw) {
    const goalMatch = raw.match(/^goal\s*(\d+)$/i);
    if (goalMatch) {
      const rank = Number(goalMatch[1]);
      const total = activeGoalsOf(data).length;
      if (rank >= 1 && rank <= total) {
        focusRef = `goal:${rank}`;
        focusLabel = `Goal ${rank}`;
      } else {
        focusNote = `There is no goal ${rank} — the panel will open without highlighting anything.`;
      }
    } else {
      const active = (data.expenses ?? []).filter((e) => (e.newJobSeasonStatus ?? "active") === "active");
      const needle = raw.toLowerCase();
      const hit = active.find((e) => (e.label ?? "").trim().toLowerCase() === needle)
        ?? active.find((e) => (e.label ?? "").trim().toLowerCase().includes(needle));
      if (hit) {
        focusRef = `expense:${hit.label}`;
        focusLabel = hit.label;
      } else {
        focusNote = `No expense matches "${raw}" — the panel will open without highlighting anything.`;
      }
    }
  }

  return {
    ok: true,
    panel: panelLabel,
    viewKey: key,
    focusRef,
    // What the button itself reads. The app renders this; do not repeat it
    // verbatim in your message.
    linkLabel: focusLabel ? `${panelLabel} · ${focusLabel}` : `Open ${panelLabel}`,
    ...(focusNote ? { note: focusNote } : {}),
  };
}

function toolProposeGoal({ label, target, note }, data) {
  const name = String(label ?? "").trim();
  const amount = Number(target);
  if (!name) return { error: "A goal needs a name." };
  if (name.length > 60) return { error: "That name is too long for a goal card — keep it under 60 characters." };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "target must be a positive dollar amount." };

  // Duplicate check WITHOUT returning any existing label. F114 withholds goal
  // names from Coach; proposing one is the opposite direction and is fine, but
  // the reply must not leak the names it compared against — so this reports a
  // boolean, never the matching goal.
  const existing = activeGoalsOf(data);
  const duplicate = existing.some((g) => (g.label ?? "").trim().toLowerCase() === name.toLowerCase());

  // Projected finish comes from the REAL computeGoalTimeline via the same
  // simulate_new_goal path, appended last (the rank a confirmed goal actually
  // lands at). Without this the card would be a prefilled text field; with it,
  // an intention becomes a dated commitment before it is committed to.
  const sim = toolSimulateNewGoal({ target: amount }, data);
  const projection = sim.error ? null : sim.newGoal;

  return {
    ok: true,
    label: name,
    target: round2(amount),
    ...(note ? { note: String(note).trim().slice(0, 140) } : {}),
    insertAtRank: existing.length + 1,
    ofTotalAfterAdding: existing.length + 1,
    projectedFinishDate: projection?.finishDate ?? null,
    projectedFinishPeriodNumber: projection?.finishPeriodNumber ?? null,
    onTrackThisFiscalYear: projection?.onTrackThisFiscalYear ?? null,
    payPeriodUnit: payPeriodUnit(checksPerYearFor(data.config), "lower"),
    alreadyHaveOneNamedThis: duplicate,
    // Branches on whether a DATE exists, not on whether a projection object came
    // back: a goal that cannot finish this fiscal year still returns a
    // projection, with a null date inside it. Keying off the object told the
    // model a date was on the card when the card had none.
    note_to_model: `The card is editable and unsaved — do not tell the user it has been added. ${
      projection?.finishDate
        ? "The projected finish date is already on the card; don't repeat it verbatim."
        : "At their current pace this one does NOT finish inside the fiscal year, so the card shows no date — say that plainly rather than implying a timeline."
    }${duplicate ? " They already have a goal by this exact name — say so plainly before they confirm." : ""}`,
  };
}

const HANDLERS = {
  navigate_to: toolNavigateTo,
  propose_goal: toolProposeGoal,
  get_goal_detail: toolGetGoalDetail,
  get_expense_detail: toolGetExpenseDetail,
  get_week_breakdown: toolGetWeekBreakdown,
  list_log_entries: toolListLogEntries,
  simulate_expense_change: toolSimulateExpenseChange,
  simulate_new_goal: toolSimulateNewGoal,
  simulate_overtime_hours: toolSimulateOvertimeHours,
  simulate_without_logged_event: toolSimulateWithoutLoggedEvent,
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
