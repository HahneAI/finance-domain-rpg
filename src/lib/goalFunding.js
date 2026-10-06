// Accent token every system-created goal is stamped with. Lives here (not in
// HomePanel) so the three goal writers — HomePanel.addGoal, App's Coach
// handleCoachCreateGoal, and archetype seeding — share one definition;
// HomePanel re-exports it for existing importers.
export const GOAL_SYSTEM_COLOR = "var(--color-accent-primary)";

/**
 * The ONE place a new goal row is shaped (drift-app-warden F176/F181). Every
 * writer of a fresh goal goes through this so the shape cannot drift between
 * a hand-made goal, a Coach-confirmed goal, and an archetype-seeded goal.
 * `seq` disambiguates ids when several goals are built in the same millisecond
 * (archetype seeding); omit it for single creates so the id stays `g_<ts>`.
 * `templateKey` is only written when present — existing goals gain no field.
 */
export function buildGoal({ label, target, note = "", templateKey, seq } = {}) {
  return {
    id: `g_${Date.now()}${seq != null ? `_${seq}` : ""}`,
    label,
    target: Number(target) || 0,
    color: GOAL_SYSTEM_COLOR,
    note: note ?? "",
    completed: false,
    ...(templateKey ? { templateKey } : {}),
  };
}

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
