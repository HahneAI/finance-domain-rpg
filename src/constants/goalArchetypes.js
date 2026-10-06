// Goal archetypes (TODO §31) — identity-based starter goal templates.
//
// A user picks ONE archetype after account creation and is handed 3–5 starter
// goals to edit, drop, or keep. This file is data only: names, hooks, and the
// goals each archetype seeds. Dollar amounts are rough starting guesses from
// public spending surveys (see TODO §31 research notes) and are meant to be
// tuned from beta data via each goal's `templateKey`.
//
// targetRule is one of:
//   { kind: "fixed", amount }                      — a flat dollar target
//   { kind: "weeksOfSpend", weeks, floor }          — N weeks of the user's own
//       avgWeeklySpend (the same figure Home reads), never below `floor`. A
//       fresh account only has the seeded Food bill, so without a floor its
//       "emergency fund" would round to a few dollars.
// Resolution lives in lib/goalArchetypes.js — never inline a rule here.
//
// templateKey is `<archetypeId>.<goalKey>` and is stamped on the seeded goal
// (via buildGoal) so a later re-open can skip templates already added.

export const ARCHETYPES = [
  {
    id: "prepper",
    name: "The Prepper",
    hook: "Nothing catches me off guard.",
    goals: [
      { key: "emergency_fund", label: "Emergency Fund", note: "Four weeks of your real spending, set aside.", targetRule: { kind: "weeksOfSpend", weeks: 4, floor: 1000 } },
      { key: "food_water", label: "Two-Week Food & Water Stash", note: "Shelf-stable food and water for the household.", targetRule: { kind: "fixed", amount: 400 } },
      { key: "cash_stash", label: "Cash-on-Hand Stash", note: "Physical cash for when the cards go down.", targetRule: { kind: "fixed", amount: 500 } },
      { key: "home_readiness", label: "Home Readiness Kit", note: "First aid, light, power, and tools.", targetRule: { kind: "fixed", amount: 800 } },
    ],
  },
  {
    id: "heartbeat",
    name: "The Heartbeat",
    hook: "My body is my first asset.",
    goals: [
      { key: "gym_year", label: "Year of Gym Access", note: "A full year of membership or classes.", targetRule: { kind: "fixed", amount: 420 } },
      { key: "home_gym", label: "Home Gym Starter", note: "The basics to train without leaving the house.", targetRule: { kind: "fixed", amount: 500 } },
      { key: "checkups", label: "Checkups & Dental Fund", note: "Out-of-pocket care you would otherwise skip.", targetRule: { kind: "fixed", amount: 300 } },
      { key: "race_entry", label: "Race or Event Entry", note: "Something on the calendar to train toward.", targetRule: { kind: "fixed", amount: 150 } },
    ],
  },
  {
    id: "builder",
    name: "The Builder",
    hook: "Future me is rich.",
    goals: [
      { key: "starter_emergency", label: "Starter Emergency Fund", note: "The first $1,000 that stops small shocks becoming debt.", targetRule: { kind: "fixed", amount: 1000 } },
      { key: "first_invested", label: "First $1,000 Invested", note: "Money working while you sleep.", targetRule: { kind: "fixed", amount: 1000 } },
      { key: "debt_crusher", label: "Debt Crusher Payment", note: "A lump sum aimed at your costliest balance.", targetRule: { kind: "fixed", amount: 1500 } },
      { key: "retirement_kickstart", label: "Retirement Account Kickstart", note: "Open it and put real money in.", targetRule: { kind: "fixed", amount: 2500 } },
    ],
  },
  {
    id: "polished",
    name: "The Polished",
    hook: "I walk in like I belong.",
    goals: [
      { key: "wardrobe", label: "Wardrobe Refresh", note: "A capsule of pieces that all work together.", targetRule: { kind: "fixed", amount: 500 } },
      { key: "grooming", label: "Grooming & Skincare Fund", note: "A routine you can actually sustain.", targetRule: { kind: "fixed", amount: 300 } },
      { key: "quality_piece", label: "One Quality Piece", note: "Shoes, a watch, a bag — buy it once.", targetRule: { kind: "fixed", amount: 300 } },
      { key: "smile", label: "Smile Upgrade", note: "Whitening or cosmetic dental work.", targetRule: { kind: "fixed", amount: 400 } },
    ],
  },
  {
    id: "family_man",
    name: "The Family Man",
    hook: "Home is where I win.",
    goals: [
      { key: "room_upgrade", label: "Home Upgrade", note: "The room or furniture that makes home better.", targetRule: { kind: "fixed", amount: 1500 } },
      { key: "family_trip", label: "Family Trip", note: "Everyone, together, somewhere new.", targetRule: { kind: "fixed", amount: 3000 } },
      { key: "kids_fund", label: "Kids' Fund", note: "A running start for the next generation.", targetRule: { kind: "fixed", amount: 600 } },
      { key: "repair_reserve", label: "Home Repair Reserve", note: "So a broken water heater is an errand, not a crisis.", targetRule: { kind: "fixed", amount: 1000 } },
    ],
  },
  {
    id: "explorer",
    name: "The Explorer",
    hook: "I collect stories, not stuff.",
    goals: [
      { key: "trip_fund", label: "Big Trip Fund", note: "The trip you keep saying you will take.", targetRule: { kind: "fixed", amount: 2000 } },
      { key: "events", label: "Concerts & Events Fund", note: "Live things with people you like.", targetRule: { kind: "fixed", amount: 600 } },
      { key: "passport", label: "Passport", note: "Fees included — the cheapest first step.", targetRule: { kind: "fixed", amount: 165 } },
      { key: "travel_gear", label: "Travel Gear", note: "Bag, boots, and what keeps you moving.", targetRule: { kind: "fixed", amount: 400 } },
    ],
  },
];

export const getArchetype = (id) => ARCHETYPES.find((a) => a.id === id) ?? null;

export const templateKeyFor = (archetypeId, goalKey) => `${archetypeId}.${goalKey}`;
