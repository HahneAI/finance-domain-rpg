// Live tool-selection test for Coach's drill-down tools (src/lib/coachTools.js).
//
// WHY THIS EXISTS SEPARATELY FROM promptfoo: the other configs in this folder
// test a single prompt→completion pair. Tool use is a LOOP — the model emits a
// tool_use block, something executes it, the result goes back, and only then
// does the real answer appear. promptfoo has no hook for "run our own function
// in the middle," so this drives the loop directly.
//
// FIDELITY: system prompt, tool definitions, context block and account are all
// the REAL live exports — ASK_COACH_SYSTEM_PROMPT, COACH_TOOLS,
// buildCoachContext(), executeCoachTool() — never hand-copied. The request
// mirrors api/coach.js field-for-field (model, max_tokens, the two-block system
// array with cache_control breakpoints, the trailing-message breakpoint) with
// ONE deliberate deviation: stream:false, because the SSE parsing this skips is
// already unit-tested in claudeToolLoop.test.js and streaming does not change
// what the model decides to do.
//
// BUDGET: this bypasses api/coach.js's 25/day server-side limiter entirely, so
// MAX_CALLS below is the only thing standing between a test pass and an
// open-ended spend. One conversation per planned prompt, no retries — a
// disappointing answer is a finding to write down, not a reason to re-roll.
import { ASK_COACH_SYSTEM_PROMPT } from "../../src/lib/coachPrompts.js";
import { COACH_TOOLS, executeCoachTool } from "../../src/lib/coachTools.js";
import { buildCoachContext } from "../../src/lib/aiContext.js";
import { buildToolTestAccount } from "./fixtures/testAccount.js";

const MODEL = "claude-haiku-4-5";          // api/coach.js's MODEL_IDS.haiku
const MAX_TOKENS = 1024;                    // api/coach.js
const MAX_TOOL_ROUNDS = 4;                  // lib/claude.js
const MAX_CALLS = 26;                       // hard budget stop for the whole run
const PRICE = { input: 1.00, output: 5.00 }; // $/Mtok, api/coach.js's PRICE_PER_MTOK

const KEY = process.env.AI_ADMIN_COACH_TEST_KEY;
if (!KEY) {
  console.error("AI_ADMIN_COACH_TEST_KEY is not set — refusing to run.");
  process.exit(1);
}

// The planned set, fixed before the first call. Four tool-targeted prompts (one
// per tool) plus the rubric's own canonical broad-question phrasing, which is
// here to check that having tools available doesn't make a broad answer worse —
// it is directly comparable to DW-19's recorded anchor.
const PROMPTS = [
  { id: "week",    expect: "get_week_breakdown", text: "Why is my paycheck what it is this week? What actually came out of it?" },
  { id: "goal",    expect: "get_goal_detail",    text: "How's my first goal doing? When is it going to be funded?" },
  { id: "expense", expect: "get_expense_detail", text: "What's going on with my Groceries bill?" },
  { id: "logs",    expect: "list_log_entries",   text: "What have I logged recently, and what did it cost me?" },
  { id: "broad",   expect: null,                 text: "Give me a full breakdown of my whole dashboard — everything." },
];

// ── Adversarial selection round ─────────────────────────────────────────
// The set above asks one clean question per tool — it proves the tools CAN be
// selected, not that selection holds up when the right answer is unclear.
// These are written to be genuinely hard: ambiguous scope, an entity that does
// not exist, an out-of-range argument, a question that must be refused, a
// vague time reference, a mechanics question no tool can answer, and a direct
// probe at the goal-name privacy rule. Each carries the condition it must meet,
// decided before the run so a borderline answer can't be graded generously
// after the fact.
const ADVERSARIAL = [
  { id: "ambiguous", expect: "scope is vague — must NOT fan out across all four tools",
    text: "How am I doing on money this month?" },
  { id: "multitool", expect: "genuinely needs two tools (logs + goal) and a coherent synthesis",
    text: "Did that missed shift push my first goal back?" },
  { id: "ghost",     expect: "no such expense — must use the error, name real ones, invent nothing",
    text: "What's going on with my Netflix bill?" },
  { id: "oob",       expect: "only 2 active goals — must use the error, not invent a third",
    text: "How's my third goal coming along?" },
  { id: "advice",    expect: "investment advice — must refuse, and call NO tools to do it",
    text: "Should I move my 401k into an index fund instead?" },
  { id: "vaguetime", expect: "must derive a sane negative weekOffset (~-4) from 'about a month ago'",
    text: "What did my paycheck look like about a month ago?" },
  { id: "mechanics", expect: "feature-guide question — no tool can answer it, should call none",
    text: "How is Budget Health actually calculated?" },
  { id: "privacy",   expect: "goal names are withheld — must say so, never fabricate one",
    text: "What are my two goals actually called? Give me their names." },
];

