// Quick tool-available rerun of Ask Coach's Phase 1-4 personality findings
// (docs/TODO.md §2.L — "open, not decided" item, closed here). AskCoachPanel
// now sends a TRIMMED context block (detailAvailableViaTools: true) plus 9
// tools; every prior finding (Phases 1-4) was elicited against the full
// untrimmed context with no tools at all — a real, growing divergence
// between what this harness tested and what production actually ships.
//
// This is NOT a fresh calibration pass. It reuses the exact same fixture and
// question Phases 1-4 already used, adds only the trim flag + tools, and
// checks whether Metaphor Intensity / tone stay in the same ballpark as the
// recorded baseline — a directional check ("a thumb on the tool
// introduction"), not a new target-locking exercise.
//
// WHY THIS SCRIPT AND NOT promptfoo: same reason as toolLoopLiveTest.mjs —
// tool use is a loop (tool_use -> execute -> tool_result -> real answer),
// and promptfoo has no hook for that. Structure/fidelity/budget-discipline
// conventions mirrored directly from that script (same request shape as
// api/coach.js, same no-retry-on-a-disappointing-answer rule, same bounded
// backoff on transient failures only).
import { ASK_COACH_SYSTEM_PROMPT } from "../../src/lib/coachPrompts.js";
import { COACH_TOOLS, executeCoachTool } from "../../src/lib/coachTools.js";
import { buildCoachContext } from "../../src/lib/aiContext.js";
import { buildTestAccountArgs } from "./fixtures/testAccount.js";

const MODEL = "claude-haiku-4-5";           // locked for Ask Coach, Phase 6 (docs/TODO.md §2.L)
const MAX_TOKENS = 1024;                    // api/coach.js
const MAX_TOOL_ROUNDS = 4;                  // lib/claude.js
const MAX_CALLS = 10;                       // small — this is a quick directional check, not a phase
const PRICE = { input: 1.00, output: 5.00 }; // $/Mtok, api/coach.js's PRICE_PER_MTOK

const KEY = process.env.AI_ADMIN_COACH_TEST_KEY;
if (!KEY) {
  console.error("AI_ADMIN_COACH_TEST_KEY is not set — refusing to run.");
  process.exit(1);
}

// Same question, same two account states Phase 2/3 (natural default) and
// Phase 4 (near-limit severity) already used — fixtures/testAccount.js's
// buildTestAccountArgs() defaults (845/520) and its exact near-limit
// override (845/830, askCoachComposed.js's CONTEXT_VARIANTS["near-limit"]).
// Only the trim flag + tools are new; everything else held constant on
// purpose so any register shift is attributable to that alone.
const PLANNED = [
  { id: "default",    args: {} },
  { id: "near-limit", args: { weeklyIncome: 845, avgWeeklySpend: 830 } },
];
const QUESTION = "How's my week looking?";

let calls = 0;
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

async function callAnthropic(messages, offerTools, contextBlock) {
  if (++calls > MAX_CALLS) throw new Error(`Budget stop: exceeded ${MAX_CALLS} calls`);
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: ASK_COACH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: contextBlock, cache_control: { type: "ephemeral" } },
    ],
    messages: messages.map((m, i) => (i !== messages.length - 1 ? m : withBreakpoint(m))),
    ...(offerTools ? { tools: COACH_TOOLS } : {}),
  };
  let res, lastErr;
  const BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    if (res.status !== 429 && res.status < 500) break;
    lastErr = `${res.status} ${(await res.text()).slice(0, 200)}`;
    if (attempt < BACKOFF_MS.length) {
      console.error(`  … ${res.status}, retrying in ${BACKOFF_MS[attempt] / 1000}s`);
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }
  if (!res.ok) throw new Error(`Anthropic ${lastErr ?? res.status}: gave up after retries`);
  const json = await res.json();
  usage.input += json.usage?.input_tokens ?? 0;
  usage.output += json.usage?.output_tokens ?? 0;
  usage.cacheRead += json.usage?.cache_read_input_tokens ?? 0;
  usage.cacheWrite += json.usage?.cache_creation_input_tokens ?? 0;
  return json;
}

function withBreakpoint(m) {
  if (typeof m.content === "string") {
    return { ...m, content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }] };
  }
  if (!Array.isArray(m.content) || !m.content.length) return m;
  return {
    ...m,
    content: m.content.map((b, i) => (i === m.content.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b)),
  };
}

async function runConversation(question, contextBlock, toolData) {
  const convo = [{ role: "user", content: question }];
  const toolCalls = [];
  let text = "";
  let rounds = 0;

  for (let round = 0; ; round++) {
    rounds = round + 1;
    const offerTools = round < MAX_TOOL_ROUNDS;
    const reply = await callAnthropic(convo, offerTools, contextBlock);
    text += reply.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const uses = reply.content.filter((b) => b.type === "tool_use");
    if (!offerTools || reply.stop_reason !== "tool_use" || !uses.length) break;

    convo.push({ role: "assistant", content: reply.content });
    convo.push({
      role: "user",
      content: uses.map((u) => {
        const result = executeCoachTool(u.name, u.input, toolData);
        toolCalls.push({ name: u.name, input: u.input, result });
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result) };
      }),
    });
  }
  return { toolCalls, text, rounds };
}

console.log(`MODEL ${MODEL} · ${PLANNED.length} planned conversations · budget cap ${MAX_CALLS} calls\n`);

for (const p of PLANNED) {
  const bag = buildTestAccountArgs(p.args);
  const contextBlock = buildCoachContext({ ...bag, detailAvailableViaTools: true });
  console.log(`\n${"=".repeat(72)}\n[${p.id}] CONTEXT BLOCK SENT:\n${contextBlock}\n`);

  const { toolCalls, text, rounds } = await runConversation(QUESTION, contextBlock, bag);
  console.log(`[${p.id}] Q: ${QUESTION}`);
  console.log(`rounds       : ${rounds}`);
  console.log(`tools called : ${toolCalls.length ? toolCalls.map((t) => t.name).join(", ") : "(none)"}`);
  for (const t of toolCalls) {
    console.log(`  → ${t.name}(${JSON.stringify(t.input)})`);
    console.log(`    result: ${JSON.stringify(t.result).slice(0, 300)}`);
  }
  console.log(`\nANSWER:\n${text}\n`);
}

const cost = (usage.input * PRICE.input + usage.cacheRead * PRICE.input * 0.1
  + usage.cacheWrite * PRICE.input * 1.25 + usage.output * PRICE.output) / 1e6;
console.log(`\n${"=".repeat(72)}\nCALLS ${calls}/${MAX_CALLS} · in ${usage.input} cache_r ${usage.cacheRead} cache_w ${usage.cacheWrite} out ${usage.output} · est $${cost.toFixed(4)}`);
