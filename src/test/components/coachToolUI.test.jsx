import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CoachNavChip, CoachToolActivity, TOOL_ACTIVITY_LABELS } from "../../components/CoachToolUI.jsx";
import { focusCoachTarget, describeCoachRef } from "../../lib/coachFocus.js";
import { COACH_TOOL_NAMES } from "../../lib/coachTools.js";

afterEach(cleanup);

const chip = (over = {}) => ({ ok: true, panel: "Budget", viewKey: "budget", focusRef: "expense:Groceries", linkLabel: "Budget · Groceries", ...over });

describe("CoachNavChip", () => {
  it("renders the tool's own link label", () => {
    render(<CoachNavChip chip={chip()} onNavigate={() => {}} />);
    expect(screen.getByText("Budget · Groceries")).toBeTruthy();
  });

  it("hands the view key and focus ref to the navigate handler", () => {
    const onNavigate = vi.fn();
    render(<CoachNavChip chip={chip()} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText(/open this panel/i));
    expect(onNavigate).toHaveBeenCalledWith("budget", "expense:Groceries");
  });

  it("passes a null focus ref through rather than omitting it", () => {
    const onNavigate = vi.fn();
    render(<CoachNavChip chip={chip({ focusRef: null, linkLabel: "Open Budget" })} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByLabelText(/open this panel/i));
    expect(onNavigate).toHaveBeenCalledWith("budget", null);
  });

  it("renders disabled rather than dead when no handler is wired", () => {
    render(<CoachNavChip chip={chip()} onNavigate={null} />);
    expect(screen.getByLabelText(/open this panel/i).disabled).toBe(true);
  });

  it("renders nothing for a failed navigate_to result", () => {
    // toolNavigateTo returns { error } with no viewKey for an unknown panel.
    const { container } = render(<CoachNavChip chip={{ error: "Unknown panel" }} onNavigate={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("CoachToolActivity", () => {
  it("describes the running tool in the user's language, not its name", () => {
    render(<CoachToolActivity toolName="simulate_overtime_hours" />);
    expect(screen.getByText(/Working out what those hours are worth/)).toBeTruthy();
    expect(screen.queryByText(/simulate_overtime_hours/)).toBeNull();
  });

  it("falls back to something sensible for an unlabelled tool", () => {
    render(<CoachToolActivity toolName="some_future_tool" />);
    expect(screen.getByText(/Checking your numbers/)).toBeTruthy();
  });

  it("renders nothing when no tool is running", () => {
    const { container } = render(<CoachToolActivity toolName={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("labels every tool that actually exists", () => {
    // Guards against a tool being added without a user-facing label, which
    // would leak its snake_case name into the UI via the fallback.
    for (const name of COACH_TOOL_NAMES) {
      expect(TOOL_ACTIVITY_LABELS[name], name).toBeTruthy();
    }
  });
});

describe("focusCoachTarget", () => {
  it("scrolls to and flashes a matching row", () => {
    const node = document.createElement("div");
    node.setAttribute("data-coach-ref", "expense:Groceries");
    node.scrollIntoView = vi.fn();
    document.body.appendChild(node);

    focusCoachTarget("expense:Groceries");

    expect(node.scrollIntoView).toHaveBeenCalled();
    expect(node.classList.contains("coach-focus")).toBe(true);
    node.remove();
  });

  it("retries while the panel is still mounting, then gives up silently", async () => {
    vi.useFakeTimers();
    try {
      focusCoachTarget("goal:1", { attempts: 3, intervalMs: 10 });
      // A row that never appears is a normal outcome — a collapsed category or
      // a filtered view — so this must not throw or log.
      expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds a row that appears a few frames after navigation", () => {
    vi.useFakeTimers();
    try {
      focusCoachTarget("goal:2", { attempts: 5, intervalMs: 10 });
      const node = document.createElement("div");
      node.setAttribute("data-coach-ref", "goal:2");
      node.scrollIntoView = vi.fn();
      document.body.appendChild(node);

      vi.advanceTimersByTime(30);
      expect(node.classList.contains("coach-focus")).toBe(true);
      node.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops searching when the caller cancels", () => {
    vi.useFakeTimers();
    try {
      const cancel = focusCoachTarget("goal:3", { attempts: 5, intervalMs: 10 });
      cancel();
      const node = document.createElement("div");
      node.setAttribute("data-coach-ref", "goal:3");
      node.scrollIntoView = vi.fn();
      document.body.appendChild(node);

      vi.advanceTimersByTime(60);
      expect(node.classList.contains("coach-focus")).toBe(false);
      node.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is a no-op without a ref", () => {
    expect(() => focusCoachTarget(null)()).not.toThrow();
  });
});

describe("describeCoachRef", () => {
  it("reads back both ref shapes", () => {
    expect(describeCoachRef("expense:Groceries")).toBe("Groceries");
    expect(describeCoachRef("goal:2")).toBe("Goal 2");
    expect(describeCoachRef("something:else")).toBeNull();
    expect(describeCoachRef(null)).toBeNull();
  });
});
