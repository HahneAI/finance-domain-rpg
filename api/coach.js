import { createClient } from "@supabase/supabase-js";
import { canAccessAskCoachGeneral } from "../src/lib/entitlements.js";
import { getEntitlement } from "../src/lib/subscription.js";

// §18.G — proxies Claude API calls through a Vercel function so
// ANTHROPIC_API_KEY stays server-side. Same auth pattern as delete-account.js:
// verify the caller's Supabase session, then call Anthropic and stream the
// response straight back through to the client.

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

// Same prod/preview split as _stripeClient.js's Stripe MODE — lets a preview
// deployment burn a separate, disposable Anthropic key/balance during
// feature-building instead of the production key. Falls back to
// ANTHROPIC_API_KEY when no test key is configured (e.g. local dev with only
// one key set) so this never breaks an existing single-key setup.
const MODE = env.VERCEL_ENV === "production" ? "live" : "test";
const anthropicApiKey = MODE === "live" ? env.ANTHROPIC_API_KEY : (env.ANTHROPIC_API_KEY_TEST || env.ANTHROPIC_API_KEY);

console.log(`[coach] outbound calls use ${MODE.toUpperCase()} Anthropic key`);

const MODEL_IDS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
};

// §18.G / DW-9 cost telemetry — $ per million tokens, current published
// rates. Used only to print an estimated cost alongside the real usage
// numbers in the log line below; never sent to Anthropic. Keep in sync with
// docs/BUG_FIX_TODO.md DW-9 if pricing changes.
const PRICE_PER_MTOK = {
  [MODEL_IDS.haiku]: { input: 1.00, output: 5.00 },
  [MODEL_IDS.sonnet]: { input: 3.00, output: 15.00 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!supabaseUrl || !anonKey || !anthropicApiKey) {
    return res.status(500).json({ error: "Server auth configuration is missing" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing access token" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  // Ask Coach chat + Net Worth Check-In card (docs/coach-entry-points.md
  // §§1–2) left the isAdmin/isTester-only standing constraint — this is the
  // server-side half of that gate, re-verified independently of anything the
  // client claims (never trust a client-supplied entitlement flag).
  //
  // Locked decision, 2026-07-25 (entitlements.js's hasPrivilegedAccess):
  // is_investor now passes this gate too, same as is_admin/is_tester — any
  // feature behind a paid wall is free for all three privileged tiers. This
  // supersedes the older "must never expand to include is_investor" note
  // this comment used to carry; the separate, still-true rule that beta
  // testers and investors are distinct account tiers for account-tier
  // surfaces (Demo Tree, investor code path, beta-cohort tracking) is
  // unaffected — see docs/active-systems.md "Beta Tester Accounts".
  //
  // Known gap, not fixed here: Job Hunt Assistant (§18.E) and Résumé Review
  // (§18.E1) are gated client-side on the narrower canAccessAiFeatures
  // (admin/tester/investor only, no trial/paid path), but reuse this same
  // route and this same wider canAccessAskCoachGeneral check server-side —
  // the request body carries no "which surface" field for the server to gate
  // narrower on. In practice this doesn't currently expand who can reach the
  // model beyond what was already true: this endpoint has never validated
  // systemPrompt/contextBlock content against an allowlist, so any
  // canAccessAskCoachGeneral-entitled caller could already send an arbitrary
  // prompt through it. Still worth closing properly (a `surface` field in the
  // request body + a per-surface server gate) before Job Hunt/Résumé Review
  // ship to real trial/paid users who aren't meant to reach them yet.
  const { data: userRow, error: userRowError } = await userClient
    .from("user_data")
    .select(
      "is_admin, is_tester, is_investor, subscription_status, trial_ends_at, access_ends_at, " +
      "current_period_end, stripe_subscription_id"
    )
    .eq("user_id", authData.user.id)
    .single();
  // `now` is always the real wall-clock time here — there's no admin Lock
  // Date concept server-side, so this can't accidentally extend a trial the
  // way a simulated date would (see lib/subscription.js's own warning).
  const entitlement = getEntitlement(
    {
      status: userRow?.subscription_status ?? null,
      trialEndsAt: userRow?.trial_ends_at ?? null,
      accessEndsAt: userRow?.access_ends_at ?? null,
      currentPeriodEnd: userRow?.current_period_end ?? null,
      stripeSubscriptionId: userRow?.stripe_subscription_id ?? null,
    },
    new Date()
  );
  if (userRowError || !canAccessAskCoachGeneral({ isAdmin: userRow?.is_admin, isTester: userRow?.is_tester, isInvestor: userRow?.is_investor, entitlement })) {
    return res.status(403).json({ error: "Coach requires an active trial or subscription" });
  }

  const { messages, systemPrompt, contextBlock, model } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  const modelId = MODEL_IDS[model] ?? MODEL_IDS.haiku;

  const system = [];
  if (systemPrompt) system.push({ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } });
  if (contextBlock) system.push({ type: "text", text: contextBlock, cache_control: { type: "ephemeral" } });

  // DW-9 — cache the growing conversation history too, not just the frozen
  // system prompt. Without this, every turn of a multi-turn Ask Coach chat
  // re-sends and re-prices the *entire* prior exchange at full input rate;
  // the breakpoint on the last (newest) message lets the next turn read
  // everything through this point from cache instead. Per Anthropic's
  // prompt-caching guidance, the multi-turn breakpoint belongs on the last
  // content block of the most-recently-appended turn — that's always
  // `messages[messages.length - 1]` here, since the client only ever calls
  // this route with the latest user turn appended.
  const cachedMessages = messages.map((m, i) => {
    if (i !== messages.length - 1) return m;
    const content = typeof m.content === "string"
      ? [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }]
      : m.content;
    return { ...m, content };
  });

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 1024,
      system,
      messages: cachedMessages,
      stream: true,
    }),
  });

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errBody = await anthropicRes.text().catch(() => "");
    console.error("coach: Anthropic API error", anthropicRes.status, errBody);
    return res.status(502).json({ error: "Coach is temporarily unavailable" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // DW-9 cost telemetry — was dev/preview-only before (`if (VERCEL_ENV ===
  // "production") continue`), which meant the one place real user cost would
  // show up was exactly the environment that skipped logging it. Now runs in
  // every environment and prints one structured line per call (not two) with
  // a computed cost estimate, so it reads directly out of Vercel's log
  // viewer without needing a spreadsheet to interpret raw token counts.
  const decoder = new TextDecoder();
  let carry = "";
  const usage = { input_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 };
  for await (const chunk of anthropicRes.body) {
    res.write(chunk);
    carry += decoder.decode(chunk, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "message_start") {
          Object.assign(usage, event.message.usage);
        } else if (event.type === "message_delta") {
          usage.output_tokens = event.usage.output_tokens;
        }
      } catch {
        // partial or non-JSON line — wait for more chunks
      }
    }
  }
  const price = PRICE_PER_MTOK[modelId] ?? PRICE_PER_MTOK[MODEL_IDS.haiku];
  const estCostUsd = (
    usage.input_tokens * price.input
    + usage.cache_read_input_tokens * price.input * 0.1
    + usage.cache_creation_input_tokens * price.input * 1.25
    + usage.output_tokens * price.output
  ) / 1_000_000;
  console.log(`[coach:usage] model=${modelId} input=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens} cache_write=${usage.cache_creation_input_tokens} output=${usage.output_tokens} est_cost_usd=${estCostUsd.toFixed(6)}`);
  res.end();
}
