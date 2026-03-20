// ─────────────────────────────────────────────────────────────
// CONFIG — all income constants, fully editable
// taxedWeeks replaces taxedRanges — flat array, togglable per week
// ─────────────────────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  baseRate: 21.15, shiftHours: 12, diffRate: 3.00, otThreshold: 40, otMultiplier: 1.5,
  ltd: 2.00, k401Rate: 0.06, k401MatchRate: 0.05, k401StartDate: "2026-05-15",
  firstActiveIdx: 7, w2FedRate: 0.1283, w2StateRate: 0.040, w1FedRate: 0.0784, w1StateRate: 0.0338,
  ficaRate: 0.0765, fedStdDeduction: 15000, moFlatRate: 0.047, targetOwedAtFiling: 1000,
  taxedWeeks: [7, 8, 19, 20, 21, 22, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52],
  bucketStartBalance: 64,   // hours — new hire starting balance
  bucketCap: 128,           // hours — overflow above this pays out as cash
  bucketPayoutRate: 9.825,  // $/hr for overflow hours (PTO_RATE / 2 ≈ 9.825)
  payPeriodEndDay: 0,       // day-of-week pay period closes: 0=Sun, 1=Mon, ..., 6=Sat
  confirmations: {},        // { [weekIdx]: { confirmedAt, dayToggles, scheduledDays, missedScheduledDays, eventId } }
};

export const FISCAL_YEAR_START = "2026-01-05"; // week 0 end date — first Monday of the fiscal year
export const PTO_RATE = 19.65;
export const WEEKS_REMAINING = 44;
// Quarter end-of-period cutoff dates (Q1→Q2, Q2→Q3, Q3→Q4 boundaries)
export const QUARTER_BOUNDARIES = ["2026-03-31", "2026-06-30", "2026-09-30"];

export const FED_BRACKETS = [[11925, 0.10], [48475, 0.12], [103350, 0.22], [Infinity, 0.24]];

// ─────────────────────────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────────────────────────
export const PHASES = [
  { id: "q1", label: "Jan–Mar", description: "Jan 1 → Mar 31", color: "#7eb8c9" },
  { id: "q2", label: "Apr–Jun", description: "Apr 1 → Jun 30", color: "#c9a96e" },
  { id: "q3", label: "Jul–Sep", description: "Jul 1 → Sep 30", color: "#a96ec9" },
  { id: "q4", label: "Oct–Dec", description: "Oct 1 → Dec 31", color: "#6dbf8a" },
];

export const INITIAL_EXPENSES = [
  { id: "housing",   category: "Needs",      label: "Housing",              note: ["Staying w/ family", "Trailer split w/ brother (incl. electric + internet)", "Trailer split w/ brother (incl. electric + internet)", "Trailer split w/ brother (incl. electric + internet)"], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [50, 125, 125, 125] }] },
  { id: "kids",      category: "Needs",      label: "Kids / Angel",         note: ["Extra support, pregnancy help", "Minimum child support baseline", "Minimum child support baseline", "Minimum child support baseline"], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [450, 350, 350, 350] }] },
  { id: "food",      category: "Needs",      label: "Food",                 note: ["", "", "", ""], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [65, 65, 65, 65] }] },
  { id: "jesse",     category: "Needs",      label: "Jesse (Loan + Phone)", note: ["Loan $35 + phone $15 + extra", "Loan $35 + phone $15 + extra", "Loan paid off — phone only", "Loan paid off — phone only"], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [100, 100, 60, 60] }] },
  { id: "nicotine",  category: "Lifestyle",  label: "Nicotine",             note: ["", "", "", ""], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [35, 35, 35, 35] }] },
  { id: "rumble",    category: "Lifestyle",  label: "Rumble",               note: ["", "", "", ""], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [2.50, 2.50, 2.50, 2.50] }] },
  { id: "walmart",   category: "Lifestyle",  label: "Walmart+",             note: ["", "", "", ""], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [3.75, 3.75, 3.75, 3.75] }] },
  { id: "fireflood", category: "Lifestyle",  label: "Fireflood",            note: ["$70/mo", "$70/mo", "$70/mo", "$70/mo"], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [17.50, 17.50, 17.50, 17.50] }] },
  { id: "cashapp",   category: "Transfers",  label: "CashApp Transfer",     note: ["Direct deposit benefit trigger", "Direct deposit benefit trigger", "Direct deposit benefit trigger", "Direct deposit benefit trigger"], history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [125, 125, 125, 125] }] },
];

export const INITIAL_GOALS = [
  { id: "g1", label: "Tickets & Fines", target: 600, color: "#e8856a", note: "Traffic tickets — may be more than $600", completed: false },
  { id: "g2", label: "SUV (Cash Purchase)", target: 3000, color: "#c9a96e", note: "Full cash buy of used vehicle", completed: false },
  { id: "g3", label: "Angel Emergency Fund", target: 1000, color: "#7eb8c9", note: "Safety net for Angel & baby", completed: false },
  { id: "g4", label: "New Phone", target: 1200, color: "#7a8bbf", note: "Personal device upgrade", completed: false },
  { id: "g5", label: "Laptop Repair", target: 300, color: "#a96ec9", note: "Dev/work laptop", completed: false },
  { id: "g6", label: "Furniture & Equipment", target: 500, color: "#6dbf8a", note: "Trailer setup", completed: false },
  { id: "g7", label: "FHA Down Payment", target: 3000, color: "#c8a84b", note: "Save $3k cash + 401k loan for remainder", completed: false },
];

export const INITIAL_LOGS = [{
  id: 1, weekEnd: "2026-03-16", weekIdx: 10, weekRotation: "6-Day",
  type: "missed_unpaid", shiftsLost: 3, weekendShifts: 0, ptoHours: 0, hoursLost: 0, amount: 0,
  workedDays: "Fri, Sat, Sun", missedDays: "Tue, Wed, Thu",
  note: "Worked Fri/Sat/Sun only (36h instead of 72h) — 3 days missed unpaid",
}];

export const EVENT_TYPES = {
  missed_unpaid:     { label: "Missed Shift (Unpaid/Approved)", color: "#e8856a", icon: "✕" },
  missed_unapproved: { label: "Missed Work (Unapproved)",       color: "#e8622a", icon: "⚠" },
  pto:               { label: "PTO Used",                       color: "#7a8bbf", icon: "◷" },
  partial:           { label: "Partial Shift",                  color: "#c8a84b", icon: "◑" },
  bonus:             { label: "Bonus / Extra Pay",              color: "#6dbf8a", icon: "+" },
  other_loss:        { label: "Other Income Loss",              color: "#888",    icon: "−" },
};

export const CATEGORY_COLORS = { Needs: "#e8856a", Lifestyle: "#7a8bbf", Transfers: "#888" };
export const CATEGORY_BG = { Needs: "#2a1a16", Lifestyle: "#1a1a2d", Transfers: "#1e1e1e" };
export const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
