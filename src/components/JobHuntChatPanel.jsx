import { useEffect, useRef, useState } from "react";
import { Pressable } from "./ui.jsx";
import { chatWithCoach } from "../lib/claude.js";
import { buildJobHuntContext } from "../lib/aiContext.js";
import { JOB_HUNT_SYSTEM_PROMPT } from "../lib/coachPrompts.js";

/**
 * §18.E — Job Hunt Assistant. A focused, single-session chat scoped to
 * coaching the job search itself (application strategy, interview prep,
 * salary negotiation, holding-out judgment calls) — grounded in
 * buildJobHuntContext(), not the general Ask Coach snapshot. Deliberately
 * v1-scoped like AskCoachPanel originally was: no chat-history/retention
 * system yet — that's a follow-up pass once this mode has proven itself,
 * mirroring how Ask Coach got persistence only after its own v1 shipped.
 * Uses Sonnet, not Haiku, per §18.G's cost-control split (Haiku for chat/
 * FAQ/triggers; Sonnet for statement summaries and job-hunt drafts).
 * Gated at the call site on canAccessAiFeatures (§18 sections 4+ standing
 * constraint — admin/tester/investor, unlike Ask Coach's wider trial/paid
 * gate; locked decision 2026-07-25 is that this feature is paid-only once
 * split off, not trial-included like sections 1-2 — see coach-entry-points.md).
 */
export function JobHuntChatPanel({
  onClose,
  isExiting = false,
  config,
  expenses = [],
  effectiveToday,
  includeBenefits = true,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [errored, setErrored] = useState(false);
  const listEndRef = useRef(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setErrored(false);
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setSending(true);
    try {
      const contextBlock = buildJobHuntContext({ config, expenses, effectiveToday, includeBenefits });
      let accumulated = "";
      for await (const chunk of chatWithCoach(nextMessages, JOB_HUNT_SYSTEM_PROMPT, contextBlock, "sonnet")) {
        accumulated += chunk;
        setMessages([...nextMessages, { role: "assistant", content: accumulated }]);
      }
    } catch {
      setErrored(true);
      setMessages(nextMessages);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fold-lift"
      data-fold={isExiting ? "exiting" : "entering"}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        background: "var(--color-bg-base)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}
      >
        <span className="text-base" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)", fontWeight: "bold" }}>
          Job Hunt Assistant
        </span>
        <Pressable
          onClick={onClose}
          aria-label="Close Job Hunt Assistant"
          style={{
            background: "var(--color-bg-raised)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            fontSize: "18px",
            lineHeight: 1,
          }}
        >×</Pressable>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {messages.length === 0 && (
          <div className="text-base" style={{ color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
            Ask about application strategy, interview prep, salary negotiation, or how long your
            runway lets you hold out for the right offer — I've got your numbers.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className="text-md" style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "var(--color-bg-raised)" : "var(--color-bg-surface)",
              border: m.role === "user" ? "none" : "1px solid var(--color-border-subtle)",
              borderRadius: "14px",
              padding: "10px 14px",
              lineHeight: 1.5,
              color: "var(--color-text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content || (sending && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {errored && (
          <div className="text-sm" style={{ color: "var(--color-red)", }}>Coach couldn't respond — try again.</div>
        )}
        <div ref={listEndRef} />
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about the search…"
          style={{
            flex: 1,
            background: "var(--color-bg-surface)",
            border: "1px solid var(--color-border-subtle)",
            borderRadius: "10px",
            color: "var(--color-text-primary)",
            fontSize: "16px",
            padding: "10px 12px",
          }}
        />
        <Pressable
          onClick={send}
          disabled={!draft.trim() || sending}
          className="text-xs" style={{
            background: draft.trim() && !sending ? "var(--color-accent-primary)" : "var(--color-bg-raised)",
            border: "none",
            borderRadius: "10px",
            color: draft.trim() && !sending ? "var(--color-bg-base)" : "var(--color-text-disabled)",
            letterSpacing: "1px",
            textTransform: "uppercase",
            fontWeight: "bold",
            padding: "0 18px",
            cursor: draft.trim() && !sending ? "pointer" : "not-allowed",
            minHeight: "44px",
          }}
        >Send</Pressable>
      </div>
    </div>
  );
}
