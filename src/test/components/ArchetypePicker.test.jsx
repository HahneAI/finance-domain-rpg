import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ArchetypePicker } from "../../components/ArchetypePicker.jsx";

const project = (cands) => Object.fromEntries(cands.map((c, i) => [c.templateKey, {
  text: `By Mar ${i + 1}`, finishDate: new Date(2027, 2, i + 1), badge: null,
}]));

const setup = (over = {}) => {
  const onApply = vi.fn();
  const onSkip = vi.fn();
  render(<ArchetypePicker avgWeeklySpend={0} existingGoals={[]} today="2026-10-06" projectGoals={project} onApply={onApply} onSkip={onSkip} {...over} />);
  return { onApply, onSkip };
};

describe("ArchetypePicker", () => {
  it("offers all six archetypes and a Not now escape", () => {
    const { onSkip } = setup();
    for (const n of ["The Prepper", "The Heartbeat", "The Builder", "The Polished", "The Family Man", "The Explorer"]) {
      expect(screen.getByText(n)).toBeTruthy();
    }
    fireEvent.click(screen.getByText("Not now"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("previews goals with Claim Dates and confirms what the user edited", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByText("The Prepper"));
    expect(screen.getAllByText(/By Mar/).length).toBeGreaterThanOrEqual(3);
    // edit the cash stash target, drop the food stash
    fireEvent.change(screen.getByLabelText("Target for Cash-on-Hand Stash"), { target: { value: "650" } });
    fireEvent.click(screen.getByLabelText("Include Two-Week Food & Water Stash"));
    fireEvent.click(screen.getByText(/Add 3 goals/i));
    expect(onApply).toHaveBeenCalledTimes(1);
    const { archetypeId, selected } = onApply.mock.calls[0][0];
    expect(archetypeId).toBe("prepper");
    expect(selected.map((g) => g.templateKey)).toEqual(["prepper.emergency_fund", "prepper.cash_stash", "prepper.home_readiness"]);
    expect(selected.find((g) => g.templateKey === "prepper.cash_stash").target).toBe(650);
  });

  it("derives the emergency-fund target from real weekly spend", () => {
    setup({ avgWeeklySpend: 600 });
    fireEvent.click(screen.getByText("The Prepper"));
    expect(screen.getByLabelText("Target for Emergency Fund").value).toBe("2400");
  });

  it("drops a goal whose target was cleared instead of seeding $0", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByText("The Explorer"));
    fireEvent.change(screen.getByLabelText("Target for Passport"), { target: { value: "" } });
    fireEvent.click(screen.getByText(/Add 3 goals/i));
    expect(onApply.mock.calls[0][0].selected.map((g) => g.templateKey)).not.toContain("explorer.passport");
  });

  it("flags a goal whose date is more than a year out as stretch", () => {
    setup({ projectGoals: (c) => Object.fromEntries(c.map((x) => [x.templateKey, { text: "~Dec 2028", finishDate: new Date(2028, 11, 1) }])) });
    fireEvent.click(screen.getByText("The Builder"));
    expect(screen.getAllByText(/· stretch/).length).toBeGreaterThan(0);
  });

  it("disables confirm when every goal is toggled off, and Back returns to the list", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByText("The Polished"));
    for (const cb of screen.getAllByRole("checkbox")) fireEvent.click(cb);
    const btn = screen.getByText("Pick at least one");
    fireEvent.click(btn);
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Who are you becoming?")).toBeTruthy();
  });

  it("omits templates the user already has", () => {
    setup({ existingGoals: [{ id: "g1", label: "passport", target: 100, completed: false }] });
    fireEvent.click(screen.getByText("The Explorer"));
    expect(screen.queryByLabelText("Target for Passport")).toBeNull();
    expect(screen.getByText(/Add 3 goals/i)).toBeTruthy();
  });
});
