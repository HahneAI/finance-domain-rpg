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
};

export const PTO_RATE = 19.65;
export const WEEKS_REMAINING = 44;
// Approximate phase weights out of 44 remaining weeks
export const PHASE_WEIGHTS = [6, 13, 25];

export const FED_BRACKETS = [[11925, 0.10], [48475, 0.12], [103350, 0.22], [Infinity, 0.24]];

// ─────────────────────────────────────────────────────────────
// STATIC DATA
// ─────────────────────────────────────────────────────────────
export const PHASES = [
  { id: "p1", label: "Phase 1", description: "Now → Mid-April", color: "#7eb8c9" },
  { id: "p2", label: "Phase 2", description: "Mid-April → July", color: "#c9a96e" },
  { id: "p3", label: "Phase 3", description: "August → Year End", color: "#a96ec9" },
];

export const INITIAL_EXPENSES = [
  { id: "housing", category: "Needs", label: "Housing", weekly: [50, 125, 125], note: ["Staying w/ family", "Trailer split w/ brother (incl. electric + internet)", "Trailer split w/ brother (incl. electric + internet)"] },
  { id: "kids", category: "Needs", label: "Kids / Angel", weekly: [450, 350, 350], note: ["Extra support, pregnancy help", "Minimum child support baseline", "Minimum child support baseline"] },
  { id: "food", category: "Needs", label: "Food", weekly: [65, 65, 65], note: ["", "", ""] },
  { id: "jesse", category: "Needs", label: "Jesse (Loan + Phone)", weekly: [100, 100, 60], note: ["Loan $35 + phone $15 + extra", "Loan $35 + phone $15 + extra", "Loan paid off — phone only"] },
  { id: "nicotine", category: "Lifestyle", label: "Nicotine", weekly: [35, 35, 35], note: ["", "", ""] },
  { id: "rumble", category: "Lifestyle", label: "Rumble", weekly: [2.50, 2.50, 2.50], note: ["", "", ""] },
  { id: "walmart", category: "Lifestyle", label: "Walmart+", weekly: [3.75, 3.75, 3.75], note: ["", "", ""] },
  { id: "fireflood", category: "Lifestyle", label: "Fireflood", weekly: [17.50, 17.50, 17.50], note: ["$70/mo", "$70/mo", "$70/mo"] },
  { id: "cashapp", category: "Transfers", label: "CashApp Transfer", weekly: [125, 125, 125], note: ["Direct deposit benefit trigger", "Direct deposit benefit trigger", "Direct deposit benefit trigger"] },
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
  id: 1, weekEnd: "2026-03-16", weekIdx: 10, weekRotation: "Week 2",
  type: "missed_unpaid", shiftsLost: 3, weekendShifts: 0, ptoHours: 0, hoursLost: 0, amount: 0,
  workedDays: "Fri, Sat, Sun", missedDays: "Tue, Wed, Thu",
  note: "Worked Fri/Sat/Sun only (36h instead of 72h) — 3 days missed unpaid",
}];

export const EVENT_TYPES = {
  missed_unpaid: { label: "Missed Shift (Unpaid)", color: "#e8856a", icon: "✕" },
  pto: { label: "PTO Used", color: "#7a8bbf", icon: "◷" },
  partial: { label: "Partial Shift", color: "#c8a84b", icon: "◑" },
  bonus: { label: "Bonus / Extra Pay", color: "#6dbf8a", icon: "+" },
  other_loss: { label: "Other Income Loss", color: "#888", icon: "−" },
};

export const CATEGORY_COLORS = { Needs: "#e8856a", Lifestyle: "#7a8bbf", Transfers: "#888" };
export const CATEGORY_BG = { Needs: "#2a1a16", Lifestyle: "#1a1a2d", Transfers: "#1e1e1e" };
export const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
