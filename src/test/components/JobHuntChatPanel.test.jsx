// §18.E — Job Hunt Assistant. chatWithCoach and aiContext are mocked so these
// tests never touch the network — same isolation pattern as
// AskCoachPanel.test.jsx.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { JobHuntChatPanel } from "../../components/JobHuntChatPanel.jsx";

Element.prototype.scrollIntoView ??= () => {};

const { mocks } = vi.hoisted(() => ({
  mocks: { chatWithCoach: vi.fn(), buildJobHuntContext: vi.fn(() => "JOB_HUNT_CONTEXT") },
}));
vi.mock("../../lib/claude.js", () => ({ chatWithCoach: mocks.chatWithCoach }));
vi.mock("../../lib/aiContext.js", () => ({ buildJobHuntContext: mocks.buildJobHuntContext }));

function chunkGenerator(chunks) {
  return async function* () {
    for (const c of chunks) yield c;
  };
}

function baseProps(overrides = {}) {
  return { onClose: vi.fn(), config: { newJobSeasonMode: true }, effectiveToday: "2026-07-07", ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("JobHuntChatPanel", () => {
  it("streams a reply using Sonnet and the Job Hunt context block", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["Hold out ", "another two weeks."]));
    render(<JobHuntChatPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Ask about the search…"), { target: { value: "Should I take this offer?" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(screen.getByText("Hold out another two weeks.")).toBeTruthy());

    const [messages, systemPrompt, contextBlock, model] = mocks.chatWithCoach.mock.calls[0];
    expect(messages).toEqual([{ role: "user", content: "Should I take this offer?" }]);
    expect(systemPrompt).toMatch(/Job Hunt Assistant mode/);
    expect(contextBlock).toBe("JOB_HUNT_CONTEXT");
    expect(model).toBe("sonnet");
  });

  it("shows an error and preserves the user's message when the call fails", async () => {
    mocks.chatWithCoach.mockImplementation(() => { throw new Error("network down"); });
    render(<JobHuntChatPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Ask about the search…"), { target: { value: "Still there?" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(screen.getByText("Coach couldn't respond — try again.")).toBeTruthy());
    expect(screen.getByText("Still there?")).toBeTruthy();
  });

  it("wires the fold-lift entrance/exit from the isExiting prop", () => {
    const { container, rerender } = render(<JobHuntChatPanel {...baseProps()} />);
    expect(container.firstChild).toHaveClass("fold-lift");
    expect(container.firstChild).toHaveAttribute("data-fold", "entering");

    rerender(<JobHuntChatPanel {...baseProps({ isExiting: true })} />);
    expect(container.firstChild).toHaveAttribute("data-fold", "exiting");
  });

  it("calls onClose when the close button is tapped", () => {
    const onClose = vi.fn();
    render(<JobHuntChatPanel {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByLabelText("Close Job Hunt Assistant"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
