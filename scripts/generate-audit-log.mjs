import { writeFileSync } from 'node:fs';
import { DEFAULT_CONFIG } from '../src/constants/config.js';
import { buildYear, traceExpenseCalculationSteps } from '../src/lib/finance.js';

const cfg = {
  ...DEFAULT_CONFIG,
  setupComplete: true,
  employerPreset: 'DHL',
  startingWeekIsLong: true,
  dhlCustomSchedule: false,
};

const expenses = [
  {
    id: 'rent',
    label: 'Rent',
    weekly: [350, 350, 350, 350],
    history: [{ effectiveFrom: '2026-01-05', weekly: [350, 350, 350, 350] }],
  },
  {
    id: 'car-loan',
    label: 'Car Loan',
    weekly: [95, 95, 95, 95],
    history: [
      { effectiveFrom: '2026-01-05', weekly: [95, 95, 95, 95] },
      { effectiveFrom: '2026-04-01', weekly: [95, 120, 120, 120] },
    ],
  },
  {
    id: 'insurance',
    label: 'Insurance',
    weekly: [45, 55, 55, 65],
    history: [{ effectiveFrom: '2026-01-05', weekly: [45, 55, 55, 65] }],
  },
];

const allWeeks = buildYear(cfg);
const futureWeeks = allWeeks.filter(w => w.active).slice(0, 16);

const audit = traceExpenseCalculationSteps({
  cfg,
  expenses,
  futureWeeks,
  showExtra: true,
  extraPerCheck: 30,
  bufferPerWeek: 50,
  // From provided screenshots: Q2/Q3/Q4 Weekly Spend values.
  // Q1 omitted because it was not included in the screenshot set.
  observedQuarterlySpendByPhase: [null, 757, 794, 774],
});

writeFileSync('docs/audit-log.md', audit.markdown, 'utf8');
console.log('Wrote docs/audit-log.md');
