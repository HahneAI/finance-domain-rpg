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
// service_role — used ONLY for the is_ai_admin daily usage cap below (a
// service-role client is required because ai_admin_coach_calls_* are not in
// migration 019's client column-grant list, same as every other privileged
// column). Same env var api/delete-account.js already relies on.
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
// Rudimentary daily cap on Coach calls for is_ai_admin accounts specifically
// (see the block below). Override via env for a looser/tighter cap without a
// code change.
const AI_ADMIN_DAILY_COACH_LIMIT = Number(env.AI_ADMIN_COACH_DAILY_LIMIT) || 25;

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
      "is_admin, is_tester, is_investor, is_ai_admin, subscription_status, trial_ends_at, access_ends_at, " +
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
  if (userRowError || !canAccessAskCoachGeneral({ isAdmin: userRow?.is_admin, isTester: userRow?.is_tester, isInvestor: userRow?.is_investor, isAiAdmin: userRow?.is_ai_admin, entitlement })) {
    return res.status(403).json({ error: "Coach requires an active trial or subscription" });
  }

  // ── AI Admin daily Coach call cap ────────────────────────────────────────
  // is_ai_admin accounts (docs/admin-toolkit-reference.md "AI Admin") get the
  // same front-line feature access as a beta tester, INCLUDING Coach — but
  // unlike a human tester, an AI agent can loop a chat far faster than any
  // person would, which would burn through the shared Anthropic API budget
  // (§18.G cost telemetry above) during routine feature testing. This is a
  // rudimentary, best-effort daily counter — not exact under concurrent
  // requests — scoped ONLY to is_ai_admin; every other account (admin,
  // tester, investor, real trial/paid) is completely unaffected.
  if (userRow?.is_ai_admin) {
    if (!serviceRoleKey) {
      // Fail closed for this tier specifically — better to block an AI admin
      // account than let a misconfigured deploy silently skip the cap.
      console.error("[coach] AI Admin cap: SUPABASE_SERVICE_ROLE_KEY missing, denying request");
      return res.status(500).json({ error: "AI Admin usage cap is not configured" });
    }
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: usageRow } = await adminClient
      .from("user_data")
      .select("ai_admin_coach_calls_date, ai_admin_coach_calls_count")
      .eq("user_id", authData.user.id)
      .single();
    const sameDay = usageRow?.ai_admin_coach_calls_date === todayIso;
    const nextCount = (sameDay ? (usageRow?.ai_admin_coach_calls_count ?? 0) : 0) + 1;
    if (nextCount > AI_ADMIN_DAILY_COACH_LIMIT) {
      return res.status(429).json({
        error: `AI Admin Coach usage cap reached (${AI_ADMIN_DAILY_COACH_LIMIT}/day). Resets at midnight UTC.`,
      });
    }
    const { error: usageUpdateError } = await adminClient
      .from("user_data")
      .update({ ai_admin_coach_calls_date: todayIso, ai_admin_coach_calls_count: nextCount })
      .eq("user_id", authData.user.id);
    if (usageUpdateError) {
      // Don't block the request over a telemetry-write failure — log and continue.
      console.error("[coach] AI Admin cap: failed to persist usage counter", usageUpdateError.message);
    }
  }

  const { messages, systemPrompt, contextBlock, model, tools } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  const modelId = MODEL_IDS[model] ?? MODEL_IDS.haiku;
  // Coach's drill-down tools (src/lib/coachTools.js) EXECUTE IN THE BROWSER,
  // not here — this route only forwards the declarations and streams the
  // model's tool_use blocks back for the client to run. That's deliberate:
  // the client already holds every figure the tools read, so nothing extra
  // crosses the network, and no second serverless function is needed (the
  // deployment sits at 12/12 on Vercel's Hobby cap — see CLAUDE.md).
  //
  // Forwarding a client-supplied tool list adds no new server-side trust
  // problem: this route has never validated systemPrompt/contextBlock content
  // either (see the known-gap note above), and a tool declaration is inert
  // here — it can only ever cause the model to ask the CALLER to run
  // something, against data that caller already has. Shape-checked only, so a
  // malformed body fails here with a clear 400 instead of an opaque 400 from
  // Anthropic.
  const hasTools = Array.isArray(tools) && tools.length > 0;
  if (tools !== undefined && !Array.isArray(tools)) {
    return res.status(400).json({ error: "tools must be an array when provided" });
  }

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
  //
  // 2026-09-02: this used to assume "the client only ever calls this route
  // with the latest user turn appended," which stopped being true when the
  // drill-down tools landed — a tool round re-calls this route with an
  // assistant tool_use turn and a user tool_result turn appended, both
  // carrying ARRAY content rather than a string. The old string-only branch
  // silently passed those through with no cache_control at all, dropping the
  // multi-turn breakpoint on exactly the turns a tool loop makes most
  // expensive. The breakpoint still belongs on the last content block of the
  // most-recently-appended turn either way; it just has to be attached
  // block-wise now, not only in the string case.
  const withCacheBreakpoint = (m) => {
    if (typeof m.content === "string") {
      return { ...m, content: [{ type: "text", text: m.content, cache_control: { type: "ephemeral" } }] };
    }
    if (!Array.isArray(m.content) || m.content.length === 0) return m;
    const content = m.content.map((block, i) =>
      i === m.content.length - 1 ? { ...block, cache_control: { type: "ephemeral" } } : block
    );
    return { ...m, content };
  };
  const cachedMessages = messages.map((m, i) => (i === messages.length - 1 ? withCacheBreakpoint(m) : m));

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
      ...(hasTools ? { tools } : {}),
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
