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

// A2 (2026-11-03). Dates are the row's own week-end date, labelled the way the row shows it
// ("Mar 16"); Coach maps a date onto its own tool arguments.
export function weekEndLabel(weekEnd) {
  const d = weekEnd instanceof Date ? weekEnd
    : typeof weekEnd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(weekEnd)
      ? new Date(Number(weekEnd.slice(0, 4)), Number(weekEnd.slice(5, 7)) - 1, Number(weekEnd.slice(8, 10)))
      : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
}

// Income weekly row. `relative` is "this week" / "last week" / "next week" when the row is one of
// those (weekly schedules only); omitted otherwise.
export function paycheckCoachSeed(weekEnd, relative = null) {
  const label = weekEndLabel(weekEnd);
  return `Why is my paycheck what it is for the week ending ${label}${relative ? ` (${relative})` : ""}?`;
}

// Log entry. `typeLabel` is EVENT_TYPES[type].label, the same name the entry card shows.
export function logEntryCoachSeed(typeLabel, weekEnd) {
  const label = weekEndLabel(weekEnd);
  return `What did my ${typeLabel} entry${label ? ` for the week ending ${label}` : ""} do to my numbers and goals?`;
}

// C3 (2026-11-03). The Claim Date slip alert's "Ask Coach why" — rank only (F114), the two dates the
// alert itself shows.
export function claimSlipCoachSeed(rank, fromLabel, toLabel) {
  return `Why did my goal #${rank}'s Claim Date move from ${fromLabel} to ${toLabel}?`;
}
