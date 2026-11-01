// TODO §32 A1 — "Ask Coach about this" on Upkeep's expense sheet, plus the seed wording itself.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetPanel } from "../../components/BudgetPanel.jsx";
import { goalCoachSeed, expenseCoachSeed } from "../../lib/coachSeeds.js";
import { buildToolTestAccount } from "../../../scripts/coach-eval/fixtures/testAccount.js";
import { getFiscalWeekInfo } from "../../lib/fiscalWeek.js";

window.HTMLElement.prototype.scrollIntoView = vi.fn();

const bag = buildToolTestAccount({ config: { userPaySchedule: "weekly" } });

function mount(extra = {}) {
  const props = {
    expenses: bag.expenses, setExpenses: vi.fn(), onSaveExpensesNow: vi.fn(), onResolveSuggestion: vi.fn(),
    weeklyIncome: bag.weeklyIncome, prevWeekNet: bag.prevWeekNet, futureWeeks: bag.futureWeeks, futureWeekNets: bag.futureWeekNets,
    avgWeeklySpend: bag.avgWeeklySpend, currentWeek: bag.currentWeek, today: bag.today,
    fiscalWeekInfo: getFiscalWeekInfo(bag.currentWeek), userPaySchedule: "weekly", config: bag.config, ...extra,
  };
  const utils = render(<BudgetPanel {...props} />);
  return { ...utils, props };
}

// The expense sheet opens on a double tap of the row (BudgetPanel's lastTapRef window).
function openRentSheet(container) {
  const row = container.querySelector('[data-coach-ref="expense:Rent"]');
  fireEvent.click(row);
  fireEvent.click(row);
}

describe("coachSeeds", () => {
  it("names a goal by rank and an expense by its label", () => {
    expect(goalCoachSeed(1)).toBe("How's my goal #1 tracking toward its Claim Date?");
    expect(expenseCoachSeed("Groceries")).toBe("What's going on with my Groceries expense?");
  });
});

describe("Upkeep Coach note (TODO §32 A4)", () => {
  it("quotes Upkeep Health from the shared helper", () => {
    mount();
    const pct = Math.round((bag.avgWeeklySpend / bag.weeklyIncome) * 100);
    expect(screen.getByTestId("coach-note")).toHaveTextContent(`Upkeep is taking ${pct}% of your take-home`);
  });
});

describe("Upkeep expense sheet — Ask Coach about this", () => {
  it("offers the button only when App passes onAskCoach", () => {
    const { container } = mount();
    openRentSheet(container);
    expect(screen.getByText("Edit")).toBeTruthy();
    expect(screen.queryByText("Ask Coach about this")).toBeNull();
  });

  it("closes the sheet and asks Coach about that expense by label", () => {
    const onAskCoach = vi.fn();
    const { container } = mount({ onAskCoach });
    openRentSheet(container);
    fireEvent.click(screen.getByText("Ask Coach about this"));
    expect(onAskCoach).toHaveBeenCalledWith("What's going on with my Rent expense?");
    expect(screen.queryByText("Ask Coach about this")).toBeNull();
  });
});
