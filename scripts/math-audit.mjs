// Math pipeline audit — Anthony's account (2026-04-13 snapshot)
// Run: node scripts/math-audit.mjs

const cfg = {
  baseRate: 19.65, diffRate: 1.75, ficaRate: 0.0765, k401Rate: 0.06,
  shiftHours: 12, nightDiffRate: 1.5, otThreshold: 40, otMultiplier: 1.5,
  ltd: 2, stdWeekly: 0, healthPremium: 0, dentalPremium: 0, visionPremium: 0,
  lifePremium: 0, hsaWeekly: 0, fsaWeekly: 0,
  k401StartDate: "2026-05-15", benefitsStartDate: null,
  fedRateLow: 0.0784, fedRateHigh: 0.1283,
  stateRateLow: 0.0338, stateRateHigh: 0.04,
  fedStdDeduction: 15000, targetOwedAtFiling: 1000,
  taxedWeeks: [7,8,17,18,19,20,21,22,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,52],
  firstActiveIdx: 7, startingWeekIsLong: false,
  dhlCustomSchedule: true, dhlNightShift: true,
  employerPreset: "DHL", bufferEnabled: false, paycheckBuffer: 50,
  userPaySchedule: "weekly", otherDeductions: [],
};

const FED_BRACKETS = [[11925, 0.10], [48475, 0.12], [103350, 0.22], [Infinity, 0.24]];
const MO_BRACKETS = [
  { max: 1273, rate: 0.00 }, { max: 2546, rate: 0.02 }, { max: 3819, rate: 0.025 },
  { max: 5092, rate: 0.03 }, { max: 6365, rate: 0.035 }, { max: 7638, rate: 0.04 },
  { max: 8911, rate: 0.045 }, { max: Infinity, rate: 0.047 },
];

function fedTax(income) {
  let tax = 0, prev = 0;
  for (const [limit, rate] of FED_BRACKETS) {
    if (income <= prev) break;
    tax += (Math.min(income, limit) - prev) * rate;
    prev = limit;
  }
  return tax;
}

function moTax(income) {
  let tax = 0, prev = 0;
  for (const { max, rate } of MO_BRACKETS) {
    if (income <= prev) break;
    tax += (Math.min(income, max) - prev) * rate;
    prev = max;
  }
  return tax;
}

function dhlEmployerMatchRate(k401Rate) {
  const tier1 = Math.min(k401Rate, 0.04);
  const tier2 = Math.min(Math.max(k401Rate - 0.04, 0), 0.02) * 0.5;
  return tier1 + tier2;
}

// Benefits: ltd=2, all others 0
const benefitsDeduction = cfg.ltd;
const bufferPerWeek = 0; // bufferEnabled: false

// Gross pay formulas (dhlCustomSchedule=true, dhlNightShift=true)
// Long (6-Day): Tue/Wed/Thu/Fri/Sat/Sun = 72h
//   weekendHours: Fri=6, Sat=12, Sun=12 = 30h
//   nonWknd=42, reg=40, ot=32, regWknd=0, otWknd=30
const GROSS_LONG  = 40*(19.65+1.5) + 0 + 32*(19.65+1.5)*1.5 + 30*1.75*1.5;
// Short (4-Day): Mon/Wed/Thu/Fri = 48h
//   weekendHours: Fri=6 = 6h
//   nonWknd=42, reg=40, ot=8, regWknd=0, otWknd=6
const GROSS_SHORT = 40*(19.65+1.5) + 0 + 8*(19.65+1.5)*1.5 + 6*1.75*1.5;

const k401Start = new Date("2026-05-15");
const taxedSet = new Set(cfg.taxedWeeks);

// Build 53 weeks (idx 0-52)
const [fyY, fyM, fyD] = "2026-01-05".split('-').map(Number);
const weeks = [];
let d = new Date(fyY, fyM-1, fyD);

for (let idx = 0; idx <= 52; idx++) {
  const weekEnd = new Date(d);
  const active = idx >= cfg.firstActiveIdx;
  const offset = ((idx - cfg.firstActiveIdx) % 2 + 2) % 2;
  const isHighWeek = offset === 0 ? Boolean(cfg.startingWeekIsLong) : !Boolean(cfg.startingWeekIsLong);
  const grossPay = active ? (isHighWeek ? GROSS_LONG : GROSS_SHORT) : 0;
  const has401k = active && weekEnd >= k401Start;
  const k401kEmployee = has401k ? grossPay * cfg.k401Rate : 0;
  const k401kEmployer = has401k ? grossPay * dhlEmployerMatchRate(cfg.k401Rate) : 0;
  const taxableGross = active ? Math.max(grossPay - benefitsDeduction - k401kEmployee, 0) : 0;
  const taxedBySchedule = active && taxedSet.has(idx);
  weeks.push({ idx, weekEnd: weekEnd.toISOString().slice(0,10), active, isHighWeek, grossPay, has401k, k401kEmployee, k401kEmployer, taxableGross, taxedBySchedule });
  d.setDate(d.getDate() + 7);
}

