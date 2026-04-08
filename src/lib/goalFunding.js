export function getFundedGoalSpend(goals = [], todayIso = null) {
  if (!Array.isArray(goals) || goals.length === 0) return 0;
  const todayMs = todayIso ? new Date(`${todayIso}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;

  return goals.reduce((sum, goal) => {
    if (!goal?.completed) return sum;
    const target = Number(goal.target) || 0;
    if (target <= 0) return sum;

    // Guardrail: only count completed goals that are funded now/past.
    // Legacy completed goals may be missing completedAt; keep them counted.
    const completedAtMs = goal.completedAt ? new Date(goal.completedAt).getTime() : Number.NaN;
    if (Number.isFinite(completedAtMs) && completedAtMs > todayMs) return sum;
    return sum + target;
  }, 0);
}
