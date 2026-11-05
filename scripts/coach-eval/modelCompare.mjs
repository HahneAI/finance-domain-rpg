// Model comparison runner (2026-10-29) — replays every promptfoo config in this folder
// against its own original model(s) AND a candidate model, side by side, with the same
// prompt builders, fixtures and vars. Built for the Claude Haiku 5.5 baseline: the old
// results on disk were taken under older prompts, so a fair comparison re-runs both
// models now rather than comparing against stale transcripts.
//
// Why not promptfoo: the 5.5 models think by default and take an `effort` setting, and
// this needs exact control of the request (production's shape: two cache_control'd
// system blocks folded into one here, max_tokens from the config) plus per-call usage,
// stop_reason and cost. The configs stay the source of truth for prompts and tests.
//
// Usage (from scripts/coach-eval):
//   node modelCompare.mjs                                  # all configs, originals + claude-haiku-5-5
//   node modelCompare.mjs --only phase5i-lock-askcoach     # substring filter on config name
//   node modelCompare.mjs --candidate-only                 # skip the original models
//   node modelCompare.mjs --effort low                     # candidate effort (default: model default)
//   node modelCompare.mjs --repeat 2 --out results/compare.json
//
// Reads AI_ADMIN_COACH_TEST_KEY directly (never ANTHROPIC_API_KEY). No retries, same
// budget discipline as the other runners: an error is recorded, not re-sent.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.AI_ADMIN_COACH_TEST_KEY;
if (!KEY) {
  console.error("AI_ADMIN_COACH_TEST_KEY is not set — refusing to run.");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const CANDIDATE = flag("candidate", "claude-haiku-5-5");
const EFFORT = flag("effort", null);
const REPEAT = Number(flag("repeat", "1"));
const ONLY = flag("only", null);
const MATCH = flag("match", null) ? new RegExp(flag("match", null)) : null; // regex on the config file name
const CONCURRENCY = Number(flag("concurrency", "4"));
const MAX_CALLS = Number(flag("max-calls", "600"));
const CANDIDATE_ONLY = args.includes("--candidate-only");
const OUT = flag("out", path.join("results", `compare-${CANDIDATE}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`));

// $ per million tokens. Haiku 5.5's rate applies to prompts of 100K tokens or fewer —
// every Coach prompt is far below that.
const PRICES = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

function costOf(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return null;
  const inTok = usage.input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const read = usage.cache_read_input_tokens ?? 0;
  return (inTok * p.input + write * p.input * 1.25 + read * p.input * 0.1 + (usage.output_tokens ?? 0) * p.output) / 1e6;
}

const PANEL_RE = /\b(Home|Income|Upkeep|Log|Account)\b/;
function metricsOf(text) {
  const t = (text ?? "").trim();
  const words = t ? t.split(/\s+/).length : 0;
  const sentences = t ? (t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t]).length : 0;
  const numbers = (t.match(/\$?\d[\d,]*(\.\d+)?%?/g) ?? []).length;
  const paragraphs = t ? t.split(/\n\s*\n/).filter(Boolean).length : 0;
  const lastSentence = (t.match(/[^.!?]+[.!?]*\s*$/) ?? [""])[0];
  return {
    words, sentences, numbers, paragraphs,
    endsOnPanel: PANEL_RE.test(lastSentence),
    markdown: /(\*\*|^#{1,3} |^\s*[-*] )/m.test(t),
    emDash: (t.match(/—/g) ?? []).length,
  };
}

async function loadConfig(file) {
  const cfg = yaml.load(fs.readFileSync(path.join(here, file), "utf8"));
  const prompts = [];
  for (const p of cfg.prompts ?? []) {
    const id = typeof p === "string" ? p : p.id;
    const rel = id.replace(/^file:\/\//, "");
    const mod = await import(pathToFileURL(path.join(here, rel)).href);
    prompts.push({ label: p.label ?? rel, build: mod.default });
  }
  const providers = (cfg.providers ?? []).map((p) => {
    const id = typeof p === "string" ? p : p.id;
    return { model: id.replace(/^anthropic:messages:/, ""), maxTokens: p.config?.max_tokens ?? 1024 };
  });
  const defaults = cfg.defaultTest?.vars ?? {};
  const tests = (cfg.tests ?? []).map((t, i) => ({ description: t.description ?? `test ${i + 1}`, vars: { ...defaults, ...(t.vars ?? {}) } }));
  return { file, prompts, providers, tests };
}

async function callModel({ model, maxTokens, messages, effort }) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  const body = {
    model,
    max_tokens: maxTokens,
    ...(system ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] } : {}),
    messages: rest,
    ...(effort ? { output_config: { effort } } : {}),
  };
  const started = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - started;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `${res.status} ${json?.error?.message ?? ""}`.trim(), latencyMs };
  const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  const blockTypes = (json.content ?? []).map((b) => b.type);
  return { text, stopReason: json.stop_reason, usage: json.usage, blockTypes, latencyMs };
}

