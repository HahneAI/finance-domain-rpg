import { baseRow } from "./lib.mjs";
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const rq = (n) => Math.round(n * 4) / 4;
const PER_MONTH = { weekly: 4, biweekly: 2, every30days: 1 };
/** An expense shaped exactly like the app's own (history + billingMeta [+ dueDateAnchor]). */
export function bill({ id, label, amount, cycle = "every30days", anchor = null, category = "Needs" }) {
  const w = rq(amount * (PER_MONTH[cycle] ?? 1) / 4);
  const e = { id, label, category, note: ["", "", "", ""], history: [{ effectiveFrom: "2026-01-05", weekly: [w, w, w, w] }], billingMeta: { amount, cycle, effectiveFrom: "2026-01-05" } };
  if (anchor) e.dueDateAnchor = anchor;
  return e;
}
/** A bill deleted the way the app stores deletion: kept in the array, zeroed forward. */
export function deletedBill(args) { const b = bill(args); b.history = [...b.history, { effectiveFrom: "2026-06-01", weekly: [0, 0, 0, 0] }]; return b; }
export function rowWith(expenses, cfg = {}) { const row = baseRow(); row.expenses = expenses; Object.assign(row.config, cfg); return row; }
export const njsConfig = (todayIso, cash = 800) => ({ newJobSeasonMode: true, newJobSeasonDate: todayIso, newJobSeasonCashOnHand: cash, newJobSeasonCashOnHandAsOf: todayIso, unemploymentEnabled: false });
