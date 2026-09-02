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
//
// newJobSeasonMode/runwayDays added for Phase 5's Net Worth Trigger Red-tier
// test (docs/TODO.md §2.L) — Red's own trigger condition per coachTriggers.js
// is specifically "New Job Season, runway under 30 days," and
// buildCoachContext() only emits its "New Job Season: active" line when
// config.newJobSeasonMode is true, so a realistic Red-tier test needs both
// set, not just the addendum text alone.
import { buildCoachContext } from "../../../src/lib/aiContext.js";

export function buildTestContext({
  weeklyIncome = 845, avgWeeklySpend = 520, newJobSeasonMode = false, runwayDays = null,
} = {}) {
  const config = {
    firstActiveIdx: 0,
    userPaySchedule: "weekly",
    goalTimelineEpochIdx: null,
    newJobSeasonMode,
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
    runwayDays,
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

// Weekly Pre-Game Briefing (docs/TODO.md §8.A, "3 sentences max: this week's
// projected check, bills due, goal contributions, one heads-up") — not built
// yet, but buildCoachContext() already carries every field its spec asks
// for, so this fixture is ready to plug into a real prompt loader the
// moment one exists. Unlike buildTestContext() above, this one DOES fund a
// real goal with a genuine trend line, because "goal contributions" is
// explicitly part of the spec — that needs computeGoalTimeline() to have
// something real to project, not the goal-free shortcut buildTestContext()
// takes for tests that don't care about goal data.
//
// The earlier "~0 weeks to fund $3,000 at $0/wk" bug (see the note above)
// turned out to be one thing, not two: computeGoalTimeline() calls
// getPhaseIndex(week.weekEnd), which calls week.weekEnd.getFullYear() —
// it needs a real Date object per future week, not a date STRING the way
// buildTestContext()'s allWeeks (only ever used for label formatting, a
// different code path) gets away with. Empty futureWeeks/timelineWeekNets
// wasn't really the fix, just the thing that avoided ever hitting this.
export function buildWeeklyBriefingContext({
  weeklyIncome = 845, avgWeeklySpend = 520, goalTarget = 2000,
} = {}) {
  const config = { firstActiveIdx: 0, userPaySchedule: "weekly", goalTimelineEpochIdx: null, newJobSeasonMode: false };
  const currentWeek = { idx: 10 };
  // Real Date objects, 8 weeks out — enough for a short-horizon goal to
  // show a genuine funding date, not an instant/degenerate one.
  const futureWeeks = Array.from({ length: 8 }, (_, i) => ({
    idx: 11 + i,
    weekEnd: new Date(`2026-${String(3 + Math.floor((11 + i) / 4)).padStart(2, "0")}-${String(1 + ((11 + i) % 4) * 7).padStart(2, "0")}T12:00:00`),
  }));
  const timelineWeekNets = futureWeeks.map(() => weeklyIncome + 55);

  return buildCoachContext({
    config,
    weeklyIncome,
    avgWeeklySpend,
    goals: [{ id: "g1", target: goalTarget, completed: false }],
    expenses: [{
      id: "e1", label: "Rent", category: "Needs",
      history: [{ effectiveFrom: "2026-01-01", weekly: [400, 400, 400, 400] }],
    }],
    fundedGoalSpend: 0,
    currentWeek,
    today: "2026-03-09",
    runwayDays: null,
    logs: [],
    futureWeeks,
    timelineWeekNets,
    futureWeekNets: [weeklyIncome + 55],
    logNetLost: 0,
    logNetGained: 0,
    futureEventDeductions: {},
    prevWeekNet: weeklyIncome + 5,
    allWeeks: futureWeeks,
  });
}
