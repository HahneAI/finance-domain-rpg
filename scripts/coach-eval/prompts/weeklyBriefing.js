// TODO §32 C2 — Weekly Pre-Game Briefing (first §2.L Phase 6 mode to ship). Imports the real
// WEEKLY_BRIEFING_SYSTEM_PROMPT and runs the pre-built briefing fixture (a funded goal with a real
// trend line). Same call shape as CoachBriefingCard: a fixed trigger message, Coach speaking first.
import { WEEKLY_BRIEFING_SYSTEM_PROMPT } from "../../../src/lib/coachPrompts.js";
import { buildWeeklyBriefingContext } from "../fixtures/testAccount.js";

export default function ({ vars }) {
  const context = buildWeeklyBriefingContext({
    weeklyIncome: vars.weeklyIncome ?? 845,
    avgWeeklySpend: vars.avgWeeklySpend ?? 520,
    goalTarget: vars.goalTarget ?? 2000,
  });
  return [
    { role: "system", content: `${WEEKLY_BRIEFING_SYSTEM_PROMPT}\n\n${context}` },
    { role: "user", content: "Write my pre-game briefing for this week." },
  ];
}
