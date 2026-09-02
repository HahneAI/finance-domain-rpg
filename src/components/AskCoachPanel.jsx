import { useEffect, useRef, useState } from "react";
import { Pressable } from "./ui.jsx";
import { chatWithCoach } from "../lib/claude.js";
import { buildCoachContext } from "../lib/aiContext.js";
import { ASK_COACH_TOOLS } from "../lib/coachTools.js";
import { ASK_COACH_SYSTEM_PROMPT, COACH_CHAT_SUMMARY_PROMPT } from "../lib/coachPrompts.js";
import { loadCoachChats, saveCoachChat, deleteCoachChat } from "../lib/db.js";
import coachAvatar from "../assets/coach-avatar-color.png";
import coachLineartMono from "../assets/coach-avatar-lineart-mono.png";
import { CoachMonocleIcon } from "./CoachMonocleIcon.jsx";

// §2.H — how many past Ask Coach conversations we keep. Matches the standing
// plan's "save a person's last three conversations" — refreshHistory() below
// prunes anything past this count every time a chat is saved, except the one
// currently open (never delete out from under an active session).
const MAX_SAVED_CHATS = 3;

// Blank-background states (empty chat, loading history, no saved chats) all
// share the same "line-art mark + short message" treatment.
function EmptyStateArt({ children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "14px", margin: "auto", padding: "24px 12px" }}>
      <img src={coachLineartMono} alt="" style={{ width: "120px", height: "120px", opacity: 0.85 }} />
      <div className="text-base" style={{ color: "var(--color-text-secondary)", lineHeight: 1.5, maxWidth: "260px" }}>
        {children}
      </div>
    </div>
  );
}

function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const text = firstUser.content.trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function relativeDateLabel(iso) {
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dateBucket(iso) {
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays < 7) return "This Week";
  return "Older";
}

function groupChatsByDate(chats) {
  const buckets = { Today: [], "This Week": [], Older: [] };
  for (const chat of chats) buckets[dateBucket(chat.createdAt)].push(chat);
  return ["Today", "This Week", "Older"]
    .filter((label) => buckets[label].length > 0)
    .map((label) => ({ label, chats: buckets[label] }));
}

const headerIconBtnStyle = {
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
  flexShrink: 0,
};

