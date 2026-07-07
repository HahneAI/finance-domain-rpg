// §18.C — CoachNetWorthCard orchestrates coachTriggers.js + coachPrompts.js +
// chatWithCoach into a rendered card. chatWithCoach is mocked (an async
// generator of text chunks) so these tests never touch the network/API key.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CoachNetWorthCard } from "../../components/CoachNetWorthCard.jsx";

const { mocks } = vi.hoisted(() => ({ mocks: { chatWithCoach: vi.fn() } }));
vi.mock("../../lib/claude.js", () => ({ chatWithCoach: mocks.chatWithCoach }));

function chunkGenerator(chunks) {
  return async function* () {
    for (const c of chunks) yield c;
  };
}

function baseProps(overrides = {}) {
  return {
    config: { jobLossMode: false },
    expenses: [],
    goals: [],
    weeklyIncome: 900,
    avgWeeklySpend: 500,
    fundedGoalSpend: 0,
    netWorthHealth: { belowThreshold: true, rate: 0.05 },
    currentWeek: { idx: 10 },
    today: "2026-07-07",
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("CoachNetWorthCard", () => {
  it("renders nothing when no signal tier is active", () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator([]));
    const { container } = render(
      <CoachNetWorthCard {...baseProps({ netWorthHealth: { belowThreshold: false } })} />
    );
    expect(container.textContent).toBe("");
  });

  it("fires once for a new tier and renders the streamed message", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["Hey, ", "here's the note."]));
    render(<CoachNetWorthCard {...baseProps()} />);

    await waitFor(() => expect(screen.getByText("Hey, here's the note.")).toBeTruthy());
    expect(mocks.chatWithCoach).toHaveBeenCalledTimes(1);
  });

  it("replays the cached message on remount instead of re-calling the API", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["cached message"]));
    const { unmount } = render(<CoachNetWorthCard {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("cached message")).toBeTruthy());
    unmount();

    mocks.chatWithCoach.mockClear();
    render(<CoachNetWorthCard {...baseProps()} />);
    expect(screen.getByText("cached message")).toBeTruthy();
    expect(mocks.chatWithCoach).not.toHaveBeenCalled();
  });

  it("hides after dismiss and stays hidden across a remount for the same tier/week", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["msg"]));
    const { unmount } = render(<CoachNetWorthCard {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("msg")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("msg")).toBeNull();

    unmount();
    render(<CoachNetWorthCard {...baseProps()} />);
    expect(screen.queryByText("msg")).toBeNull();
  });

  it("re-fires when the tier changes even within the same fiscal week", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["amber message"]));
    const { rerender } = render(<CoachNetWorthCard {...baseProps()} />);
    await waitFor(() => expect(screen.getByText("amber message")).toBeTruthy());

    mocks.chatWithCoach.mockClear();
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["red message"]));
    rerender(
      <CoachNetWorthCard
        {...baseProps({
          config: { jobLossMode: true, jobLossDate: "2026-06-01" },
          netWorthHealth: { belowThreshold: false },
          expenses: [{ category: "Needs", jobLossStatus: "active", weekly: [500, 500, 500, 500] }],
        })}
      />
    );

    await waitFor(() => expect(screen.getByText("red message")).toBeTruthy());
    expect(mocks.chatWithCoach).toHaveBeenCalledTimes(1);
  });
});