async function main() {
  const files = fs.readdirSync(here).filter((f) => /^promptfooconfig.*\.yaml$/.test(f) && (!ONLY || f.includes(ONLY)) && (!MATCH || MATCH.test(f))).sort();
  const jobs = [];
  for (const f of files) {
    const cfg = await loadConfig(f);
    const candidateMax = Math.max(...cfg.providers.map((p) => p.maxTokens), 1024);
    const models = [
      ...(CANDIDATE_ONLY ? [] : cfg.providers.map((p) => ({ ...p, effort: null }))),
      { model: CANDIDATE, maxTokens: candidateMax, effort: EFFORT },
    ];
    for (const test of cfg.tests) for (const prompt of cfg.prompts) for (const m of models) for (let rep = 1; rep <= REPEAT; rep++) {
      jobs.push({ config: f.replace(/^promptfooconfig\.?|\.yaml$/g, "") || "base", test: test.description, prompt: prompt.label, vars: test.vars, build: prompt.build, ...m, rep });
    }
  }
  if (jobs.length > MAX_CALLS) {
    console.error(`${jobs.length} calls planned, over --max-calls ${MAX_CALLS}. Narrow with --only or raise the cap.`);
    process.exit(1);
  }
  console.log(`${files.length} configs, ${jobs.length} calls (candidate ${CANDIDATE}${EFFORT ? `, effort ${EFFORT}` : ""}, repeat ${REPEAT})`);

  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      const j = jobs[i];
      let r;
      try {
        r = await callModel({ model: j.model, maxTokens: j.maxTokens, messages: j.build({ vars: j.vars }), effort: j.effort });
      } catch (e) {
        r = { error: String(e?.message ?? e) };
      }
      results[i] = {
        config: j.config, test: j.test, prompt: j.prompt, model: j.model, effort: j.effort, maxTokens: j.maxTokens, rep: j.rep,
        ...r, cost: costOf(j.model, r.usage), metrics: r.text != null ? metricsOf(r.text) : null,
      };
      done++;
      if (done % 10 === 0 || done === jobs.length) process.stdout.write(`  ${done}/${jobs.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.mkdirSync(path.dirname(path.resolve(here, OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(here, OUT), JSON.stringify({ candidate: CANDIDATE, effort: EFFORT, repeat: REPEAT, ranAt: new Date().toISOString(), results }, null, 2));

  const byModel = {};
  for (const r of results) {
    const s = (byModel[r.model] ??= { calls: 0, errors: 0, truncated: 0, cost: 0, latency: 0, words: 0, out: 0, ok: 0 });
    s.calls++;
    if (r.error) { s.errors++; continue; }
    s.ok++;
    if (r.stopReason === "max_tokens") s.truncated++;
    s.cost += r.cost ?? 0;
    s.latency += r.latencyMs ?? 0;
    s.words += r.metrics?.words ?? 0;
    s.out += r.usage?.output_tokens ?? 0;
  }
  console.log("\nmodel | calls | errors | truncated | avg words | avg output tokens | avg latency | total cost");
  for (const [m, s] of Object.entries(byModel)) {
    const n = Math.max(s.ok, 1);
    console.log(`${m} | ${s.calls} | ${s.errors} | ${s.truncated} | ${(s.words / n).toFixed(0)} | ${(s.out / n).toFixed(0)} | ${(s.latency / n / 1000).toFixed(1)}s | $${s.cost.toFixed(4)}`);
  }
  const firstError = results.find((r) => r.error);
  if (firstError) console.log(`\nfirst error: ${firstError.model} · ${firstError.config} · ${firstError.error}`);
  console.log(`\nwrote ${OUT}`);
}

main();