function computeNet(w, extraPerCheck = 0, showExtra = false) {
  if (!w.active) return 0;
  const fica = w.grossPay * cfg.ficaRate;
  const ded = benefitsDeduction + w.k401kEmployee;
  if (!w.taxedBySchedule) return w.grossPay - fica - ded;
  const fed = w.taxableGross * (w.isHighWeek ? cfg.fedRateHigh : cfg.fedRateLow) + (showExtra ? extraPerCheck : 0);
  const st  = w.taxableGross * (w.isHighWeek ? cfg.stateRateHigh : cfg.stateRateLow);
  return w.grossPay - fed - st - fica - ded;
}

const activeWeeks = weeks.filter(w => w.active);

// Stage 0 config
console.log("=== STAGE 0 — CONFIG ===");
console.log(`baseRate: $${cfg.baseRate}  nightDiffRate: $${cfg.nightDiffRate}  diffRate: $${cfg.diffRate}`);
console.log(`shiftHours: ${cfg.shiftHours}  otThreshold: ${cfg.otThreshold}  otMultiplier: ${cfg.otMultiplier}`);
console.log(`benefitsDeduction/wk: $${benefitsDeduction} (LTD only, stdWeekly=0)`);
console.log(`bufferPerWeek: $${bufferPerWeek} (bufferEnabled=false)`);
console.log(`taxedWeeks: ${cfg.taxedWeeks.length} weeks`);
console.log(`active weeks: ${activeWeeks.length} (idx 7–52)`);
const firstK401Week = activeWeeks.find(w => w.has401k);
console.log(`401k starts: idx ${firstK401Week?.idx} (weekEnd ${firstK401Week?.weekEnd})`);
console.log(`DHL employer match rate @ 6% employee: ${(dhlEmployerMatchRate(0.06)*100).toFixed(1)}%`);

// Stage 1 — buildYear examples
console.log("\n=== STAGE 1 — GROSS PAY ===");
console.log(`Long (6-Day): totalH=72, wkndH=30, reg=40, ot=32, regWknd=0, otWknd=30`);
console.log(`  grossPay = 40*21.15 + 32*21.15*1.5 + 30*1.75*1.5 = $${GROSS_LONG.toFixed(2)}`);
console.log(`Short (4-Day): totalH=48, wkndH=6, reg=40, ot=8, regWknd=0, otWknd=6`);
console.log(`  grossPay = 40*21.15 + 8*21.15*1.5 + 6*1.75*1.5 = $${GROSS_SHORT.toFixed(2)}`);

const longCount = activeWeeks.filter(w => w.isHighWeek).length;
const shortCount = activeWeeks.filter(w => !w.isHighWeek).length;
console.log(`Active long weeks: ${longCount}  |  Active short weeks: ${shortCount}`);
const projAnnualGross = activeWeeks.reduce((s,w) => s+w.grossPay, 0);
console.log(`Projected annual gross: $${projAnnualGross.toFixed(2)}`);

// Stage 2 — computeNet examples (no extraPerCheck yet)
console.log("\n=== STAGE 2 — NET PAY EXAMPLES (no extraPerCheck) ===");
const ex = {
  "4-Day TAXED  no 401k ": activeWeeks.find(w => w.taxedBySchedule && !w.isHighWeek && !w.has401k),
  "6-Day TAXED  no 401k ": activeWeeks.find(w => w.taxedBySchedule &&  w.isHighWeek && !w.has401k),
  "4-Day UNTAXED no 401k": activeWeeks.find(w => !w.taxedBySchedule && !w.isHighWeek && !w.has401k),
  "6-Day UNTAXED no 401k": activeWeeks.find(w => !w.taxedBySchedule &&  w.isHighWeek && !w.has401k),
  "4-Day TAXED  w/ 401k ": activeWeeks.find(w => w.taxedBySchedule && !w.isHighWeek &&  w.has401k),
  "6-Day TAXED  w/ 401k ": activeWeeks.find(w => w.taxedBySchedule &&  w.isHighWeek &&  w.has401k),
  "4-Day UNTAXED w/ 401k": activeWeeks.find(w => !w.taxedBySchedule && !w.isHighWeek &&  w.has401k),
  "6-Day UNTAXED w/ 401k": activeWeeks.find(w => !w.taxedBySchedule &&  w.isHighWeek &&  w.has401k),
};
for (const [label, w] of Object.entries(ex)) {
  if (!w) { console.log(`${label}: NOT FOUND`); continue; }
  const fica = (w.grossPay * cfg.ficaRate);
  console.log(`${label} (wk${w.idx}): gross=$${w.grossPay.toFixed(2)}, k401=$${w.k401kEmployee.toFixed(2)}, taxableG=$${w.taxableGross.toFixed(2)}, fica=$${fica.toFixed(2)}, net=$${computeNet(w).toFixed(2)}`);
}

