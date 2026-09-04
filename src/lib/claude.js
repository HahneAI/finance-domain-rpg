import { supabase } from "./supabase.js";
import { executeCoachTool } from "./coachTools.js";

// Hard ceiling on tool round-trips within a single user turn. Each round is a
// full model call, so an unbounded loop is both a cost and a latency problem;
// four is comfortably more than any drill-down question needs (the deepest
// realistic case is "why is this check low" → week breakdown → log entries).
// On hitting the cap we stop feeding results back and let the model answer
// with what it has, rather than erroring out mid-chat.
const MAX_TOOL_ROUNDS = 4;

async function postCoach(body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  let res;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  if (!res) throw lastErr;

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Coach request failed (${res.status})`);
  }
  return res;
}

/**
 * Streams one model turn, yielding text deltas as they arrive, and returns
 * (via the `collected` out-param) the assistant's full content blocks plus its
 * stop_reason so the caller can decide whether a tool round is needed.
 *
 * tool_use arguments stream in as `input_json_delta` fragments across many SSE
 * events — they're accumulated per content-block index here and parsed once at
 * content_block_stop, since no individual fragment is valid JSON on its own.
 */
async function* streamTurn(res, collected) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
  const blocks = [];
  const partialJson = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.type === "content_block_start") {
        const cb = event.content_block;
        if (cb?.type === "tool_use") {
          blocks[event.index] = { type: "tool_use", id: cb.id, name: cb.name, input: {} };
          partialJson[event.index] = "";
        } else if (cb?.type === "text") {
          blocks[event.index] = { type: "text", text: "" };
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta") {
          const text = event.delta.text;
          if (blocks[event.index]) blocks[event.index].text += text;
          yield text;
        } else if (event.delta?.type === "input_json_delta") {
          partialJson[event.index] = (partialJson[event.index] ?? "") + (event.delta.partial_json ?? "");
        }
      } else if (event.type === "content_block_stop") {
        const block = blocks[event.index];
        if (block?.type === "tool_use") {
          const raw = partialJson[event.index] ?? "";
          try {
            block.input = raw.trim() ? JSON.parse(raw) : {};
          } catch {
            // A truncated/malformed argument payload is recoverable: the tool
            // layer returns an `error` result the model can explain, which is
            // far better than throwing away the whole turn.
            block.input = {};
          }
        }
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) collected.stopReason = event.delta.stop_reason;
      }
    }
  }
  collected.blocks = blocks.filter(Boolean);
}

/**
 * §2.G — thin client for the Ask Coach feature. Talks only to our own
 * api/coach.js serverless route (never Anthropic directly) so the API key
 * stays server-side. Retries are for network failure before any response —
 * a non-2xx from the route is a real error and is thrown, not retried.
 * Yields text deltas parsed from the proxied SSE stream so callers (chat UI,
 * insight cards, etc.) can render tokens as they arrive.
 *
 * Tool use (docs/coach-entry-points.md §1, lib/coachTools.js): pass
 * `{ tools, toolData }` to let the model drill into the user's data mid-turn.
 * Tools execute HERE, in the browser, against `toolData` — the same prop bag
 * the caller already assembles for buildCoachContext() — so no additional
 * user data crosses the network and no new serverless route is required. When
 * `tools` is omitted the behavior is byte-for-byte the old single-pass stream,
 * which is what every non-chat Coach surface (the Net Worth card, résumé
 * review, chat summaries) still uses.
 */
export async function* chatWithCoach(messages, systemPrompt, contextBlock, model = "haiku", options = {}) {
  // onToolEvent lets the UI react to tool use as it happens rather than only to
  // the final text: it drives the "checking your Runway…" line during a round
  // (tool rounds are otherwise dead air) and collects navigate_to results so the
  // panel can render a real tappable chip instead of Coach describing a link in
  // prose. Fired as { phase: "start" } before a tool runs and { phase: "result" }
  // after, with the tool's own return value. Never awaited and always wrapped —
  // a throwing listener must not take down the chat turn.
  const { tools = null, toolData = {}, maxToolRounds = MAX_TOOL_ROUNDS, onToolEvent = null } = options;
  const emit = (event) => {
    if (!onToolEvent) return;
    try { onToolEvent(event); } catch { /* a UI listener's failure is not the chat's problem */ }
  };
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  let lastChar = "";

  for (let round = 0; ; round++) {
    // Withhold the tool list on the final permitted round so the model can't
    // request a call whose result would never be fed back to it.
    const offerTools = tools?.length && round < maxToolRounds;
    const res = await postCoach({
      messages: convo,
      systemPrompt,
      contextBlock,
      model,
      ...(offerTools ? { tools } : {}),
    });

    const collected = { blocks: [], stopReason: null };
    // A model that says "let me pull that up" before calling a tool, then
    // answers in the next round, produces two separate runs of text. Yielding
    // them back to back ran the sentences together — live output read
    // "...for you.You're on track". Insert one space at the seam, only when the
    // previous round actually ended mid-sentence.
    let seamPending = round > 0 && lastChar !== "" && !/\s/.test(lastChar);
    for await (const chunk of streamTurn(res, collected)) {
      if (!chunk) continue;
      if (seamPending) {
        seamPending = false;
        if (!/^\s/.test(chunk)) yield " ";
      }
      lastChar = chunk.slice(-1);
      yield chunk;
    }

    // Hard termination bound: a round that was not offered tools is always the
    // last one. Without this the cap would rest on the assumption that the API
    // never returns a tool_use stop_reason when no tools were sent — true, but
    // an assumption about a remote service is a poor thing to hang an
    // unbounded client-side loop on.
    if (!offerTools) return;

    const toolCalls = collected.blocks.filter((b) => b.type === "tool_use");
    if (collected.stopReason !== "tool_use" || !toolCalls.length) return;

    convo.push({ role: "assistant", content: collected.blocks });
    convo.push({
      role: "user",
      content: toolCalls.map((call) => {
        emit({ phase: "start", name: call.name, input: call.input });
        const result = executeCoachTool(call.name, call.input, toolData);
        emit({ phase: "result", name: call.name, input: call.input, result });
        return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) };
      }),
    });
  }
}
