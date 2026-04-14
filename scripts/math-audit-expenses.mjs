// Expense audit for budget panel math
// Run: node scripts/math-audit-expenses.mjs

function getEffectiveAmount(expense, weekEndIso, phaseIdx) {
  if (!expense.history?.length) return expense.weekly?.[phaseIdx] ?? 0;
  let best = null;
  for (const entry of expense.history) {
    if (entry.effectiveFrom <= weekEndIso && (best === null || entry.effectiveFrom >= best.effectiveFrom))
      best = entry;
  }
  return best?.weekly[phaseIdx] ?? 0;
}

const QUARTER_BOUNDARIES = ["2026-03-31", "2026-06-30", "2026-09-30"];
function getPhaseIndex(weekEndIso) {
  if (weekEndIso <= QUARTER_BOUNDARIES[0]) return 0;
  if (weekEndIso <= QUARTER_BOUNDARIES[1]) return 1;
  if (weekEndIso <= QUARTER_BOUNDARIES[2]) return 2;
  return 3;
}

const expenses = [
  {"id":"fireflood","label":"Fireflood","history":[{"weekly":[17.5,17.5,17.5,17.5],"effectiveFrom":"2026-01-27"},{"weekly":[17.5,18.25,18.25,18.25],"effectiveFrom":"2026-04-03"}],"category":"Lifestyle"},
  {"id":"nicotine","label":"Nicotine","history":[{"weekly":[35,35,35,35],"effectiveFrom":"2026-01-27"},{"weekly":[30,30,30,30],"effectiveFrom":"2026-03-18"},{"weekly":[30,30,30,30],"effectiveFrom":"2026-04-01"},{"weekly":[30,25,25,25],"effectiveFrom":"2026-04-09"}],"category":"Lifestyle"},
  {"id":"kids","label":"Kids / Angel","history":[{"weekly":[450,350,350,350],"effectiveFrom":"2026-01-27"},{"weekly":[450,375,375,375],"effectiveFrom":"2026-03-25"},{"weekly":[450,525,525,525],"effectiveFrom":"2026-04-05"}],"category":"Needs"},
  {"id":"jesse","label":"Jesse (Loan + Phone)","history":[{"weekly":[100,100,60,60],"effectiveFrom":"2026-01-27"},{"weekly":[60,60,60,60],"effectiveFrom":"2026-03-18"},{"weekly":[60,50,50,30],"effectiveFrom":"2026-04-03"}],"category":"Needs"},
  {"id":"exp_1775652140160","label":"Car Insurance","history":[{"weekly":[32.5,32.5,32.5,32.5],"effectiveFrom":"2026-04-08"}],"category":"Needs"},
  {"id":"exp_1775678458649","label":"Gas","history":[{"weekly":[100,50,50,50],"effectiveFrom":"2026-04-09"}],"category":"Needs"},
  {"id":"loan_1773892258930","label":"iPhone 17","history":[{"weekly":[3,3,3,3],"effectiveFrom":"2026-03-08"},{"weekly":[0,0,0,0],"effectiveFrom":"2029-06-30"}],"category":"Loans"},
  {"id":"exp_1775678501526","label":"Car Payment","history":[{"weekly":[75,50,50,50],"effectiveFrom":"2026-04-09"}],"category":"Needs"},
  {"id":"loan_1774411495472","label":"Labtop","history":[{"weekly":[33,33,33,33],"effectiveFrom":"2026-03-25"},{"weekly":[0,0,0,0],"effectiveFrom":"2026-09-30"}],"category":"Loans"},
  {"id":"loan_1774411574883","label":"Airpods","history":[{"weekly":[17.5,17.5,17.5,17.5],"effectiveFrom":"2026-03-25"},{"weekly":[0,0,0,0],"effectiveFrom":"2026-09-30"}],"category":"Loans"},
  {"id":"exp_1775798727338","label":"Housing","history":[{"weekly":[50,50,50,50],"effectiveFrom":"2026-04-10"}],"category":"Needs"},
  {"id":"exp_1773889318142","label":"Phone Service","history":[{"weekly":[60,60,60,60],"effectiveFrom":"2026-03-18"},{"weekly":[50.001,12.5,12.5,12.5],"effectiveFrom":"2026-04-03"}],"category":"Needs"},
  {"id":"food","label":"Food","history":[{"weekly":[65,65,65,65],"effectiveFrom":"2026-01-27"},{"weekly":[65,75,75,75],"effectiveFrom":"2026-04-04"}],"category":"Needs"},
  {"id":"exp_1774678531647","label":"Claude","history":[{"weekly":[5,5,5,5],"effectiveFrom":"2026-03-28"}],"category":"Lifestyle"},
  {"id":"exp_1775190804332","label":"GPT","history":[{"weekly":[5,5,5,5],"effectiveFrom":"2026-04-02"}],"category":"Lifestyle"},
  {"id":"exp_1773959427067","label":"Disney+ Bundle","history":[{"weekly":[0,20,20,20],"effectiveFrom":"2026-03-20"},{"weekly":[0,5,5,5],"effectiveFrom":"2026-04-03"}],"category":"Lifestyle"},
  {"id":"exp_1774641421041","label":"TRW","history":[{"weekly":[12.5,12.5,12.5,12.5],"effectiveFrom":"2026-03-27"}],"category":"Lifestyle"},
  {"id":"exp_1775678425375","label":"Walmart+","history":[{"weekly":[1.25,1.25,1.25,1.25],"effectiveFrom":"2026-04-08"}],"category":"Lifestyle"},
];

