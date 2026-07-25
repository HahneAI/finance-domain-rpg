// §18.H — Ask Coach multi-turn chat + memory. chatWithCoach and the
// coach_chats persistence layer are both mocked so these tests never touch
// the network/DB — same isolation pattern as CoachNetWorthCard.test.jsx.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { AskCoachPanel } from "../../components/AskCoachPanel.jsx";

// jsdom doesn't implement scrollIntoView — the panel calls it on every
// message-list update to keep the latest turn in view.
Element.prototype.scrollIntoView ??= () => {};

const { mocks } = vi.hoisted(() => ({
  mocks: {
    chatWithCoach: vi.fn(),
    loadCoachChats: vi.fn(),
    saveCoachChat: vi.fn(),
    deleteCoachChat: vi.fn(),
  },
}));
vi.mock("../../lib/claude.js", () => ({ chatWithCoach: mocks.chatWithCoach }));
vi.mock("../../lib/db.js", () => ({
  loadCoachChats: mocks.loadCoachChats,
  saveCoachChat: mocks.saveCoachChat,
  deleteCoachChat: mocks.deleteCoachChat,
}));
vi.mock("../../lib/aiContext.js", () => ({ buildCoachContext: () => "CONTEXT" }));

function chunkGenerator(chunks) {
  return async function* () {
    for (const c of chunks) yield c;
  };
}

function baseProps(overrides = {}) {
  return {
    onClose: vi.fn(),
    config: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadCoachChats.mockResolvedValue([]);
  mocks.saveCoachChat.mockResolvedValue("new-chat-id");
  mocks.deleteCoachChat.mockResolvedValue(undefined);
});

describe("AskCoachPanel — sending a message", () => {
  it("streams the reply and persists the full turn as an ask_coach chat", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["Hey, ", "here's your answer."]));
    render(<AskCoachPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Ask Coach…"), { target: { value: "How's my budget?" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(screen.getByText("Hey, here's your answer.")).toBeTruthy());

    // The API call itself must never carry our local bookkeeping timestamp field.
    const apiMessages = mocks.chatWithCoach.mock.calls[0][0];
    expect(apiMessages).toEqual([{ role: "user", content: "How's my budget?" }]);

    await waitFor(() => expect(mocks.saveCoachChat).toHaveBeenCalled());
    const saved = mocks.saveCoachChat.mock.calls[0][0];
    expect(saved.chatType).toBe("ask_coach");
    expect(saved.title).toBe("How's my budget?");
    expect(saved.messages).toHaveLength(2);
    expect(saved.messages[0]).toMatchObject({ role: "user", content: "How's my budget?" });
    expect(saved.messages[1]).toMatchObject({ role: "assistant", content: "Hey, here's your answer." });
    expect(saved.messages[0].timestamp).toBeTruthy();
  });

  it("still saves the user's question when the Coach call fails", async () => {
    mocks.chatWithCoach.mockImplementation(() => {
      throw new Error("network down");
    });
    render(<AskCoachPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Ask Coach…"), { target: { value: "Still there?" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(screen.getByText("Coach couldn't respond — try again.")).toBeTruthy());
    await waitFor(() => expect(mocks.saveCoachChat).toHaveBeenCalled());
    expect(mocks.saveCoachChat.mock.calls[0][0].messages).toHaveLength(1);
  });

  it("reuses the same chat id on a second turn instead of creating a new row", async () => {
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["First reply."]));
    render(<AskCoachPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Ask Coach…"), { target: { value: "First question" } });
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(mocks.saveCoachChat).toHaveBeenCalledTimes(1));
    expect(mocks.saveCoachChat.mock.calls[0][0].id).toBeFalsy();

    mocks.chatWithCoach.mockImplementation(chunkGenerator(["Second reply."]));
    fireEvent.change(screen.getByPlaceholderText("Ask Coach…"), { target: { value: "Second question" } });
    fireEvent.click(screen.getByText("Send"));
    await waitFor(() => expect(mocks.saveCoachChat).toHaveBeenCalledTimes(2));
    expect(mocks.saveCoachChat.mock.calls[1][0].id).toBe("new-chat-id");
  });
});

describe("AskCoachPanel — history", () => {
  const oldChat = {
    id: "chat-old",
    chatType: "ask_coach",
    title: "Old question",
    summary: "Talked about savings.",
    messages: [{ role: "user", content: "Old question", timestamp: "2026-01-01T00:00:00Z" }],
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("lists saved conversations grouped by date and resumes one on tap", async () => {
    mocks.loadCoachChats.mockResolvedValue([oldChat]);
    render(<AskCoachPanel {...baseProps()} />);

    fireEvent.click(screen.getByLabelText("Chat history"));
    await waitFor(() => expect(screen.getByText("Old question")).toBeTruthy());
    expect(screen.getByText("Talked about savings.")).toBeTruthy();

    fireEvent.click(screen.getByText("Old question"));
    expect(screen.getByText("Old question")).toBeTruthy(); // now the chat bubble, not the list row
    expect(screen.queryByText("Talked about savings.")).toBeNull(); // history view closed
  });

  it("deletes a saved conversation without resuming it", async () => {
    mocks.loadCoachChats.mockResolvedValue([oldChat]);
    render(<AskCoachPanel {...baseProps()} />);

    fireEvent.click(screen.getByLabelText("Chat history"));
    await waitFor(() => expect(screen.getByText("Old question")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Delete conversation"));
    await waitFor(() => expect(mocks.deleteCoachChat).toHaveBeenCalledWith("chat-old"));
    expect(screen.queryByText("Old question")).toBeNull();
  });

  it("prunes saved chats past the retention cap, keeping the active one alive", async () => {
    const chats = ["c1", "c2", "c3", "c4"].map((id, i) => ({
      id,
      chatType: "ask_coach",
      title: id,
      messages: [{ role: "user", content: id, timestamp: "2026-01-01T00:00:00Z" }],
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    })).reverse(); // newest first, like loadCoachChats really returns them
    mocks.loadCoachChats.mockResolvedValue(chats);
    mocks.chatWithCoach.mockImplementation(chunkGenerator(["ok"]));
    render(<AskCoachPanel {...baseProps()} />);

    fireEvent.change(screen.getByPlaceholderText("Ask Coach…"), { target: { value: "new turn" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(mocks.deleteCoachChat).toHaveBeenCalledWith("c1"));
  });

  it("New Chat clears the active conversation and returns to the compose view", async () => {
    mocks.loadCoachChats.mockResolvedValue([oldChat]);
    render(<AskCoachPanel {...baseProps()} />);

    fireEvent.click(screen.getByLabelText("Chat history"));
    await waitFor(() => expect(screen.getByText("Old question")).toBeTruthy());
    fireEvent.click(screen.getByText("Old question"));

    fireEvent.click(screen.getByLabelText("New chat"));
    expect(screen.getByText(/Ask me anything about how Authority Finance works/)).toBeTruthy();
  });
});