function FeatherIcon({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/**
 * §2.B/H — Ask Coach chat panel. Multi-turn conversation persists to
 * `coach_chats` (migration 023) after every completed turn — not just on
 * close — so a backgrounded tab can't lose an exchange (same eager-save
 * reasoning CLAUDE.md's Persistence section applies to config/goals/etc.).
 * A lightweight history view lists the user's last `MAX_SAVED_CHATS` saved
 * conversations, grouped by date, resumable with a tap. Gated at the call
 * site (canAccessAskCoachGeneral) per the §2 standing constraint.
 */
export function AskCoachPanel({
  onClose,
  isExiting = false,
  config,
  expenses = [],
  goals = [],
  weeklyIncome = 0,
  avgWeeklySpend = 0,
  fundedGoalSpend = 0,
  currentWeek,
  today,
  runwayDays = null,
  logs = [],
  futureWeeks = [],
  timelineWeekNets = [],
  futureWeekNets = [],
  logNetLost = 0,
  logNetGained = 0,
  futureEventDeductions = {},
  prevWeekNet = null,
  allWeeks = [],
}) {
  const [view, setView] = useState("chat"); // "chat" | "history"
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [errored, setErrored] = useState(false);
  const [historyChats, setHistoryChats] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const listEndRef = useRef(null);
  const inputRef = useRef(null);

  const activeChatIdRef = useRef(null);
  const chatTitleRef = useRef(null);
  const summaryGeneratedRef = useRef(false);
  const messagesRef = useRef([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Body fold-lift: replays a lift-in on every History/Back/New Chat switch
  // between the chat and history views, using the same fold-lift system as
  // the panel's own open/close — but skipped on first mount so it doesn't
  // stack with the panel's own entrance animation.
  const [bodyFold, setBodyFold] = useState(null);
  const isFirstViewRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstViewRenderRef.current) { isFirstViewRenderRef.current = false; return; }
    setBodyFold("entering");
  }, [view]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await loadCoachChats();
      if (cancelled) return;
      setHistoryChats(all.filter((c) => c.chatType === "ask_coach").slice(0, MAX_SAVED_CHATS));
      setHistoryLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Refreshes the history list from the DB and enforces the retention cap —
  // whatever's oldest beyond MAX_SAVED_CHATS gets deleted, except the chat
  // currently open (a session in progress must never be pruned out from
  // under the person having it, even if it's the oldest of the three).
  async function refreshHistory(keepId) {
    const all = await loadCoachChats();
    const askChats = all.filter((c) => c.chatType === "ask_coach");
    setHistoryChats(askChats.slice(0, MAX_SAVED_CHATS));
    for (const stale of askChats.slice(MAX_SAVED_CHATS)) {
      if (stale.id !== keepId) deleteCoachChat(stale.id);
    }
  }

  async function persistChat(finalMessages) {
    const stamped = finalMessages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ?? new Date().toISOString(),
    }));
    if (!chatTitleRef.current) chatTitleRef.current = deriveTitle(stamped);
    const savedId = await saveCoachChat({
      id: activeChatIdRef.current,
      chatType: "ask_coach",
      title: chatTitleRef.current,
      messages: stamped,
    });
    if (!savedId) return;
    if (!activeChatIdRef.current) {
      activeChatIdRef.current = savedId;
    }
    refreshHistory(activeChatIdRef.current);
  }

  // Best-effort: writes a short Coach-generated summary onto the chat that's
  // about to leave view (closed, replaced by a new chat, or swapped for a
  // resumed one). Fire-and-forget — the conversation itself is already saved
  // by persistChat by this point, so a failure here just leaves summary blank.
  async function finalizeSummary(chatId, fullMessages, title) {
    try {
      const summaryMessages = [
        ...fullMessages.map(({ role, content }) => ({ role, content })),
        { role: "user", content: "Summarize this conversation for the saved chat history entry." },
      ];
      let summary = "";
      for await (const chunk of chatWithCoach(summaryMessages, COACH_CHAT_SUMMARY_PROMPT, null, "haiku")) {
        summary += chunk;
      }
      if (summary.trim()) {
        await saveCoachChat({ id: chatId, chatType: "ask_coach", title, messages: fullMessages, summary: summary.trim() });
      }
    } catch {
      // non-critical — the conversation itself already persisted
    }
  }

  function endCurrentSession() {
    if (activeChatIdRef.current && !summaryGeneratedRef.current && messagesRef.current.length >= 2) {
      summaryGeneratedRef.current = true;
      finalizeSummary(activeChatIdRef.current, messagesRef.current, chatTitleRef.current);
    }
  }

  function resetToNewChat() {
    activeChatIdRef.current = null;
    chatTitleRef.current = null;
    summaryGeneratedRef.current = false;
    setMessages([]);
    setDraft("");
    setErrored(false);
    setView("chat");
  }

  function handleNewChat() {
    endCurrentSession();
    resetToNewChat();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleResumeChat(chat) {
    if (chat.id !== activeChatIdRef.current) endCurrentSession();
    activeChatIdRef.current = chat.id;
    chatTitleRef.current = chat.title ?? null;
    summaryGeneratedRef.current = false;
    setMessages((chat.messages ?? []).map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp })));
    setDraft("");
    setErrored(false);
    setView("chat");
  }

  async function handleDeleteChat(e, chat) {
    e.stopPropagation();
    await deleteCoachChat(chat.id);
    setHistoryChats((prev) => prev.filter((c) => c.id !== chat.id));
    if (chat.id === activeChatIdRef.current) resetToNewChat();
  }

  function handleClose() {
    endCurrentSession();
    onClose();
  }

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setErrored(false);
    const userMsg = { role: "user", content: text, timestamp: new Date().toISOString() };
    const nextMessages = [...messages, userMsg];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setSending(true);
    try {
      const contextBlock = buildCoachContext({
        config, weeklyIncome, avgWeeklySpend, goals, expenses, fundedGoalSpend, currentWeek, today, runwayDays, logs,
        futureWeeks, timelineWeekNets, futureWeekNets, logNetLost, logNetGained, futureEventDeductions, prevWeekNet, allWeeks,
      });
      const apiMessages = nextMessages.map(({ role, content }) => ({ role, content }));
      // Drill-down tools (lib/coachTools.js) run in the browser against this
      // exact prop bag — the same one buildCoachContext() reads above, so a
      // tool can never resolve a figure differently than the context block
      // that summarizes it. Only the visible text is accumulated into the
      // message; tool_use/tool_result blocks stay inside chatWithCoach and are
      // never persisted to coach_chats.
      const toolData = {
        config, goals, expenses, logs, currentWeek, today, allWeeks, futureWeeks,
        timelineWeekNets, logNetLost, logNetGained, futureEventDeductions,
      };
      let accumulated = "";
      for await (const chunk of chatWithCoach(apiMessages, ASK_COACH_SYSTEM_PROMPT, contextBlock, "haiku", { tools: ASK_COACH_TOOLS, toolData })) {
        accumulated += chunk;
        setMessages([...nextMessages, { role: "assistant", content: accumulated }]);
      }
      const finalMessages = [...nextMessages, { role: "assistant", content: accumulated, timestamp: new Date().toISOString() }];
      setMessages(finalMessages);
      persistChat(finalMessages);
    } catch {
      setErrored(true);
      setMessages(nextMessages);
      persistChat(nextMessages);
    } finally {
      setSending(false);
    }
  };

  const groupedHistory = groupChatsByDate(historyChats);

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
          gap: "8px",
          padding: "14px 16px",
          paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
          borderBottom: "1px solid var(--color-border-subtle)",
          flexShrink: 0,
        }}
      >
        {view === "chat" ? (
          <Pressable onClick={() => setView("history")} aria-label="Chat history" style={headerIconBtnStyle}>
            <FeatherIcon><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" /></FeatherIcon>
          </Pressable>
        ) : (
          <Pressable onClick={() => setView("chat")} aria-label="Back to chat" style={headerIconBtnStyle}>
            <FeatherIcon><polyline points="15 18 9 12 15 6" /></FeatherIcon>
          </Pressable>
        )}

        <span className="text-base" style={{ letterSpacing: "2px", textTransform: "uppercase", color: "var(--color-accent-primary)", fontWeight: "bold" }}>
          {view === "chat" ? "Ask Coach" : "Chat History"}
        </span>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <Pressable onClick={handleNewChat} aria-label="New chat" style={headerIconBtnStyle}>
            <FeatherIcon><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></FeatherIcon>
          </Pressable>
          <Pressable
            onClick={handleClose}
            aria-label="Close Ask Coach"
            style={{ ...headerIconBtnStyle, fontSize: "18px", lineHeight: 1 }}
          >×</Pressable>
        </div>
      </div>

      {view === "history" ? (
        <div className="fold-lift" data-fold={bodyFold ?? undefined} style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {historyLoading && <EmptyStateArt>Loading conversations…</EmptyStateArt>}
          {!historyLoading && groupedHistory.length === 0 && (
            <EmptyStateArt>No saved conversations yet — anything you ask Coach is saved here automatically.</EmptyStateArt>
          )}
          {groupedHistory.map((group) => (
            <div key={group.label} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div className="text-xs" style={{ letterSpacing: "2px", color: "var(--color-text-disabled)", textTransform: "uppercase" }}>
                {group.label}
              </div>
              {group.chats.map((chat) => (
                <div key={chat.id} style={{ display: "flex", gap: "8px", alignItems: "stretch" }}>
                  <Pressable
                    onClick={() => handleResumeChat(chat)}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      background: "var(--color-bg-surface)",
                      border: chat.id === activeChatIdRef.current ? "1px solid var(--color-border-accent)" : "1px solid var(--color-border-subtle)",
                      borderRadius: "14px",
                      padding: "12px 14px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                      <span className="text-base" style={{ color: "var(--color-text-primary)", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {chat.title || deriveTitle(chat.messages ?? [])}
                      </span>
                      <span className="text-xs" style={{ color: "var(--color-text-disabled)", flexShrink: 0 }}>
                        {relativeDateLabel(chat.createdAt)}
                      </span>
                    </div>
                    {chat.summary && (
                      <div className="text-sm" style={{ color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
                        {chat.summary}
                      </div>
                    )}
                  </Pressable>
                  <Pressable
                    onClick={(e) => handleDeleteChat(e, chat)}
                    aria-label="Delete conversation"
                    style={{
                      background: "var(--color-bg-raised)",
                      border: "1px solid var(--color-border-subtle)",
                      borderRadius: "12px",
                      width: "44px",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    <FeatherIcon size={14}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14H7L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></FeatherIcon>
                  </Pressable>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="fold-lift" data-fold={bodyFold ?? undefined} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {messages.length === 0 && (
              <EmptyStateArt>
                Ask me anything about how Authority Finance works — your setup, a metric, a panel, or how to log something.
              </EmptyStateArt>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  display: "flex",
                  alignItems: "flex-end",
                  gap: "8px",
                }}
              >
                {m.role !== "user" && (
                  <div style={{ position: "relative", flexShrink: 0, width: "26px", height: "26px" }}>
                    <img
                      src={coachAvatar}
                      alt="Coach"
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        objectFit: "cover",
                        background: "var(--color-bg-raised)",
                        border: "1px solid var(--color-border-subtle)",
                      }}
                    />
                    {/* Monocle badge — same glyph as the mobile nav Coach tab
                        (CoachMonocleIcon), marking this bubble as sent by Coach. */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "-2px",
                        right: "-2px",
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: "var(--color-bg-base)",
                        border: "1px solid var(--color-bg-base)",
                        color: "var(--color-teal)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <CoachMonocleIcon size={10} />
                    </div>
                  </div>
                )}
                <div
                  className="text-md" style={{
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
              ref={inputRef}
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
      )}
    </div>
  );
}