// Stage 3 — tax derivation
console.log("\n=== STAGE 3 — TAX DERIVATION ===");
const totalTaxableGross = activeWeeks.reduce((s,w) => s + w.taxableGross, 0);
const fedAGI = Math.max(totalTaxableGross - cfg.fedStdDeduction, 0);
const fedLiability = fedTax(fedAGI);
const moLiability = moTax(totalTaxableGross);

let fedWithheld = 0, moWithheld = 0;
for (const w of activeWeeks) {
  if (w.taxedBySchedule) {
    fedWithheld += w.taxableGross * (w.isHighWeek ? cfg.fedRateHigh : cfg.fedRateLow);
    moWithheld  += w.taxableGross * (w.isHighWeek ? cfg.stateRateHigh : cfg.stateRateLow);
  }
}

const fedGap = fedLiability - fedWithheld;
const moGap  = moLiability  - moWithheld;
const totalGap = fedGap + moGap;
const targetExtraTotal = Math.max(totalGap - cfg.targetOwedAtFiling, 0);
const taxedWeekCount = cfg.taxedWeeks.length;
const extraPerCheck = targetExtraTotal / taxedWeekCount;

console.log(`totalTaxableGross: $${totalTaxableGross.toFixed(2)}`);
console.log(`fedAGI:            $${fedAGI.toFixed(2)}`);
console.log(`fedLiability:      $${fedLiability.toFixed(2)}`);
console.log(`moLiability:       $${moLiability.toFixed(2)}`);
console.log(`fedWithheld:       $${fedWithheld.toFixed(2)}`);
console.log(`moWithheld:        $${moWithheld.toFixed(2)}`);
console.log(`fedGap:            $${fedGap.toFixed(2)}`);
console.log(`moGap:             $${moGap.toFixed(2)}`);
console.log(`totalGap:          $${totalGap.toFixed(2)}`);
console.log(`targetExtraTotal:  $${targetExtraTotal.toFixed(2)}`);
console.log(`taxedWeekCount:    ${taxedWeekCount}`);
console.log(`extraPerCheck:     $${extraPerCheck.toFixed(2)}`);

// Final projectedAnnualNet (with extraPerCheck, showExtra=true)
const finalNets = activeWeeks.map(w => computeNet(w, extraPerCheck, true));
const projectedAnnualNet = finalNets.reduce((a,b) => a+b, 0);
const weeklyIncome = projectedAnnualNet / 52 - bufferPerWeek;
console.log(`\nprojectedAnnualNet (final): $${projectedAnnualNet.toFixed(2)}`);
console.log(`weeklyIncome (final):       $${weeklyIncome.toFixed(2)}`);

// 401k
const annualK401Emp = activeWeeks.reduce((s,w) => s+w.k401kEmployee, 0);
const annualK401Match = activeWeeks.reduce((s,w) => s+w.k401kEmployer, 0);
console.log(`\n=== 401K ===`);
console.log(`Employee contributions: $${annualK401Emp.toFixed(2)}`);
console.log(`Employer match:         $${annualK401Match.toFixed(2)}`);
console.log(`Year-end balance:       $${(annualK401Emp + annualK401Match).toFixed(2)}`);

// Per-week table (all active)
console.log("\n=== ALL ACTIVE WEEKS ===");
console.log("idx | weekEnd    | type  | taxed | 401k | gross     | taxableG  | net");
for (const w of activeWeeks) {
  const net = computeNet(w, extraPerCheck, true);
  console.log(
    `${String(w.idx).padStart(3)} | ${w.weekEnd} | ${w.isHighWeek ? '6-Day' : '4-Day'} | ${w.taxedBySchedule ? 'Y' : 'N'}     | ${w.has401k ? 'Y' : 'N'}    | $${w.grossPay.toFixed(2).padStart(8)} | $${w.taxableGross.toFixed(2).padStart(8)} | $${net.toFixed(2)}`
  );
}
