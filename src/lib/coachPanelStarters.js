// Panel-aware Coach (TODO §32 A3, 2026-10-30): opening Coach from a panel starts that panel's
// conversation — an intro line and three starter questions on the empty chat. Keyed by App's
// internal view key; the label shown is App's VIEW_LABELS name (Upkeep, never "budget", F178).
// Starters are worded the way the tool-loop eval cases are, so each maps onto a tool Coach has.

export const PANEL_STARTERS = {
  home: {
    intro: "Looking at Home — ask about your week, your goals or your Claim Dates.",
    starters: ["How's my week looking?", "When does my next goal land?", "What's the one thing I should do this week?"],
  },
  income: {
    intro: "Looking at Income — ask about a paycheck, overtime or what came out of it.",
    starters: ["Why is my paycheck what it is this week?", "I can pick up 8 hours of overtime. Is it worth it?", "What did my paycheck look like about a month ago?"],
  },
  budget: {
    intro: "Looking at Upkeep — ask about a bill, where the money goes or what a cut would do.",
    starters: ["Where is most of my money going?", "Which bill changed this month?", "What if I cut my biggest bill?"],
  },
  log: {
    intro: "Looking at Log — ask what an entry cost you, or tell me something to log.",
    starters: ["What have I logged recently, and what did it cost me?", "Did my last missed shift push my goals back?", "I got a bonus this week — can you log it?"],
  },
  profile: {
    intro: "Looking at Account — ask how a setting changes your numbers.",
    starters: ["How is my take-home calculated?", "Which of my settings change my numbers the most?", "How is Upkeep Health calculated?"],
  },
};

export function panelStartersFor(viewKey) {
  return PANEL_STARTERS[viewKey] ?? null;
}
