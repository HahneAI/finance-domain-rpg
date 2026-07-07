// §18.G — api/coach.js proxies Claude API calls so ANTHROPIC_API_KEY never
// reaches the client. Auth guard mirrors delete-account.js; the Anthropic
// call itself is mocked via a stubbed global fetch.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mocks } = vi.hoisted(() => {
  const userClient = { auth: { getUser: vi.fn() } };
  return { mocks: { userClient } };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => mocks.userClient),
}));

globalThis.process.env.VITE_SUPABASE_URL = "https://test.supabase.co";
globalThis.process.env.VITE_SUPABASE_ANON_KEY = "anon-key";
globalThis.process.env.ANTHROPIC_API_KEY = "sk-ant-test";

const { default: handler } = await import("../../../api/coach.js");

function mkReq(overrides = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer good-token" },
    body: { messages: [{ role: "user", content: "hi" }] },
    ...overrides,
  };
}

function mkRes() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    writes: [],
    ended: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    write(chunk) { this.writes.push(chunk); },
    end() { this.ended = true; },
  };
}

function sseStreamOf(events) {
  const chunks = events.map((e) => new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userClient.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("coach — guards", () => {
  it("rejects a non-POST method", async () => {
    const res = mkRes();
    await handler(mkReq({ method: "GET" }), res);
    expect(res.statusCode).toBe(405);
  });

  it("rejects a missing token", async () => {
    const res = mkRes();
    await handler(mkReq({ headers: {} }), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid session token", async () => {
    mocks.userClient.auth.getUser.mockResolvedValue({ data: null, error: { message: "bad" } });
    const res = mkRes();
    await handler(mkReq(), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects a request with no messages", async () => {
    const res = mkRes();
    await handler(mkReq({ body: { messages: [] } }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe("coach — Anthropic proxy", () => {
  it("streams the Anthropic response through and defaults to Haiku", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: sseStreamOf([
        { type: "message_start", message: { usage: { input_tokens: 10, cache_read_input_tokens: 5 } } },
        { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } },
        { type: "message_delta", usage: { output_tokens: 3 } },
      ]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({ method: "POST" })
    );
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.model).toBe("claude-haiku-4-5");
    expect(sentBody.stream).toBe(true);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.writes.length).toBe(3);
    expect(res.ended).toBe(true);
  });

  it("uses the Sonnet model id and applies cache_control to system blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseStreamOf([]) });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(
      mkReq({ body: { messages: [{ role: "user", content: "hi" }], systemPrompt: "sys", contextBlock: "ctx", model: "sonnet" } }),
      res
    );

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentBody.model).toBe("claude-sonnet-5");
    expect(sentBody.system).toEqual([
      { type: "text", text: "sys", cache_control: { type: "ephemeral" } },
      { type: "text", text: "ctx", cache_control: { type: "ephemeral" } },
    ]);
  });

  it("returns 502 without writing when the Anthropic call fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
      body: null,
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = mkRes();
    await handler(mkReq(), res);

    expect(res.statusCode).toBe(502);
    expect(res.writes.length).toBe(0);
  });
});
