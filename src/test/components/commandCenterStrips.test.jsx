// TODO §32 D3 — Home's "Coach remembers" and "Around the app" strips.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mocks } = vi.hoisted(() => ({ mocks: { loadCoachMemory: vi.fn() } }));
vi.mock("../../lib/db.js", () => ({ loadCoachMemory: mocks.loadCoachMemory }));

const { CoachRemembersStrip, AroundTheAppStrip } = await import("../../components/CommandCenterStrips.jsx");

const mem = (n) => Array.from({ length: n }, (_, i) => ({ id: `m${i}`, kind: "goal_why", body: `memory ${i}` }));

beforeEach(() => vi.clearAllMocks());

describe("CoachRemembersStrip", () => {
  it("shows the three newest memories in the user's words, with See all and the full count", async () => {
    mocks.loadCoachMemory.mockResolvedValue(mem(5));
    const onSeeAll = vi.fn();
    render(<CoachRemembersStrip onSeeAll={onSeeAll} />);
    await waitFor(() => expect(screen.getByText("“memory 0”")).toBeTruthy());
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("“memory 3”")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "See all (5)" }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it("renders nothing with no memories (e.g. before migration 049) and never loads when memory is off", async () => {
    mocks.loadCoachMemory.mockResolvedValue([]);
    const { container, unmount } = render(<CoachRemembersStrip onSeeAll={vi.fn()} />);
    await waitFor(() => expect(mocks.loadCoachMemory).toHaveBeenCalled());
    expect(container.textContent).toBe("");
    unmount();
    mocks.loadCoachMemory.mockClear();
    const off = render(<CoachRemembersStrip memoryOff onSeeAll={vi.fn()} />);
    expect(off.container.textContent).toBe("");
    expect(mocks.loadCoachMemory).not.toHaveBeenCalled();
  });
});

describe("AroundTheAppStrip", () => {
  it("lists each panel's note under its label and opens that panel's route key", () => {
    const onOpen = vi.fn();
    render(<AroundTheAppStrip onOpen={onOpen} items={[
      { view: "budget", label: "Upkeep", text: "Upkeep is taking 40% of your take-home." },
      { view: "log", label: "Log", text: null },
    ]} />);
    expect(screen.queryByText("Log")).toBeNull(); // a panel with no note is left out
    fireEvent.click(screen.getByRole("button", { name: /^Open Upkeep:/ }));
    expect(onOpen).toHaveBeenCalledWith("budget");
  });

  it("renders nothing when no panel has a note", () => {
    const { container } = render(<AroundTheAppStrip onOpen={vi.fn()} items={[{ view: "log", label: "Log", text: null }]} />);
    expect(container.textContent).toBe("");
  });
});
