import { useEffect, useRef, useState } from "react";
import { Pressable } from "./ui.jsx";
import { chatWithCoach } from "../lib/claude.js";
import { buildCoachContext } from "../lib/aiContext.js";
import { ASK_COACH_SYSTEM_PROMPT } from "../lib/coachPrompts.js";

/**
 * §18.B Phase A — minimal Ask Coach chat panel (docs/TODO.md §18.0 build
 * order). No persistence yet: history lives in component state and is lost
 * on close, by design, to prove auth → context → stream → mobile UX first.
 * §18.H's coach_chats wiring lands as its own pass once this feels right.
 * Gated at the call site (isAdmin/isTester) per the §18 standing constraint.
 */
export function AskCoachPanel({
  onClose,
  config,
  expenses = [],
  goals = [],
  weeklyIncome = 0,
  avgWeeklySpend = 0,
  fundedGoalSpend = 0,
  currentWeek,
  today,
  runwayDays = null,
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
      const contextBlock = buildCoachContext({
        config, weeklyIncome, avgWeeklySpend, goals, expenses, fundedGoalSpend, currentWeek, today, runwayDays,
      });
      let accumulated = "";
      for await (const chunk of chatWithCoach(nextMessages, ASK_COACH_SYSTEM_PROMPT, contextBlock, "haiku")) {
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
        <span style={{ fontSize: "13px", letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)", fontWeight: "bold" }}>
          Ask Coach
        </span>
        <Pressable
          onClick={onClose}
          aria-label="Close Ask Coach"
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
          <div style={{ color: "var(--color-text-secondary)", fontSize: "13px", lineHeight: 1.5 }}>
            Ask me anything about how Authority Finance works — your setup, a metric, a panel, or how to log something.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "85%",
              background: m.role === "user" ? "var(--color-bg-raised)" : "var(--color-bg-surface)",
              border: m.role === "user" ? "none" : "1px solid var(--color-border-subtle)",
              borderRadius: "14px",
              padding: "10px 14px",
              fontSize: "14px",
              lineHeight: 1.5,
              color: "var(--color-text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.content || (sending && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        {errored && (
          <div style={{ color: "var(--color-red)", fontSize: "12px" }}>Coach couldn't respond — try again.</div>
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
          placeholder="Ask Coach…"
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
          style={{
            background: draft.trim() && !sending ? "var(--color-accent-primary)" : "var(--color-bg-raised)",
            border: "none",
            borderRadius: "10px",
            color: draft.trim() && !sending ? "var(--color-bg-base)" : "var(--color-text-disabled)",
            fontSize: "11px",
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
