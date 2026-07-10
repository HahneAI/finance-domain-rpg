import { supabase } from "./supabase.js";

/**
 * §18.G — thin client for the Ask Coach feature. Talks only to our own
 * api/coach.js serverless route (never Anthropic directly) so the API key
 * stays server-side. Retries are for network failure before any response —
 * a non-2xx from the route is a real error and is thrown, not retried.
 * Yields text deltas parsed from the proxied SSE stream so callers (chat UI,
 * insight cards, etc.) can render tokens as they arrive.
 */
export async function* chatWithCoach(messages, systemPrompt, contextBlock, model = "haiku") {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const body = JSON.stringify({ messages, systemPrompt, contextBlock, model });

  let res;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body,
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

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = "";
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
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }
}
