import { createClient } from "@supabase/supabase-js";

// §18.G — proxies Claude API calls through a Vercel function so
// ANTHROPIC_API_KEY stays server-side. Same auth pattern as delete-account.js:
// verify the caller's Supabase session, then call Anthropic and stream the
// response straight back through to the client.

const env = globalThis.process?.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
const anthropicApiKey = env.ANTHROPIC_API_KEY;

const MODEL_IDS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
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

  // Standing constraint (docs/TODO.md §18 header): every AI feature is
  // isAdmin-gated for now, client AND server side — this is the server side.
  const { data: userRow, error: userRowError } = await userClient
    .from("user_data")
    .select("is_admin")
    .eq("user_id", authData.user.id)
    .single();
  if (userRowError || !userRow?.is_admin) {
    return res.status(403).json({ error: "Coach is admin-only for now" });
  }

  const { messages, systemPrompt, contextBlock, model } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages must be a non-empty array" });
  }
  const modelId = MODEL_IDS[model] ?? MODEL_IDS.haiku;

  const system = [];
  if (systemPrompt) system.push({ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } });
  if (contextBlock) system.push({ type: "text", text: contextBlock, cache_control: { type: "ephemeral" } });

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
      messages,
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

  // §18.G cost controls — log token counts per call type outside production.
  const decoder = new TextDecoder();
  let carry = "";
  for await (const chunk of anthropicRes.body) {
    res.write(chunk);
    if (env.VERCEL_ENV === "production") continue;
    carry += decoder.decode(chunk, { stream: true });
    const lines = carry.split("\n");
    carry = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "message_start") {
          const usage = event.message.usage;
          console.log(`[coach:${modelId}] input_tokens=${usage.input_tokens} cache_read=${usage.cache_read_input_tokens ?? 0} cache_write=${usage.cache_creation_input_tokens ?? 0}`);
        } else if (event.type === "message_delta") {
          console.log(`[coach:${modelId}] output_tokens=${event.usage.output_tokens}`);
        }
      } catch {
        // partial or non-JSON line — wait for more chunks
      }
    }
  }
  res.end();
}
