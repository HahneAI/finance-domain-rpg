// Replicates api/coach.js's exact Anthropic Messages API call shape (model,
// max_tokens, system[] with cache_control, non-streaming single response)
// using the REAL systemPrompt + contextBlock captured live from the running
// app by capture_coach_context.cjs — a faithful stand-in for the actual
// serverless route, called directly since /api/coach isn't reachable in
// this sandbox (no Vercel routing, no Anthropic key wired into local dev).
//
// This calls the real Anthropic API against a real, human-funded key and
// costs real money. Do not loop, retry-on-a-hunch, or run exploratory
// prompts beyond the fixed set the parent SKILL.md lays out — see its
// "Token budget discipline" section before running this.
import fs from 'fs';
import path from 'path';

const KEY = process.env.AI_ADMIN_COACH_TEST_KEY;
if (!KEY) {
  console.error('AI_ADMIN_COACH_TEST_KEY not set — this must be a SEPARATE scoped test key, never the app\'s real ANTHROPIC_API_KEY/ANTHROPIC_API_KEY_TEST. See the parent SKILL.md for how to ask the user to add it.');
  process.exit(1);
}

const SCRATCH = process.env.AF_SCRATCH_DIR || process.cwd();
const captured = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'coach_context_capture.json'), 'utf8'));

// Must match api/coach.js's model mapping exactly — this is what's testing
// production behavior, so drifting the model id here invalidates the test.
const MODEL_ID = 'claude-haiku-4-5';

async function askCoach(conversationTurns, label) {
  const messages = conversationTurns.map((content, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content,
  }));

  const system = [
    { type: 'text', text: captured.systemPrompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: captured.contextBlock, cache_control: { type: 'ephemeral' } },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL_ID, max_tokens: 1024, system, messages }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[${label}] HTTP ${res.status}:`, errText);
    return null;
  }
  const data = await res.json();
  const text = data.content?.map(b => b.text ?? '').join('') ?? '';
  console.log(`\n=== ${label} ===`);
  console.log('USER:', conversationTurns[conversationTurns.length - 1]);
  console.log('COACH:', text);
  console.log(`(usage: in=${data.usage?.input_tokens} cache_read=${data.usage?.cache_read_input_tokens} cache_write=${data.usage?.cache_creation_input_tokens} out=${data.usage?.output_tokens})`);
  return text;
}

// Usage: node coach_live_test.mjs "<question>" [label]
//
// For a single-turn test, that's all you need. For a 2-turn follow-up test
// (asking Coach a narrower question after its first reply, to check it
// stays consistent/on-brand across a conversation) — save the first turn's
// printed COACH: text to a file, then edit the `turns` array below to
// [firstQuestion, fs.readFileSync('<that file>', 'utf8'), followUpQuestion]
// for that one run. Don't build a generic multi-turn CLI for this — the
// fixed small test set in the parent SKILL.md is exactly two such pairs,
// not an open-ended matrix.
const [, , question, label] = process.argv;
if (!question) {
  console.error('Usage: node coach_live_test.mjs "<question>" [label]');
  process.exit(1);
}

const turns = [question];

await askCoach(turns, label || question.slice(0, 40));
