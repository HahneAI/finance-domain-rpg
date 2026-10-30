// "Ask Coach about this" (TODO §32 A1, 2026-10-30) — the opening question a card sends when the
// user taps its Ask Coach button. One builder per surface so the wording lives in one place.
//
// Goals go by funding-priority rank, never by name (warden F114: goal names are withheld from Coach;
// rank i+1 is the same index HomePanel's `data-coach-ref="goal:<rank>"` and get_goal_detail use).
// Expenses go by label — labels already reach Coach in its context and tools.

export function goalCoachSeed(rank) {
  return `How's my goal #${rank} tracking toward its Claim Date?`;
}

export function expenseCoachSeed(label) {
  return `What's going on with my ${label} expense?`;
}
