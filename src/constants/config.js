// ─────────────────────────────────────────────────────────────
// CONFIG — all income constants, fully editable
// taxedWeeks replaces taxedRanges — flat array, togglable per week
// ─────────────────────────────────────────────────────────────
export const PAYCHECKS_PER_YEAR = { weekly: 52, biweekly: 26, monthly: 12, salary: 26 };

export const DEFAULT_CONFIG = {
  // ── Wizard gate fields ──────────────────────────────────────
  setupComplete: false,        // true once setup wizard completes; gates first-run flow
  taxExemptOptIn: false,       // true once user accepts tax exempt disclaimer (Step 8)
  bufferEnabled: true,         // when true, paycheckBuffer is excluded from all spendable math
  paycheckBuffer: 50,          // $/week excluded per check (bufferEnabled must be true); max $200
  bufferOverrideAck: false,    // legacy — kept for backward compat with existing saved data

  // ── Employer preset ─────────────────────────────────────────
  employerPreset: null,        // "DHL" | null — drives rotation, bucket, dual-rate logic
  startingWeekIsLong: null,    // DHL only: true = first active week is the higher-hour (long) week; null = derive from dhlTeam
  // ── DHL team preset (standard rotation — not Anthony's custom schedule) ──
  // null = Anthony's custom override (hardcoded day arrays in buildYear)
  // "A" | "B" = standard preset; startingWeekIsLong auto-derived from DHL_PRESET.teams[dhlTeam]
  dhlTeam: null,               // "A" | "B" | null
  dhlOtOnWeekend: false,       // true = mandatory OT day is typically Sat/Sun on short (4-day) weeks (adds diffRate)
  dhlCustomSchedule: false,    // false = use DHL_PRESET.rotation days; true = custom/hardcoded arrays (Anthony)
  dhlNightShift: true,         // true = night shift; applies nightDiffRate on all hours in buildYear()

  // ── Schedule type (non-DHL users) ───────────────────────────
  scheduleIsVariable: false,   // true = pay varies week-to-week (two paystub calculators)
  standardWeeklyHours: 40,     // standard path only — flat hours per week baseline
  // customWeeklyHours: when set, overrides the rotation-derived hours in buildYear() for all
  // income projections and goal timelines. Three tiers:
  //   DHL preset   (customWeeklyHours: null)  — rotation drives hours; weekly conf picks OT day
  //   DHL custom   (customWeeklyHours: 60)    — flat 60h/week; rotation still shown in weekly conf
  //   Non-DHL      (customWeeklyHours: N)     — flat N h/week; no rotation; simplified conf
  // null = inactive — rotation or standardWeeklyHours is used instead.
  customWeeklyHours: null,
  // Sprint 2 (custom schedule): optional per-week-type overrides for DHL custom schedules.
  // When set, finance resolution prefers these over customWeeklyHours:
  //   long week  -> customWeeklyHoursLong
  //   short week -> customWeeklyHoursShort
  // If null, falls back to customWeeklyHours, then to rotation-derived hours.
  customWeeklyHoursLong: null,
  customWeeklyHoursShort: null,

  // ── Pay structure ────────────────────────────────────────────
  baseRate: 19.65, shiftHours: 12, diffRate: 1.75, nightDiffRate: 1.50, otThreshold: 40, otMultiplier: 1.5,
  commissionMonthly: 0,          // $ / month average; 0 = not a commission job

  // ── Deductions / benefits ────────────────────────────────────
  // selectedBenefits: array of benefit IDs the user has enrolled in (wizard step 3)
  selectedBenefits: [],
  // Per-benefit per-paycheck dollar deductions (0 = not enrolled / not tracked)
  healthPremium: 0,   // Health / Medical insurance deduction per paycheck
  dentalPremium: 0,   // Dental insurance deduction per paycheck
  visionPremium: 0,   // Vision insurance deduction per paycheck
  ltd: 0,             // Long-Term Disability deduction per paycheck
  stdWeekly: 0,       // Short-Term Disability deduction per paycheck
  lifePremium: 0,     // Life / AD&D deduction per paycheck
  hsaWeekly: 0,       // HSA contribution per paycheck
  fsaWeekly: 0,       // FSA contribution per paycheck
  // 401(k) — rate fields + start date
  k401Rate: 0, k401MatchRate: 0, k401StartDate: null,
  // Benefits start date — when health/dental/vision coverage activates
  benefitsStartDate: null,        // "YYYY-MM-DD" | null = already active / not enrolled
  // Other recurring deductions not covered by preset benefit fields
  // Array of { id, label, weeklyAmount } — each entry stores a per-paycheck amount
  otherDeductions: [],
  // Attendance policy — whether employer uses a formal points/hours-based system
  // null = not yet answered (wizard gate); true = bucket model active; false = log-only
  attendanceBucketEnabled: null,  // DHL users: always null (bucket handled separately)

  // ── Schedule ─────────────────────────────────────────────────
  startDate: null,             // "YYYY-MM-DD" job start — used to derive firstActiveIdx; null = not yet set
  firstActiveIdx: 7,

  // ── Tax rates — generalized (wizard-derived) ─────────────────
  // These replace the old w1/w2 naming which was DHL-specific.
  // fedRateLow/stateRateLow = shorter/consistent paycheck rate
  // fedRateHigh/stateRateHigh = longer paycheck rate (equals Low if not variable)
  fedRateLow: 0.0784,          // replaces w1FedRate
  fedRateHigh: 0.1283,         // replaces w2FedRate
  stateRateLow: 0.0338,        // replaces w1StateRate
  stateRateHigh: 0.040,        // replaces w2StateRate
  // taxRatesEstimated: true when rates were pre-filled from STATE_TAX_TABLE or DHL preset
  // rather than derived from an actual paystub. Cleared when user confirms real stub rates.
  // Drives "est." badge in IncomePanel on all tax-derived figures.
  taxRatesEstimated: false,

  // ── Legacy rate fields — kept for backward-compat fallback ───
  // finance.js computeNet() falls back to these if fedRateLow not set on old rows.
  // Remove after migration confirmed safe.
  w1FedRate: 0.0784, w2FedRate: 0.1283, w1StateRate: 0.0338, w2StateRate: 0.040,

  // ── FICA / federal tax constants ─────────────────────────────
  ficaRate: 0.0765, fedStdDeduction: 15000,

  // ── State tax ────────────────────────────────────────────────
  userState: "MO",             // two-letter code; drives STATE_TAX_TABLE lookup
  moFlatRate: 0.047,           // kept as fallback; replaced by stateTax() in state sprint

  // ── Annual tax strategy ──────────────────────────────────────
  targetOwedAtFiling: 1000,

  // ── Tax schedule ─────────────────────────────────────────────
  taxedWeeks: [7, 8, 19, 20, 21, 22, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
  // Optional overrides for prior weeks, used only by remediation math.
  // Record shape: { [weekIdx: number]: boolean } where true=taxed, false=exempt.
  pastWeekTaxStatusOverrides: {},

  // ── DHL attendance bucket (DHL preset only) ──────────────────
  bucketStartBalance: 64,      // hours — new hire starting balance
  bucketCap: 128,              // hours — overflow above this pays out as cash
  bucketPayoutRate: 9.825,     // $/hr for overflow hours (baseRate / 2 ≈ 9.825 at DHL rates)
  bucketBalanceOverride: null, // hours — when set, replaces computed currentBalance; null = auto-compute
  ptoHoursOverride: null,     // hours — when set, replaces computed PTO accrual balance; null = auto-compute

  // ── Pay period ───────────────────────────────────────────────
  payPeriodEndDay: 0,          // day-of-week pay period closes: 0=Sun, 1=Mon, ..., 6=Sat
  userPaySchedule: "weekly",   // how often the user receives a paycheck: "weekly" | "biweekly" | "monthly" | "salary"
  annualSalary: null,          // salary workers only: gross annual pay; baseRate is auto-derived (annualSalary / 2080)
};

export const FISCAL_YEAR_START = "2026-01-05"; // week 0 end date — first Monday of the fiscal year
export const PTO_RATE = 19.65;
export const WEEKS_REMAINING = 44;
// Quarter end-of-period cutoff dates (Q1→Q2, Q2→Q3, Q3→Q4 boundaries)
export const QUARTER_BOUNDARIES = ["2026-03-31", "2026-06-30", "2026-09-30"];

// ─────────────────────────────────────────────────────────────
// DHL EMPLOYER PRESET
//
// Standard DHL B-team rotation (used for new wizard users):
//   Long week:  4 core shifts (Tue/Wed/Sat/Sun) + 1 required OT = 5 working days (60h)
//   Short week: 3 core shifts (Mon/Thu/Fri)     + 1 required OT = 4 working days (48h)
//   requiredOtShifts = 1 for both rotation types; user picks the day in WeekConfirmModal.
//
// DHL custom hours (customWeeklyHours set, e.g. 60):
//   Rotation day arrays are preserved for WeekConfirmModal display.
//   Projection math uses customWeeklyHours as the flat weekly total instead.
//   requiredOtShifts derived from (customWeeklyHours - coreHours) / shiftHours:
//     Long week  core = 48h → (60−48)/12 = 1 OT shift
//     Short week core = 36h → (60−36)/12 = 2 OT shifts
//
// dhlCustomSchedule (legacy, kept for migration reads only):
//   Was used to activate hardcoded 6-Day/4-Day arrays for Anthony's old schedule.
//   Replaced by customWeeklyHours; will be removed after migration window closes.
//
// DHL_PRESET.rotation is used by buildYear() for all DHL rotation logic.
// Day index: 0=Sun  1=Mon  2=Tue  3=Wed  4=Thu  5=Fri  6=Sat
// ─────────────────────────────────────────────────────────────
export const DHL_PRESET = {
  rotation: {
    // Short week — 3 required shifts
    short: {
      days: [1, 4, 5],            // Mon, Thu, Fri
      label: "Short Week (Mon / Thu / Fri core + OT)",
      displayName: "Short Week",
      baseHours: 36,              // 3 × 12h core hours; OT adds the 4th shift
      weekendShifts: 1,           // Fri overnight earns diff only from Sat 12:00a–6:00a (½ shift)
      otDefaults: { weekday: 2, weekend: 6 }, // Tue (weekday) or Sat (weekend) as default OT choices
    },
    // Long week — 4 required shifts
    long: {
      days: [2, 3, 6, 0],        // Tue, Wed, Sat, Sun
      label: "Long Week (Tue / Wed / Sat / Sun core + OT)",
      displayName: "Long Week",
      baseHours: 48,              // 4 × 12h core hours; OT adds the 5th shift
      weekendShifts: 2,           // Sat + Sun earn diffRate (Fri not worked in long rotation)
      otDefaults: { weekday: 1 }, // Monday OT default (always weekday)
    },
  },
  // While A-team works their short (4-day) week, B-team is on long (5-day).
  // Team selection auto-derives startingWeekIsLong.
  teams: {
    A: { startsLong: false },    // A-team week 1 = short (Mon/Thu/Fri core + OT)
    B: { startsLong: true  },    // B-team week 1 = long (Tue/Wed/Sat/Sun core + OT)
  },
  // DHL mandates 1 extra 12h shift per week (required OT).
  // Worker picks any off-day for that week:
  //   Short-week off-days: Tue, Wed, Sat, Sun → Sat/Sun OT earns diffRate (dhlOtOnWeekend flag)
  //   Long-week off-days: Mon, Thu, Fri      → all weekdays, no diff ever applies
  requiredOtShifts: 1,
  otShiftHours: 12,
  // Preset defaults — applied to formData on team selection in the wizard
  defaults: {
    shiftHours: 12,
    otThreshold: 40,
    otMultiplier: 1.5,
    scheduleIsVariable: true,
    payPeriodEndDay: 0,          // Sunday (end of pay period after last shift)
    bucketStartBalance: 64,
    bucketCap: 128,
    bucketPayoutRate: 9.825,
    baseRate: 19.65,             // DHL base hourly rate (MO, supply chain)
    diffRate: 1.75,              // weekend shift differential (Sat 12:00a → Mon 6am window)
    nightDiffRate: 1.50,         // night shift differential; wizard Step 15 writes 0 for morning shift
    dhlNightShift: true,         // default assumption; wizard Step 15 overrides
    // ── Tax rate preset — MO supply chain, night shift (paystub-derived from Anthony's setup)
    // New DHL users get these pre-filled with taxRatesEstimated: true until they confirm their stub.
    // Morning shift users: same rates (shift affects gross, not effective tax rate).
    userState: "MO",
    fedRateLow: 0.0784,          // short / low-hour week effective federal rate
    fedRateHigh: 0.1283,         // long / high-hour week effective federal rate
    stateRateLow: 0.0338,        // short week MO effective rate
    stateRateHigh: 0.040,        // long week MO effective rate
  },
};

// DHL payroll-deduction benefit options (single source of truth for setup/profile flows).
// Count: 9 options total (8 weekly-dollar deductions + 401k rate-based deduction).
export const BENEFIT_OPTIONS = [
  { id: "health", label: "Health / Medical", sub: "Medical insurance premium", type: "weekly", field: "healthPremium", placeholder: "e.g. 18.50" },
  { id: "dental", label: "Dental", sub: "Dental insurance premium", type: "weekly", field: "dentalPremium", placeholder: "e.g. 4.00" },
  { id: "vision", label: "Vision", sub: "Vision insurance premium", type: "weekly", field: "visionPremium", placeholder: "e.g. 2.00" },
  { id: "ltd", label: "Long-Term Disability", sub: "LTD insurance — per-paycheck deduction", type: "weekly", field: "ltd", placeholder: "e.g. 12.00" },
  { id: "std", label: "Short-Term Disability", sub: "STD insurance — per-paycheck deduction", type: "weekly", field: "stdWeekly", placeholder: "e.g. 6.50" },
  { id: "life", label: "Life / AD&D", sub: "Group life insurance premium", type: "weekly", field: "lifePremium", placeholder: "e.g. 5.00" },
  { id: "k401", label: "401K / Retirement", sub: "Pre-tax contribution + employer match", type: "k401" },
  { id: "hsa", label: "HSA", sub: "Health Savings Account — per-paycheck contribution", type: "weekly", field: "hsaWeekly", placeholder: "e.g. 25.00" },
  { id: "fsa", label: "FSA", sub: "Flexible Spending Account — per-paycheck contribution", type: "weekly", field: "fsaWeekly", placeholder: "e.g. 18.00" },
];

export const FED_BRACKETS = [[11925, 0.10], [48475, 0.12], [103350, 0.22], [Infinity, 0.24]];

// ─────────────────────────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────────────────────────
export const PHASES = [
  { id: "q1", label: "Jan–Mar", description: "Jan 1 → Mar 31", color: "#00c896" },
  { id: "q2", label: "Apr–Jun", description: "Apr 1 → Jun 30", color: "#00c896" },
  { id: "q3", label: "Jul–Sep", description: "Jul 1 → Sep 30", color: "#00c896" },
  { id: "q4", label: "Oct–Dec", description: "Oct 1 → Dec 31", color: "#00c896" },
];

const DEFAULT_FOOD_WEEKLY = 100; // $400 / month baseline during first-time setup
export const INITIAL_EXPENSES = [
  {
    id: "exp_default_food",
    category: "Needs",
    label: "Food",
    isFoodPrimary: true,
    isFoodHighlighted: true, // UI-safe flag for future visual emphasis
    note: ["", "", "", ""],
    billingMeta: { amount: 400, cycle: "every30days", effectiveFrom: FISCAL_YEAR_START },
    history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [DEFAULT_FOOD_WEEKLY, DEFAULT_FOOD_WEEKLY, DEFAULT_FOOD_WEEKLY, DEFAULT_FOOD_WEEKLY] }],
  },
];

export const INITIAL_GOALS = [];

export const INITIAL_LOGS = [];

export const EVENT_TYPES = {
  missed_unpaid:     { label: "Missed Shift (Unpaid/Approved)", color: "var(--color-red)", icon: "✕" },
  missed_unapproved: { label: "Missed Work (Unapproved)",       color: "#e8622a", icon: "⚠" },
  pto:               { label: "PTO Used",                       color: "#7a8bbf", icon: "◷" },
  pto_unapproved:    { label: "PTO Used (Unapproved)",          color: "#c8922a", icon: "⚠" },
  partial:           { label: "Partial Shift",                  color: "var(--color-gold)", icon: "◑" },
  bonus:             { label: "Bonus / Extra Pay",              color: "var(--color-green)", icon: "+" },
  other_loss:        { label: "Other Income Loss",              color: "#888",    icon: "−" },
};

export const CATEGORY_COLORS = { Needs: "#c96060", Lifestyle: "#5B8CFF" };
export const CATEGORY_BG = { Needs: "#130a0a", Lifestyle: "#0b1022" };
export const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
