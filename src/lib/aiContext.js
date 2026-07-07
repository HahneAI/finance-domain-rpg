import { netWorthHealthStatus } from "./finance.js";
import { getFiscalWeekNumber, FISCAL_WEEKS_PER_YEAR } from "./fiscalWeek.js";

const fmt$ = (n) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "—");

/**
 * §18.G — deterministic compressed financial snapshot for Coach's system
 * prompt. Same line order/shape on every call (job-loss line only appears
 * when config.jobLossMode is set) so the block prompt-caches across a
 * session even as the underlying numbers change.
 */
export function buildCoachContext({
  config = null,
  weeklyIncome = 0,
  avgWeeklySpend = 0,
  goals = [],
  expenses = [],
  fundedGoalSpend = 0,
  currentWeek = null,
  today = null,
  runwayDays = null,
} = {}) {
  const avgWeeklySurplus = weeklyIncome - avgWeeklySpend;
  const annualSavings = avgWeeklySurplus * 52 - fundedGoalSpend;
  const netWorthHealth = netWorthHealthStatus(annualSavings, weeklyIncome * 52);

  const completedGoals = goals.filter((g) => g.completed);
  const activeExpenses = expenses.filter((e) => (e.jobLossStatus ?? "active") === "active");
  const weekNumber = currentWeek ? getFiscalWeekNumber(currentWeek.idx) : null;
  const weeksLeft = weekNumber != null ? Math.max(FISCAL_WEEKS_PER_YEAR - weekNumber, 0) : null;

  const lines = [
    `Weekly net income: ${fmt$(weeklyIncome)}`,
    `Weekly spend: ${fmt$(avgWeeklySpend)}`,
    `Weekly surplus: ${fmt$(avgWeeklySurplus)}`,
    `Savings rate: ${netWorthHealth.rate != null ? `${Math.round(netWorthHealth.rate * 100)}%` : "—"}${netWorthHealth.belowThreshold ? " (below 10% target)" : ""}`,
    `Goals: ${completedGoals.length}/${goals.length} completed, ${fmt$(fundedGoalSpend)} funded`,
    `Expenses: ${activeExpenses.length} active line${activeExpenses.length === 1 ? "" : "s"}, ${fmt$(avgWeeklySpend)}/week`,
    `Fiscal week: ${weekNumber ?? "—"} of ${FISCAL_WEEKS_PER_YEAR}${weeksLeft != null ? ` (${weeksLeft} left)` : ""}`,
    `Today: ${today ?? "—"}`,
  ];

  if (config?.jobLossMode) {
    lines.push(`Job Loss Mode: active${runwayDays != null ? `, ~${runwayDays} days of runway` : ""}`);
  }

  return lines.join("\n");
}