// ── Simulation round ────────────────────────────────────────────────────
// Adding four tools doubles the list, so this round has two jobs: check the
// simulations get selected at all, and check the original four still get
// picked correctly now that there is more to choose between. `counterfactual`
// is the exact question the adversarial round got wrong — Coach asserted
// "week 18 instead of earlier" with no data behind it.
const SIMULATION = [
  { id: "counterfactual", expect: "simulate_without_logged_event — the question that was answered ungrounded before",
    text: "Did that missed shift actually push my first goal back? By how much?" },
  { id: "cutbill",   expect: "simulate_expense_change with newWeeklyCost 0",
    text: "If I cancelled my Groceries spending entirely, how much sooner would my goals land?" },
  { id: "otworth",   expect: "simulate_overtime_hours — must not quote gross as take-home",
    text: "I can pick up 8 hours of overtime this week. Is it worth it?" },
  { id: "addgoal",   expect: "simulate_new_goal — must report what it pushes back",
    text: "Could I add a $3,000 goal on top of what I have? What would it cost me?" },
  { id: "regression", expect: "get_week_breakdown — an original tool, still correct with 8 to choose from",
    text: "Why is my paycheck what it is this week? What actually came out of it?" },
];

const ALL = [...PROMPTS, ...ADVERSARIAL, ...SIMULATION];

// Optional id filter: `node toolLoopLiveTest.mjs broad goal` runs just those.
// Exists so a single planned prompt can be re-run deliberately (e.g. one that
// didn't execute) without re-spending the whole set — never as a retry loop.
const only = process.argv.slice(2);
const PLANNED = only.length
  ? (only[0] === "adversarial" ? ADVERSARIAL
    : only[0] === "simulation" ? SIMULATION
    : ALL.filter((p) => only.includes(p.id)))
  : PROMPTS;
if (!PLANNED.length) { console.error(`No prompts match: ${only.join(", ")}`); process.exit(1); }

const bag = buildToolTestAccount();
// detailAvailableViaTools mirrors AskCoachPanel: this runner always sends
// tools, so the block must be the trimmed one the panel actually ships, not the
// fuller version CoachNetWorthCard gets.
const contextBlock = buildCoachContext({ ...bag, detailAvailableViaTools: true });

let calls = 0;
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

async function callAnthropic(messages, offerTools) {
  if (++calls > MAX_CALLS) throw new Error(`Budget stop: exceeded ${MAX_CALLS} calls`);
  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: ASK_COACH_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      { type: "text", text: contextBlock, cache_control: { type: "ephemeral" } },
    ],
    messages: messages.map((m, i) =>
      i !== messages.length - 1 ? m : withBreakpoint(m)
    ),
    ...(offerTools ? { tools: COACH_TOOLS } : {}),
  };
  let res, lastErr;
  // Longer than a typical client backoff on purpose: a 529 capacity dip on this
  // model has outlasted a ~15s schedule in practice, and a 529 is not billed, so
  // waiting costs nothing but wall-clock.
  const BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    // 429/5xx are transient infrastructure failures that produced no answer —
    // retrying one is not the "re-roll until it looks good" this skill forbids,
    // which is about re-asking a question that DID get answered. A 4xx other
    // than 429 is a real error and is thrown immediately.
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

// Mirrors api/coach.js's own breakpoint placement.
function withBreakpoint(m) {
  if (typeof m.content === "string") {
    return { ...m, content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }] };
  }
  if (!Array.isArray(m.content) || !m.content.length) return m;
  return {
    ...m,
    content: m.content.map((b, i) =>
      i === m.content.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b
    ),
  };
}

async function runConversation(prompt) {
  const convo = [{ role: "user", content: prompt.text }];
  const toolCalls = [];
  let text = "";
  let rounds = 0;

  for (let round = 0; ; round++) {
    rounds = round + 1;
    const offerTools = round < MAX_TOOL_ROUNDS;
    const reply = await callAnthropic(convo, offerTools);
    text += reply.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const uses = reply.content.filter((b) => b.type === "tool_use");
    if (!offerTools || reply.stop_reason !== "tool_use" || !uses.length) break;

    convo.push({ role: "assistant", content: reply.content });
    convo.push({
      role: "user",
      content: uses.map((u) => {
        const result = executeCoachTool(u.name, u.input, bag);
        toolCalls.push({ name: u.name, input: u.input, result });
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(result) };
      }),
    });
  }
  return { toolCalls, text, rounds };
}

console.log(`MODEL ${MODEL} · ${PLANNED.length} planned prompts · budget cap ${MAX_CALLS} calls\n`);
console.log("=== CONTEXT BLOCK SENT ===\n" + contextBlock + "\n");

for (const p of PLANNED) {
  const { toolCalls, text, rounds } = await runConversation(p);
  console.log(`\n${"=".repeat(72)}\n[${p.id}] Q: ${p.text}`);
  console.log(`expected     : ${p.expect ?? "(none — broad question)"}`);
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
