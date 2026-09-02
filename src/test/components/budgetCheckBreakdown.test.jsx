import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BudgetPanel } from "../../components/BudgetPanel.jsx";
import { buildToolTestAccount } from "../../../scripts/coach-eval/fixtures/testAccount.js";
import { computeNet } from "../../lib/finance.js";
import { getFiscalWeekInfo } from "../../lib/fiscalWeek.js";

// jsdom implements neither of these; BudgetPanel's fold transitions touch both.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

function renderPanel({ otherDeductions = [], userPaySchedule = "weekly" } = {}) {
  const bag = buildToolTestAccount({ config: { otherDeductions, userPaySchedule } });
  render(
    <BudgetPanel
      expenses={bag.expenses}
      setExpenses={() => {}}
      onSaveExpensesNow={() => {}}
      weeklyIncome={bag.weeklyIncome}
      prevWeekNet={bag.prevWeekNet}
      futureWeeks={bag.futureWeeks}
      futureWeekNets={bag.futureWeekNets}
      avgWeeklySpend={bag.avgWeeklySpend}
      currentWeek={bag.currentWeek}
      today={bag.today}
      fiscalWeekInfo={getFiscalWeekInfo(bag.currentWeek)}
      userPaySchedule={userPaySchedule}
      config={bag.config}
    />
  );
  fireEvent.click(screen.getByLabelText("Show paycheck breakdown"));
  return bag;
}

// MathRow renders as: div[ span(op), div[ span(label) ], span(value) ] — the
// label sits one level deeper than the value, so closest("div") alone lands on
// a wrapper holding only the label.
const rowFor = (label) => screen.getByText(label).closest("div").parentElement;

// The canonical row shape after db.js's weeklyAmount → perCheckAmount rename,
// which runs on EVERY load — so this is what a real account actually carries.
const UNION_DUES = [{ id: "d1", label: "Union Dues", perCheckAmount: 42 }];

describe("BudgetPanel — paycheck breakdown modal", () => {
  it("shows a real amount for an other-deduction row, not $0.00", () => {
    renderPanel({ otherDeductions: UNION_DUES });
    const row = rowFor("Union Dues");
    expect(within(row).getByText(/\$42\.00/)).toBeTruthy();
  });

  it("subtracts other deductions from Net Pay", () => {
    // Regression: this modal re-derived the paycheck inline and read
    // `row.weeklyAmount`, a field db.js renames away on load and no wizard
    // writes — so the sum was always 0 and Net Pay was overstated by the full
    // amount of every other deduction.
    const withDues = buildToolTestAccount({ config: { otherDeductions: UNION_DUES } });
    const without = buildToolTestAccount({ config: { otherDeductions: [] } });
    const net = (bag) => computeNet(bag.currentWeek, bag.config, 0, false);
    expect(net(without) - net(withDues)).toBeCloseTo(42, 6);

    renderPanel({ otherDeductions: UNION_DUES });
    // Parsed rather than string-matched so the assertion doesn't depend on the
    // panel's display rounding.
    const shown = Number(rowFor("Net Pay").textContent.replace(/[^0-9.]/g, ""));
    expect(shown).toBeCloseTo(net(withDues), 1);
  });

  it("renders the stored per-paycheck amount unscaled on a non-weekly schedule", () => {
    // perCheckAmount is already per-paycheck and this modal is per-paycheck, so
    // it shows as stored. The old code multiplied by perCheckFactor, which on a
    // biweekly account would have doubled it once the field was read at all.
    renderPanel({ otherDeductions: UNION_DUES, userPaySchedule: "biweekly" });
    const row = rowFor("Union Dues");
    expect(within(row).getByText(/\$42\.00/)).toBeTruthy();
  });

  it("still reads a legacy weeklyAmount row that has not been through db.js", () => {
    renderPanel({ otherDeductions: [{ id: "d1", label: "Legacy Dues", weeklyAmount: 17 }] });
    const row = rowFor("Legacy Dues");
    expect(within(row).getByText(/\$17\.00/)).toBeTruthy();
  });
});
