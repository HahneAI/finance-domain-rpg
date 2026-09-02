import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/supabase.js", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "tok" } } }) } },
}));

const { chatWithCoach } = await import("../../lib/claude.js");

// Minimal SSE fixture matching the event sequence api/coach.js proxies through
// verbatim from Anthropic. tool_use arguments are split across several
// input_json_delta fragments on purpose — no single fragment is valid JSON,
// which is exactly the case a naive per-event JSON.parse gets wrong.
function sse(events) {
  const bytes = new TextEncoder().encode(
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")
  );
  let sent = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: bytes })),
      }),
    },
  };
}

const textTurn = (text) => sse([
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn" } },
]);

const toolTurn = (name, jsonFragments, { id = "tu_1", index = 0 } = {}) => sse([
  { type: "content_block_start", index, content_block: { type: "tool_use", id, name } },
  ...jsonFragments.map((f) => ({ type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: f } })),
  { type: "content_block_stop", index },
  { type: "message_delta", delta: { stop_reason: "tool_use" } },
]);

const drain = async (gen) => {
  let out = "";
  for await (const chunk of gen) out += chunk;
  return out;
};

const bodyOf = (fetchMock, i) => JSON.parse(fetchMock.mock.calls[i][1].body);

const TOOLS = [{ name: "get_goal_detail", description: "d", input_schema: { type: "object", properties: {} } }];

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("chatWithCoach — no tools (unchanged legacy path)", () => {
  it("streams text and never sends a tools field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textTurn("hello there"));
    vi.stubGlobal("fetch", fetchMock);

    const out = await drain(chatWithCoach([{ role: "user", content: "hi" }], "sys", "ctx"));

    expect(out).toBe("hello there");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect("tools" in bodyOf(fetchMock, 0)).toBe(false);
  });
});

describe("chatWithCoach — tool loop", () => {
  it("executes a requested tool and feeds the result back for a second turn", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolTurn("get_goal_detail", ['{"ra', 'nk":', "1}"]))
      .mockResolvedValueOnce(textTurn("Goal 1 lands in March."));
    vi.stubGlobal("fetch", fetchMock);

    const data = {
      goals: [{ id: "g1", label: "Secret Name", target: 1000, completed: false }],
      futureWeeks: [], timelineWeekNets: [], expenses: [], config: {},
    };
    const out = await drain(chatWithCoach(
      [{ role: "user", content: "how's goal 1?" }], "sys", "ctx", "haiku",
      { tools: TOOLS, toolData: data }
    ));

    expect(out).toBe("Goal 1 lands in March.");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Round 2 carries the assistant's tool_use turn plus a tool_result turn.
    const msgs = bodyOf(fetchMock, 1).messages;
    expect(msgs).toHaveLength(3);
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content[0]).toMatchObject({ type: "tool_use", id: "tu_1", name: "get_goal_detail" });
    // Fragmented arguments must reassemble into real JSON before dispatch.
    expect(msgs[1].content[0].input).toEqual({ rank: 1 });
    expect(msgs[2].role).toBe("user");
    expect(msgs[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });

    const result = JSON.parse(msgs[2].content[0].content);
    expect(result.rank).toBe(1);
    expect(result.targetAmount).toBe(1000);
    // The privacy rule has to survive the transport, not just the tool.
    expect(msgs[2].content[0].content).not.toContain("Secret Name");
  });

  it("runs every tool in a parallel multi-call turn", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sse([
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "a", name: "get_expense_detail" } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"label":"Rent"}' } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "b", name: "list_log_entries" } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } },
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", delta: { stop_reason: "tool_use" } },
      ]))
      .mockResolvedValueOnce(textTurn("done"));
    vi.stubGlobal("fetch", fetchMock);

    await drain(chatWithCoach([{ role: "user", content: "q" }], "sys", "ctx", "haiku", {
      tools: TOOLS,
      toolData: { expenses: [], logs: [], config: {}, today: "2026-07-07" },
    }));

    const results = bodyOf(fetchMock, 1).messages[2].content;
    expect(results.map((r) => r.tool_use_id)).toEqual(["a", "b"]);
  });

  it("yields any text the model emits alongside its tool call", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(sse([
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Let me pull that. " } },
        { type: "content_block_stop", index: 0 },
        { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t", name: "list_log_entries" } },
        { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } },
        { type: "content_block_stop", index: 1 },
        { type: "message_delta", delta: { stop_reason: "tool_use" } },
      ]))
      .mockResolvedValueOnce(textTurn("Two entries."));
    vi.stubGlobal("fetch", fetchMock);

    const out = await drain(chatWithCoach([{ role: "user", content: "q" }], "sys", "ctx", "haiku", {
      tools: TOOLS, toolData: { logs: [], config: {} },
    }));
    expect(out).toBe("Let me pull that. Two entries.");
  });

  it("stops looping at the round cap and withholds tools on the final call", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => toolTurn("list_log_entries", ["{}"]));
    vi.stubGlobal("fetch", fetchMock);

    await drain(chatWithCoach([{ role: "user", content: "q" }], "sys", "ctx", "haiku", {
      tools: TOOLS, toolData: { logs: [], config: {} }, maxToolRounds: 2,
    }));

    // 2 tool rounds + 1 final call made without tools offered.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect("tools" in bodyOf(fetchMock, 0)).toBe(true);
    expect("tools" in bodyOf(fetchMock, 1)).toBe(true);
    expect("tools" in bodyOf(fetchMock, 2)).toBe(false);
  });

  it("passes a tool error back to the model instead of throwing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolTurn("get_expense_detail", ['{"label":"Nope"}']))
      .mockResolvedValueOnce(textTurn("Can't find that one."));
    vi.stubGlobal("fetch", fetchMock);

    const out = await drain(chatWithCoach([{ role: "user", content: "q" }], "sys", "ctx", "haiku", {
      tools: TOOLS, toolData: { expenses: [], today: "2026-07-07" },
    }));

    expect(out).toBe("Can't find that one.");
    expect(JSON.parse(bodyOf(fetchMock, 1).messages[2].content[0].content).error).toContain("No active expense");
  });

  it("recovers from malformed tool arguments rather than aborting the turn", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(toolTurn("list_log_entries", ['{"limit": ']))
      .mockResolvedValueOnce(textTurn("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const out = await drain(chatWithCoach([{ role: "user", content: "q" }], "sys", "ctx", "haiku", {
      tools: TOOLS, toolData: { logs: [], config: {} },
    }));
    expect(out).toBe("ok");
    expect(bodyOf(fetchMock, 1).messages[1].content[0].input).toEqual({});
  });

  it("does not loop when the model stops without requesting a tool", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => textTurn("straight answer"));
    vi.stubGlobal("fetch", fetchMock);

    const out = await drain(chatWithCoach([{ role: "user", content: "q" }], "sys", "ctx", "haiku", {
      tools: TOOLS, toolData: {},
    }));
    expect(out).toBe("straight answer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a real error from the route without retrying it", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ error: "Coach requires an active trial or subscription" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(drain(chatWithCoach([{ role: "user", content: "q" }], "sys", "ctx")))
      .rejects.toThrow("Coach requires an active trial or subscription");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