// Representative future week: idx 15 (2026-04-20, Phase 1)
const weekEnd15 = "2026-04-20";
const phase15 = getPhaseIndex(weekEnd15);
console.log(`=== WEEK 15 (${weekEnd15}, Phase ${phase15}) EXPENSE BREAKDOWN ===`);
let total15 = 0;
for (const exp of expenses) {
  const amt = getEffectiveAmount(exp, weekEnd15, phase15);
  if (amt > 0) {
    total15 += amt;
    console.log(`  ${exp.label.padEnd(28)} $${amt.toFixed(2)}`);
  }
}
console.log(`  ${"TOTAL".padEnd(28)} $${total15.toFixed(2)}`);

// All future weeks (today = 2026-04-14, future = weekEnd > 2026-04-14, active = idx >= 7)
const fy = new Date(2026, 0, 5);
const futureWeeks = [];
for (let i = 0; i <= 52; i++) {
  const d = new Date(fy);
  d.setDate(d.getDate() + i*7);
  const iso = d.toISOString().slice(0,10);
  if (iso > "2026-04-14" && i >= 7) futureWeeks.push({ idx: i, weekEnd: iso });
}

let totalRemainingSpend = 0;
for (const w of futureWeeks) {
  const pi = getPhaseIndex(w.weekEnd);
  for (const exp of expenses) totalRemainingSpend += getEffectiveAmount(exp, w.weekEnd, pi);
}
const avgWeeklySpend = totalRemainingSpend / futureWeeks.length;
console.log(`\nFuture weeks: ${futureWeeks.length} (idx ${futureWeeks[0].idx}–${futureWeeks[futureWeeks.length-1].idx})`);
console.log(`totalRemainingSpend:      $${totalRemainingSpend.toFixed(2)}`);
console.log(`avgWeeklySpend:           $${avgWeeklySpend.toFixed(2)}`);
console.log(`monthly expenses (x52/12): $${(avgWeeklySpend * 52/12).toFixed(2)}`);

// Phase breakdown
for (let ph = 0; ph <= 3; ph++) {
  const phWeeks = futureWeeks.filter(w => getPhaseIndex(w.weekEnd) === ph);
  if (phWeeks.length === 0) continue;
  let phTotal = 0;
  for (const w of phWeeks) {
    const pi = getPhaseIndex(w.weekEnd);
    for (const exp of expenses) phTotal += getEffectiveAmount(exp, w.weekEnd, pi);
  }
  const phAvg = phTotal / phWeeks.length;
  console.log(`Phase ${ph} (${phWeeks.length} wks): avg $${phAvg.toFixed(2)}/wk`);
}

// Sorted by amount (phase 1 snapshot)
console.log("\n=== EXPENSE RANKING (Phase 1 effective, wk15) ===");
const ranked = expenses
  .map(e => ({ label: e.label, amt: getEffectiveAmount(e, weekEnd15, phase15), cat: e.category }))
  .sort((a,b) => b.amt - a.amt);
for (const r of ranked) {
  if (r.amt > 0) console.log(`  ${r.label.padEnd(28)} $${r.amt.toFixed(2)}  [${r.cat}]`);
}

// Goals funded spend (completed goals)
const completedGoals = [
  { label: "Laywer + Fines", target: 500 },
  { label: "Chevy Car Insurance and Registration", target: 250 },
];
const fundedGoalSpend = completedGoals.reduce((s,g) => s+g.target, 0);
console.log(`\nfundedGoalSpend: $${fundedGoalSpend} (completed goals absorbed)`);

// weeklyIncome from audit script = 1025.79
const weeklyIncome = 1025.79;
const projectedAnnualNet = 53341.19;
const weeksRemaining = futureWeeks.length;
const weeklyRemainder = weeklyIncome - avgWeeklySpend;
console.log(`\n=== BUDGET PANEL MATH ===`);
console.log(`weeklyIncome:             $${weeklyIncome.toFixed(2)}`);
console.log(`avgWeeklySpend:           $${avgWeeklySpend.toFixed(2)}`);
console.log(`weekly surplus:           $${weeklyRemainder.toFixed(2)}`);
console.log(`weeksRemaining:           ${weeksRemaining}`);
console.log(`fundedGoalSpend:          $${fundedGoalSpend}`);
const adjSavings = weeklyRemainder * weeksRemaining - fundedGoalSpend;
console.log(`adj projected savings:    $${adjSavings.toFixed(2)}`);
const activeGoalsTotal = 2500 + 3000; // Angel Emergency Fund + FHA Down Payment
console.log(`active goals total:       $${activeGoalsTotal}`);
console.log(`surplus after all goals:  $${(adjSavings - activeGoalsTotal).toFixed(2)}`);

// Home panel
const monthlyTakeHome = (projectedAnnualNet - fundedGoalSpend) / 12;
const netWorthTrend = (weeklyIncome - avgWeeklySpend) * 52 - fundedGoalSpend;
console.log(`\n=== HOME PANEL MATH ===`);
console.log(`monthly take-home (adjustedTakeHome/12): $${monthlyTakeHome.toFixed(2)}`);
console.log(`net worth trend (surplus*52 - funded):   $${netWorthTrend.toFixed(2)}`);
console.log(`budget health % (spend/income):          ${(avgWeeklySpend/weeklyIncome*100).toFixed(1)}%`);
console.log(`monthly expenses (avgSpend*52/12):       $${(avgWeeklySpend*52/12).toFixed(2)}`);
