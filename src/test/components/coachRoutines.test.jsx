// TODO §32 C2/C3 — the Weekly Pre-Game Briefing card and the Claim Date slip alert.
import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { mocks } = vi.hoisted(() => ({ mocks: { chatWithCoach: vi.fn(), loadCoachMemory: vi.fn() } }));
vi.mock("../../lib/claude.js", () => ({ chatWithCoach: mocks.chatWithCoach }));
vi.mock("../../lib/db.js", () => ({ loadCoachMemory: mocks.loadCoachMemory }));
vi.mock("../../lib/aiContext.js", () => ({ buildCoachContext: () => "CONTEXT" }));

const { CoachBriefingCard } = await import("../../components/CoachBriefingCard.jsx");
const { ClaimDateSlipAlert } = await import("../../components/ClaimDateSlipAlert.jsx");

const gen = (chunks) => async function* () { for (const c of chunks) yield c; };

function Harness({ initialConfig, saveConfigNow, ...rest }) {
  const [config, setConfig] = useState(initialConfig);
  return <CoachBriefingCard {...rest} config={config} setConfig={setConfig} saveConfigNow={saveConfigNow} />;
}
const base = { weeklyIncome: 845, avgWeeklySpend: 520, currentWeek: { idx: 11 }, today: "2026-03-09" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCoachMemory.mockResolvedValue([{ id: "m1", kind: "instruction", body: "Be blunt with me" }]);
});

describe("CoachBriefingCard (C2)", () => {
  it("writes once for a new fiscal week on the weekly_briefing surface, with memory, and eager-saves it", async () => {
    mocks.chatWithCoach.mockImplementation(gen(["Your $900 check lands this week. ", "Open Home."]));
    const saveConfigNow = vi.fn();
    render(<Harness initialConfig={{}} saveConfigNow={saveConfigNow} {...base} />);
    await waitFor(() => expect(screen.getByText("Your $900 check lands this week. Open Home.")).toBeTruthy());
    const [, systemPrompt, contextBlock, model, opts] = mocks.chatWithCoach.mock.calls[0];
    expect(systemPrompt).toMatch(/Weekly Pre-Game Briefing/);
    expect(contextBlock).toMatch(/^CONTEXT[\s\S]*How I want Coach to talk to me: Be blunt with me/);
    expect(model).toBe("haiku");
    expect(opts).toEqual({ surface: "weekly_briefing" });
    expect(saveConfigNow.mock.calls[0][0].coachBriefing).toEqual({ weekIdx: 11, message: "Your $900 check lands this week. Open Home." });
  });

  it("replays this week's cached briefing without calling the API, and stays gone once dismissed", async () => {
    const saveConfigNow = vi.fn();
    render(<Harness initialConfig={{ coachBriefing: { weekIdx: 11, message: "cached" } }} saveConfigNow={saveConfigNow} {...base} />);
    expect(screen.getByText("cached")).toBeTruthy();
    expect(mocks.chatWithCoach).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Dismiss briefing"));
    expect(screen.queryByTestId("coach-briefing")).toBeNull();
    expect(saveConfigNow.mock.calls[0][0].coachBriefing).toEqual({ weekIdx: 11, message: "cached", dismissedWeekIdx: 11 });
  });

  it("re-fires in a new week, and skips memory when it's switched off", async () => {
    mocks.chatWithCoach.mockImplementation(gen(["new week"]));
    render(<Harness initialConfig={{ coachBriefing: { weekIdx: 10, message: "old", dismissedWeekIdx: 10 }, coachMemoryOff: true }} saveConfigNow={vi.fn()} {...base} />);
    await waitFor(() => expect(screen.getByText("new week")).toBeTruthy());
    expect(mocks.loadCoachMemory).not.toHaveBeenCalled();
    expect(mocks.chatWithCoach.mock.calls[0][2]).toBe("CONTEXT");
  });

  it("stays silent with no income, and fails quiet on an API error", async () => {
    const { unmount } = render(<Harness initialConfig={{}} saveConfigNow={vi.fn()} {...base} weeklyIncome={0} />);
    expect(mocks.chatWithCoach).not.toHaveBeenCalled();
    unmount();
    mocks.chatWithCoach.mockImplementation(async function* () { yield* []; throw new Error("boom"); });
    render(<Harness initialConfig={{}} saveConfigNow={vi.fn()} {...base} />);
    await waitFor(() => expect(mocks.chatWithCoach).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId("coach-briefing")).toBeNull());
  });
});

describe("ClaimDateSlipAlert (C3)", () => {
  const slips = [
    { goalId: "g1", rank: 1, target: 2000, fromIso: "2026-04-27", toIso: "2026-05-18", daysLater: 21 },
    { goalId: "g2", rank: 2, target: 5000, fromIso: "2026-08-10", toIso: "2026-08-31", daysLater: 21 },
  ];
  it("names the biggest slip by rank with both dates, and counts the rest", () => {
    render(<ClaimDateSlipAlert slips={slips} onAcknowledge={vi.fn()} />);
    expect(screen.getByTestId("claim-slip-alert")).toHaveTextContent("Goal 1's Claim Date slipped about 3 weeks, from Apr 27 to May 18. 1 other goal moved too.");
    expect(screen.queryByText("Ask Coach why")).toBeNull();
  });
  it("Ask Coach why sends a rank-only question; Got it acknowledges", () => {
    const onAskCoach = vi.fn(); const onAcknowledge = vi.fn();
    render(<ClaimDateSlipAlert slips={[slips[0]]} onAcknowledge={onAcknowledge} onAskCoach={onAskCoach} />);
    fireEvent.click(screen.getByText("Ask Coach why"));
    expect(onAskCoach).toHaveBeenCalledWith("Why did my goal #1's Claim Date move from Apr 27 to May 18?");
    fireEvent.click(screen.getByText("Got it"));
    expect(onAcknowledge).toHaveBeenCalled();
  });
  it("renders nothing with no slips", () => {
    const { container } = render(<ClaimDateSlipAlert slips={[]} onAcknowledge={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
});
