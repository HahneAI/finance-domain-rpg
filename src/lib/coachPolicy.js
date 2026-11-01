// Coach request policy — one module shared by api/coach.js (the server gate) and the
// browser (model routing), so the two can never disagree about who may use which model.
// Shotgun run 2026-10-29: docs/TODO.md §2.L Phase 7 (per-message Haiku/Sonnet routing)
// and docs/coach-tuning-handoff.md §6 item 5 (per-surface gate + tool-round cap).
//
// Pure: no React, no Supabase, no network. api/coach.js imports it the same way it
// already imports entitlements.js.

// Who gets Sonnet on Ask Coach turns that need range. The single switch for the whole
// rollout: the browser only routes to Sonnet for this audience, and the server refuses
// Sonnet on ask_coach for anyone outside it. "privileged" = admin/tester/investor/AI admin
// (the accounts that already bypass the paid wall); flip to "all" once the per-call cost
// (~3.6–4.5× Haiku, docs/TODO.md §2.G) is accepted for trial/paid users; "none" = Haiku only.
export const ASK_COACH_SONNET_AUDIENCE = "privileged";

// Each Coach surface, its server-side gate, the models it may run on and its max_tokens. The
// first model in the list is the fallback when a client asks for one the surface doesn't allow.
// maxTokens (2026-10-29): Sonnet 5 thinks by default and the thinking counts toward max_tokens,
// so the old flat 1024 cut Résumé reviews off mid-sentence (1 of 2 production-shaped calls; the
// harness averaged 1,123 output tokens per review, ~575 of them thinking). The cap only bounds
// a reply; unused headroom costs nothing.
export const COACH_SURFACES = {
  ask_coach: { privilegedOnly: false, models: ["haiku", "sonnet"], maxTokens: 2048 },
  net_worth: { privilegedOnly: false, models: ["haiku"], maxTokens: 1024 },
  job_hunt: { privilegedOnly: true, models: ["sonnet"], maxTokens: 2048 },
  resume_review: { privilegedOnly: true, models: ["sonnet"], maxTokens: 4096 },
};

// Cached older clients send no surface; their requests get Ask Coach's cap.
const DEFAULT_MAX_TOKENS = COACH_SURFACES.ask_coach.maxTokens;

// Mirrors lib/claude.js's MAX_TOOL_ROUNDS, enforced again on the server so a modified
// client can't loop tool rounds without limit.
export const MAX_SERVER_TOOL_ROUNDS = 4;

export function canUseSonnetOnAskCoach(privileged, audience = ASK_COACH_SONNET_AUDIENCE) {
  if (audience === "all") return true;
  if (audience === "privileged") return Boolean(privileged);
  return false;
}

// Turns where Haiku's narrow range showed up in live testing (docs/coach-personality-rubric.md,
// "Locked Targets"): what-ifs, decisions, goal-setting, and long messages. Everything else —
// status checks, lookups (even two-part ones, which Haiku handled cleanly in every live run),
// how-does-this-work — stays on Haiku.
const NEEDS_RANGE = [
  /\bwhat if\b/i,
  /\bif i\b/i,
  /\bshould i\b/i,
  /\bworth it\b/i,
  /\bafford\b/i,
  /\bhow much (sooner|later|faster|longer)\b/i,
  /\binstead of\b/i,
  /\bcompare\b/i,
  /\bpush(ed)? (my|it|them|the)\b.*\bback\b/i,
  /\b(save|saving) (up )?for\b/i,
  /\b(new|add|set|start) (a )?goal\b/i,
  /\bkind of person\b/i,
  /\bwho i want to be\b/i,
];

export function chooseCoachModel(text, { privileged = false, audience = ASK_COACH_SONNET_AUDIENCE } = {}) {
  if (!canUseSonnetOnAskCoach(privileged, audience)) return "haiku";
  const t = String(text ?? "");
  if (t.length > 220) return "sonnet";
  return NEEDS_RANGE.some((re) => re.test(t)) ? "sonnet" : "haiku";
}

// Server-side resolution of one request. `surface` absent = a cached older client: it keeps
// working, but only a privileged account keeps its requested model; everyone else gets Haiku.
export function resolveCoachRequest({ surface, model, privileged }) {
  if (surface === undefined || surface === null) {
    const allowed = privileged && (model === "haiku" || model === "sonnet");
    return { ok: true, model: allowed ? model : "haiku", maxTokens: DEFAULT_MAX_TOKENS };
  }
  const policy = COACH_SURFACES[surface];
  if (!policy) return { ok: false, status: 400, error: `Unknown Coach surface: ${String(surface)}` };
  if (policy.privilegedOnly && !privileged) {
    return { ok: false, status: 403, error: "This Coach feature isn't available on your plan yet" };
  }
  let resolved = policy.models.includes(model) ? model : policy.models[0];
  if (surface === "ask_coach" && resolved === "sonnet" && !canUseSonnetOnAskCoach(privileged)) resolved = "haiku";
  return { ok: true, model: resolved, maxTokens: policy.maxTokens };
}

// How many tool rounds the conversation is already into: assistant turns carrying a tool_use
// block since the user last wrote something themselves (a turn that isn't only tool_results).
export function countTrailingToolRounds(messages) {
  let rounds = 0;
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const m = messages[i];
    const blocks = Array.isArray(m?.content) ? m.content : null;
    if (m?.role === "assistant") {
      if (blocks?.some((b) => b?.type === "tool_use")) rounds++;
      continue;
    }
    if (m?.role === "user") {
      const onlyToolResults = blocks && blocks.length > 0 && blocks.every((b) => b?.type === "tool_result");
      if (!onlyToolResults) break;
    }
  }
  return rounds;
}
