// A single shared, fabricated-but-realistic test account, run through the
// REAL buildCoachContext() (src/lib/aiContext.js) — the same function
// api/coach.js's live traffic uses — rather than hand-typing a context
// string per prompt file. This is what "manually build a data fixture"
// should mean here: fake INPUT numbers (fine for a style/personality test,
// never fine for a data-accuracy one), but the function that turns those
// numbers into the text Coach actually reads is the real one, so this
// fixture can never silently drift from what buildCoachContext() actually
// produces in production.
//
// Deliberately no goals/expenses beyond one simple rent line — an earlier
// draft included a goal, which produced a nonsensical "~0 weeks to fund
// $3,000 at $0/wk" line because computeGoalTimeline() needs a real
// futureWeeks/timelineWeekNets series to project against, which this
// fixture doesn't build. Rather than fake that whole series just to make
// one line look sensible, the fixture stays goal-free — exactly the kind
// of silently-wrong-number risk drift-app-warden.md's D1 rule warns about,
// avoided here by not reaching for a shortcut.
//
// Reuse this same shape (with different weeklyIncome/avgWeeklySpend ratios)
// for Phase 4's severity-flexing rows (budget near-limit vs. healthy) —
// that's real engine math doing the work, not two hand-typed guesses at
// what "99% used" looks like.
import { buildCoachContext } from "../../../src/lib/aiContext.js";

export function buildTestContext({ weeklyIncome = 845, avgWeeklySpend = 520 } = {}) {
  const config = {
    firstActiveIdx: 0,
    userPaySchedule: "weekly",
    goalTimelineEpochIdx: null,
    newJobSeasonMode: false,
  };
  const currentWeek = { idx: 10 };
  const allWeeks = Array.from({ length: 52 }, (_, i) => ({
    idx: i,
    weekEnd: `2026-${String(1 + Math.floor(i / 4)).padStart(2, "0")}-${String(1 + (i % 4) * 7).padStart(2, "0")}`,
  }));

  return buildCoachContext({
    config,
    weeklyIncome,
    avgWeeklySpend,
    goals: [],
    expenses: [{
      id: "e1", label: "Rent", category: "Needs",
      history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }],
    }],
    fundedGoalSpend: 0,
    currentWeek,
    today: "2026-03-09",
    runwayDays: null,
    logs: [],
    futureWeeks: [],
    timelineWeekNets: [],
    futureWeekNets: [weeklyIncome + 55],
    logNetLost: 0,
    logNetGained: 0,
    futureEventDeductions: {},
    prevWeekNet: weeklyIncome + 5,
    allWeeks,
  });
}
