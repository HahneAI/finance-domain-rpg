import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BudgetPanel } from "../../components/BudgetPanel.jsx";
import { buildToolTestAccount } from "../../../scripts/coach-eval/fixtures/testAccount.js";
import { getFiscalWeekInfo } from "../../lib/fiscalWeek.js";

// jsdom implements neither of these; BudgetPanel's fold transitions touch both.
window.HTMLElement.prototype.scrollIntoView = vi.fn();

const bag = buildToolTestAccount({ config: { userPaySchedule: "weekly" } });
const ID = { archetypeId: "heartbeat", chosenAt: "2026-10-06T00:00:00.000Z" };

function mount({ identity = ID, expenses = bag.expenses, ...extra } = {}) {
  const props = {
    expenses, setExpenses: vi.fn(), onSaveExpensesNow: vi.fn(), onResolveSuggestion: vi.fn(),
    weeklyIncome: bag.weeklyIncome, prevWeekNet: bag.prevWeekNet, futureWeeks: bag.futureWeeks, futureWeekNets: bag.futureWeekNets,
    avgWeeklySpend: bag.avgWeeklySpend, currentWeek: bag.currentWeek, today: bag.today,
    fiscalWeekInfo: getFiscalWeekInfo(bag.currentWeek), userPaySchedule: "weekly",
    config: { ...bag.config, ...(identity ? { identity } : {}) }, ...extra,
  };
  const utils = render(<BudgetPanel {...props} />);
  return { ...utils, props };
}

describe("Upkeep identity suggestions (TODO §31 Phase 2)", () => {
  it("shows the card for the chosen identity and says nothing counts until added", () => {
    mount();
    const card = screen.getByTestId("identity-suggestions");
    expect(card).toHaveTextContent("Suggested for The Heartbeat");
    expect(card).toHaveTextContent(/don't count toward anything until you add them/i);
    expect(screen.getByTestId("suggestion-heartbeat.gym")).toHaveTextContent("Gym Membership");
  });

  it("is absent with no identity, when read-only, or once every bill is decided", () => {
    const a = mount({ identity: null }); expect(screen.queryByTestId("identity-suggestions")).toBeNull(); a.unmount();
    const b = mount({ readOnly: true }); expect(screen.queryByTestId("identity-suggestions")).toBeNull(); b.unmount();
    mount({ identity: { ...ID, suggestions: { "heartbeat.gym": "dismissed", "heartbeat.supplements": "accepted" } } });
    expect(screen.queryByTestId("identity-suggestions")).toBeNull();
  });

  it("a pending suggestion changes NO number on the panel (F182): identical text with and without it", () => {
    const withId = mount();
    withId.container.querySelector('[data-testid="identity-suggestions"]').remove();
    const textWith = withId.container.textContent;
    withId.unmount();
    const without = mount({ identity: null });
    expect(without.container.textContent).toBe(textWith);
  });

  it("Add builds a real Lifestyle bill and resolves the suggestion in ONE payload (expenses + config)", () => {
    const { props } = mount();
    fireEvent.click(screen.getByLabelText("Add Gym Membership"));
    expect(props.onResolveSuggestion).toHaveBeenCalledTimes(1);
    expect(props.onSaveExpensesNow).not.toHaveBeenCalled(); // no second, split write
    const { expenses, config } = props.onResolveSuggestion.mock.calls[0][0];
    expect(expenses).toHaveLength(bag.expenses.length + 1);
    const added = expenses[expenses.length - 1];
    expect(added).toMatchObject({ category: "Lifestyle", label: "Gym Membership" });
    expect(added.billingMeta).toMatchObject({ amount: 35, cycle: "every30days" });
    // same shape as a hand-added from-month-forward row
    expect(Object.keys(added).sort()).toEqual(["billingMeta", "category", "history", "id", "label", "monthlyOverrides", "note"]);
    expect(added.note).toHaveLength(4);
    expect(config.identity.suggestions["heartbeat.gym"]).toBe("accepted");
    expect(props.setExpenses).toHaveBeenCalledWith(expenses);
  });

  it("Not me resolves config only — no expense is created", () => {
    const { props } = mount();
    fireEvent.click(screen.getByLabelText("Not me: Gym Membership"));
    const payload = props.onResolveSuggestion.mock.calls[0][0];
    expect(payload.expenses).toBeUndefined();
    expect(payload.config.identity.suggestions["heartbeat.gym"]).toBe("dismissed");
    expect(props.setExpenses).not.toHaveBeenCalled();
  });

  it("hides a suggestion when the user already has a bill with that label", () => {
    const dup = { ...bag.expenses[0], id: "exp_dup", label: "Gym Membership" };
    mount({ expenses: [...bag.expenses, dup] });
    expect(screen.queryByTestId("suggestion-heartbeat.gym")).toBeNull();
    expect(screen.getByTestId("suggestion-heartbeat.supplements")).toBeTruthy();
  });
});
