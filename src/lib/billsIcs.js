import { getNextDueDate } from "./expense.js";
import { isExpenseRemoved, resolvePerPaymentAmount, toLocalIso } from "./finance.js";

// One-way "bills → phone calendar" export (TODO §20.D, shotgun run #3). Pure: builds
// the text of an .ics file; the caller (Budget's export button) handles the download.
//
// Only expenses with a real due date are exported (a `dueDateAnchor`, or a loan's
// payment date) — same population as getBillsDueOn — and deleted bills are skipped.
// Recurrence mirrors getNextDueDate's own cycle math so the calendar and the app
// agree on every date: weekly/biweekly are exact, and the app's "every30days" (its
// monthly bucket) literally advances 30 days, so it exports as a 30-day interval
// rather than "monthly on the 15th", which would drift from what the app shows.
// Events end at Dec 31 of the current year (the fiscal grid is one year at a time).
const RRULES = {
  weekly: "FREQ=WEEKLY;INTERVAL=1",
  biweekly: "FREQ=WEEKLY;INTERVAL=2",
  every30days: "FREQ=DAILY;INTERVAL=30",
  yearly: "FREQ=YEARLY;INTERVAL=1",
};
const LOAN_RRULES = { weekly: RRULES.weekly, biweekly: RRULES.biweekly, monthly: RRULES.every30days };

const esc = (t) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const ymd = (iso) => iso.replace(/-/g, "");

export function buildBillsIcs(expenses, todayIso, now = new Date()) {
  const dayStart = new Date(`${todayIso}T00:00:00`);
  const monthKey = todayIso.slice(0, 7);
  const until = `${todayIso.slice(0, 4)}1231`;
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Authority Finance//Bills//EN", "CALSCALE:GREGORIAN"];
  let count = 0;
  for (const exp of expenses ?? []) {
    const isLoan = exp.type === "loan";
    if (!isLoan && !exp.dueDateAnchor) continue;
    if (isExpenseRemoved(exp, todayIso)) continue;
    const next = getNextDueDate(exp, dayStart);
    if (!next) continue;
    const amount = resolvePerPaymentAmount(exp, monthKey);
    const rule = isLoan
      ? LOAN_RRULES[exp.loanMeta?.paymentFrequency] ?? LOAN_RRULES.monthly
      : RRULES[exp.billingMeta?.cycle] ?? RRULES.every30days;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${esc(exp.id)}@authority-finance`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(toLocalIso(next))}`,
      `RRULE:${rule};UNTIL=${until}`,
      `SUMMARY:${esc(`${exp.label ?? "Bill"} due${amount > 0 ? ` — $${Math.round(amount).toLocaleString("en-US")}` : ""}`)}`,
      "END:VEVENT",
    );
    count++;
  }
  lines.push("END:VCALENDAR");
  return { ics: lines.join("\r\n") + "\r\n", count };
}

// Browser-only: hands the .ics text to the user as a file download.
export function downloadBillsIcs(icsText, filename = "authority-finance-bills.ics") {
  const url = URL.createObjectURL(new Blob([icsText], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
