// ─────────────────────────────────────────────────────────────
// CONFIG — all income constants, fully editable
// taxedWeeks replaces taxedRanges — flat array, togglable per week
// ─────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  // ── Wizard gate fields ──────────────────────────────────────
  setupComplete: false,        // true once setup wizard completes; gates first-run flow
  taxExemptOptIn: false,       // true once user accepts tax exempt disclaimer (Step 8)
  bufferEnabled: true,         // when true, paycheckBuffer is excluded from all spendable math
  paycheckBuffer: 50,          // $/week excluded per check (bufferEnabled must be true); max $200
  bufferOverrideAck: false,    // legacy — kept for backward compat with existing saved data

  // ── Employer preset ─────────────────────────────────────────
  employerPreset: null,        // "DHL" | null — drives rotation, bucket, dual-rate logic
  startingWeekIsLong: null,    // DHL only: true = first active week is long (6-day); null = use dhlTeam to derive
  // ── DHL team preset (standard rotation — not Anthony's custom schedule) ──
  // null = Anthony's custom override (hardcoded day arrays in buildYear)
  // "A" | "B" = standard preset; startingWeekIsLong auto-derived from DHL_PRESET.teams[dhlTeam]
  dhlTeam: null,               // "A" | "B" | null
  dhlOtOnWeekend: false,       // true = mandatory OT day is typically Sat/Sun on 3-day weeks (adds diffRate)
  dhlCustomSchedule: false,    // false = use DHL_PRESET.rotation days; true = custom/hardcoded arrays (Anthony)
  dhlNightShift: true,         // true = night shift; applies nightDiffRate on all hours in buildYear()

  // ── Schedule type (non-DHL users) ───────────────────────────
  scheduleIsVariable: false,   // true = pay varies week-to-week (two paystub calculators)
  standardWeeklyHours: 40,     // standard path only — flat hours per week baseline

  // ── Pay structure ────────────────────────────────────────────
  baseRate: 19.65, shiftHours: 12, diffRate: 3.00, nightDiffRate: 1.50, otThreshold: 40, otMultiplier: 1.5,
  commissionMonthly: 0,          // $ / month average; 0 = not a commission job

  // ── Deductions / benefits ────────────────────────────────────
  // selectedBenefits: array of benefit IDs the user has enrolled in (wizard step 3)
  selectedBenefits: [],
  // Per-benefit weekly dollar deductions (0 = not enrolled / not tracked)
  healthPremium: 0,   // Health / Medical insurance weekly premium
  dentalPremium: 0,   // Dental insurance weekly premium
  visionPremium: 0,   // Vision insurance weekly premium
  ltd: 0,             // Long-Term Disability flat weekly deduction
  stdWeekly: 0,       // Short-Term Disability flat weekly deduction
  lifePremium: 0,     // Life / AD&D insurance weekly premium
  hsaWeekly: 0,       // HSA contribution per week
  fsaWeekly: 0,       // FSA contribution per week
  // 401(k) — rate fields + start date
  k401Rate: 0, k401MatchRate: 0, k401StartDate: null,
  // Benefits start date — when health/dental/vision coverage activates
  benefitsStartDate: null,        // "YYYY-MM-DD" | null = already active / not enrolled
  // Other recurring deductions not covered by preset benefit fields
  // Array of { id, label, weeklyAmount } — user-defined, add/remove from wizard
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

  // ── DHL attendance bucket (DHL preset only) ──────────────────
  bucketStartBalance: 64,      // hours — new hire starting balance
  bucketCap: 128,              // hours — overflow above this pays out as cash
  bucketPayoutRate: 9.825,     // $/hr for overflow hours (baseRate / 2 ≈ 9.825 at DHL rates)

  // ── Pay period ───────────────────────────────────────────────
  payPeriodEndDay: 0,          // day-of-week pay period closes: 0=Sun, 1=Mon, ..., 6=Sat
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
//   Long week:  4 shifts (Tue/Wed/Sat/Sun) — 48h
//   Short week: 3 shifts (Mon/Thu/Fri)     — 36h
//
// Anthony's custom schedule (dhlCustomSchedule: true):
//   Long week:  4 standard + 2 scheduled OT = 6-Day (Tue–Sun, 72h)
//   Short week: 3 standard + 1 scheduled OT = 4-Day (Mon/Wed/Thu/Fri, 48h)
//   OT is baked into his hardcoded day arrays in buildYear(); new standard
//   users get the preset rotation only (no OT pre-baked).
//
// DHL_PRESET.rotation is used by buildYear() for standard users.
// Anthony's row: dhlTeam="B", dhlCustomSchedule=true → hardcoded arrays.
//
// Day index: 0=Sun  1=Mon  2=Tue  3=Wed  4=Thu  5=Fri  6=Sat
// ─────────────────────────────────────────────────────────────
export const DHL_PRESET = {
  rotation: {
    // Short week — 3 required shifts
    short: {
      days: [1, 4, 5],            // Mon, Thu, Fri
      label: "3-Day (Mon / Thu / Fri)",
      baseHours: 36,              // 3 × 12h
      weekendShifts: 0,
    },
    // Long week — 4 required shifts
    long: {
      days: [2, 3, 6, 0],        // Tue, Wed, Sat, Sun
      label: "4-Day (Tue / Wed / Sat / Sun)",
      baseHours: 48,              // 4 × 12h
      weekendShifts: 2,           // Sat + Sun earn diffRate
    },
  },
  // While A-team works their short (3-day) week, B-team is on long (4-day).
  // Team selection auto-derives startingWeekIsLong.
  teams: {
    A: { startsLong: false },    // A-team week 1 = short (Mon/Thu/Fri)
    B: { startsLong: true  },    // B-team week 1 = long (Tue/Wed/Sat/Sun)
  },
  // DHL mandates 1 extra 12h shift per week (required OT).
  // Worker picks any off-day for that week:
  //   3-day off-days: Tue, Wed, Sat, Sun → Sat/Sun OT earns diffRate (dhlOtOnWeekend flag)
  //   4-day off-days: Mon, Thu, Fri      → all weekdays, no diff ever applies
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
    diffRate: 3.00,              // weekend shift differential
    nightDiffRate: 1.50,         // night shift differential; wizard Step 15 writes 0 for morning shift
    dhlNightShift: true,         // default assumption; wizard Step 15 overrides
    // ── Tax rate preset — MO supply chain, night shift (paystub-derived from Anthony's setup)
    // New DHL users get these pre-filled with taxRatesEstimated: true until they confirm their stub.
    // Morning shift users: same rates (shift affects gross, not effective tax rate).
    userState: "MO",
    fedRateLow: 0.0784,          // short / 4-day week effective federal rate
    fedRateHigh: 0.1283,         // long / 6-day week effective federal rate
    stateRateLow: 0.0338,        // short week MO effective rate
    stateRateHigh: 0.040,        // long week MO effective rate
  },
};

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

export const INITIAL_EXPENSES = [];

export const INITIAL_GOALS = [];

export const INITIAL_LOGS = [];

export const EVENT_TYPES = {
  missed_unpaid:     { label: "Missed Shift (Unpaid/Approved)", color: "var(--color-red)", icon: "✕" },
  missed_unapproved: { label: "Missed Work (Unapproved)",       color: "#e8622a", icon: "⚠" },
  pto:               { label: "PTO Used",                       color: "#7a8bbf", icon: "◷" },
  partial:           { label: "Partial Shift",                  color: "var(--color-gold)", icon: "◑" },
  bonus:             { label: "Bonus / Extra Pay",              color: "var(--color-green)", icon: "+" },
  other_loss:        { label: "Other Income Loss",              color: "#888",    icon: "−" },
};

export const CATEGORY_COLORS = { Needs: "#c96060", Lifestyle: "#5B8CFF", Transfers: "#888" };
export const CATEGORY_BG = { Needs: "#130a0a", Lifestyle: "#0b1022", Transfers: "#111" };
export const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
