// §2.C — CoachNetWorthCard orchestrates coachTriggers.js + coachPrompts.js +
// chatWithCoach into a rendered card. chatWithCoach is mocked (an async
// generator of text chunks) so these tests never touch the network/API key.
//
// DW-9 fix: signal/rate-limit state moved from localStorage to
// config.coachSignalState (eager-saved via setConfig/saveConfigNow) so it's
// durable per-account instead of per-device. Tests below drive this the same
// way the real app does: read the `next` config handed to setConfig/
// saveConfigNow after a fire/dismiss, then re-render with that config to
// simulate "the persisted state is now in effect."
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { CoachNetWorthCard } from "../../components/CoachNetWorthCard.jsx";

// A dismiss/fire is only visible immediately in the real app because
// setConfig is App.jsx's real useState setter — the parent re-renders with
// the new config on the same tick. A bare vi.fn() mock doesn't reproduce
// that, so this harness holds config in real state, like the real call sites do.
function Harness({ initialConfig, saveConfigNow, ...rest }) {
  const [config, setConfig] = useState(initialConfig);
  return <CoachNetWorthCard {...rest} config={config} setConfig={setConfig} saveConfigNow={saveConfigNow} />;
}

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
    setConfig: vi.fn(),
    saveConfigNow: vi.fn(),
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

  it("fires once for a new tier, renders the streamed message, and eager-saves the computed signal state", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["Hey, ", "here's the note."]));
    const props = baseProps();
    render(<CoachNetWorthCard {...props} />);

    await waitFor(() => expect(screen.getByText("Hey, here's the note.")).toBeTruthy());
    expect(mocks.chatWithCoach).toHaveBeenCalledTimes(1);

    expect(props.setConfig).toHaveBeenCalledTimes(1);
    expect(props.saveConfigNow).toHaveBeenCalledTimes(1);
    const next = props.saveConfigNow.mock.calls[0][0];
    expect(next.coachSignalState).toMatchObject({
      lastFiredTier: "amber",
      lastFiredWeekIdx: 10,
      lastMessage: "Hey, here's the note.",
    });
  });

  it("replays the persisted message on a fresh render instead of re-calling the API", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["cached message"]));
    const firstProps = baseProps();
    const { unmount } = render(<CoachNetWorthCard {...firstProps} />);
    await waitFor(() => expect(screen.getByText("cached message")).toBeTruthy());
    const persistedConfig = firstProps.saveConfigNow.mock.calls[0][0];
    unmount();

    mocks.chatWithCoach.mockClear();
    render(<CoachNetWorthCard {...baseProps({ config: persistedConfig })} />);
    expect(screen.getByText("cached message")).toBeTruthy();
    expect(mocks.chatWithCoach).not.toHaveBeenCalled();
  });

  it("hides after dismiss, eager-saving the dismissal, and stays hidden once that config is in effect", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["msg"]));
    const saveConfigNow = vi.fn();
    const { setConfig: _unused, ...restProps } = baseProps({ saveConfigNow });
    render(<Harness initialConfig={restProps.config} saveConfigNow={saveConfigNow} {...restProps} />);
    await waitFor(() => expect(screen.getByText("msg")).toBeTruthy());

    saveConfigNow.mockClear();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText("msg")).toBeNull();
    expect(saveConfigNow).toHaveBeenCalledTimes(1);
    const dismissedConfig = saveConfigNow.mock.calls[0][0];
    expect(dismissedConfig.coachSignalState).toMatchObject({ dismissedTier: "amber", dismissedWeekIdx: 10 });

    render(<CoachNetWorthCard {...baseProps({ config: dismissedConfig })} />);
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

  it("does not throw and simply skips persistence when setConfig/saveConfigNow are omitted", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["no persistence needed"]));
    render(<CoachNetWorthCard {...baseProps({ setConfig: undefined, saveConfigNow: undefined })} />);
    await waitFor(() => expect(screen.getByText("no persistence needed")).toBeTruthy());
  });
});
