import { describe, it, expect } from "vitest";
import {
  ASK_COACH_SONNET_AUDIENCE,
  COACH_SURFACES,
  MAX_SERVER_TOOL_ROUNDS,
  canUseSonnetOnAskCoach,
  chooseCoachModel,
  resolveCoachRequest,
  countTrailingToolRounds,
} from "../../lib/coachPolicy.js";

describe("chooseCoachModel — per-message routing (§2.L Phase 7)", () => {
  it("keeps status checks, lookups (even two-part) and mechanics questions on Haiku", () => {
    for (const q of ["How's my week looking?", "What's going on with my Groceries bill?", "How is Upkeep Health actually calculated?",
      "Why is my paycheck what it is this week? What actually came out of it?"]) {
      expect(chooseCoachModel(q, { privileged: true })).toBe("haiku");
    }
  });

  it("sends what-ifs, decisions, goal-setting and long messages to Sonnet for the rollout audience", () => {
    expect(chooseCoachModel("x".repeat(221), { privileged: true })).toBe("sonnet");
    for (const q of [
      "What if I dropped my phone bill to 20 a week?",
      "I can pick up 8 hours of overtime this week. Is it worth it?",
      "Could I afford another $3,000 goal?",
      "I want to start saving for something.",
      "I want to be the kind of person who could cover three months of rent.",
      "Did that missed shift push my first goal back? By how much?",
    ]) {
      expect(chooseCoachModel(q, { privileged: true })).toBe("sonnet");
    }
  });

  it("never routes to Sonnet outside the audience", () => {
    expect(chooseCoachModel("What if I cut Groceries?", { privileged: false, audience: "privileged" })).toBe("haiku");
    expect(chooseCoachModel("What if I cut Groceries?", { privileged: true, audience: "none" })).toBe("haiku");
    expect(chooseCoachModel("What if I cut Groceries?", { privileged: false, audience: "all" })).toBe("sonnet");
  });

  it("ships with Sonnet limited to privileged accounts", () => {
    expect(ASK_COACH_SONNET_AUDIENCE).toBe("privileged");
    expect(canUseSonnetOnAskCoach(false)).toBe(false);
    expect(canUseSonnetOnAskCoach(true)).toBe(true);
  });
});

describe("resolveCoachRequest — server-side surface gate", () => {
  it("gates Job Hunt and Résumé Review to privileged accounts", () => {
    expect(resolveCoachRequest({ surface: "job_hunt", model: "sonnet", privileged: false })).toMatchObject({ ok: false, status: 403 });
    expect(resolveCoachRequest({ surface: "resume_review", model: "sonnet", privileged: true })).toEqual({ ok: true, model: "sonnet" });
  });

  it("falls back to the surface's first model when a client asks for one it doesn't allow", () => {
    expect(resolveCoachRequest({ surface: "net_worth", model: "sonnet", privileged: true })).toEqual({ ok: true, model: "haiku" });
    expect(resolveCoachRequest({ surface: "ask_coach", model: "opus", privileged: true })).toEqual({ ok: true, model: "haiku" });
  });

  it("refuses Sonnet on Ask Coach for accounts outside the rollout audience", () => {
    expect(resolveCoachRequest({ surface: "ask_coach", model: "sonnet", privileged: false })).toEqual({ ok: true, model: "haiku" });
    expect(resolveCoachRequest({ surface: "ask_coach", model: "sonnet", privileged: true })).toEqual({ ok: true, model: "sonnet" });
  });

  it("rejects an unknown surface with 400", () => {
    expect(resolveCoachRequest({ surface: "jailbreak", model: "haiku", privileged: true })).toMatchObject({ ok: false, status: 400 });
  });

  it("keeps cached older clients (no surface) working, on Haiku unless privileged", () => {
    expect(resolveCoachRequest({ model: "sonnet", privileged: false })).toEqual({ ok: true, model: "haiku" });
    expect(resolveCoachRequest({ model: "sonnet", privileged: true })).toEqual({ ok: true, model: "sonnet" });
  });

  it("lists exactly the four live Coach surfaces", () => {
    expect(Object.keys(COACH_SURFACES).sort()).toEqual(["ask_coach", "job_hunt", "net_worth", "resume_review"]);
  });
});

describe("countTrailingToolRounds — server-side tool-round cap", () => {
  const toolUse = (id) => ({ role: "assistant", content: [{ type: "text", text: "…" }, { type: "tool_use", id, name: "get_goal_detail", input: { rank: 1 } }] });
  const toolResult = (id) => ({ role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "{}" }] });

  it("is 0 for a fresh user turn", () => {
    expect(countTrailingToolRounds([{ role: "user", content: "hi" }])).toBe(0);
  });

  it("counts tool rounds since the user last wrote, ignoring earlier exchanges", () => {
    const messages = [
      { role: "user", content: "first question" }, toolUse("a"), toolResult("a"), { role: "assistant", content: "answer" },
      { role: "user", content: "second question" }, toolUse("b"), toolResult("b"), toolUse("c"), toolResult("c"),
    ];
    expect(countTrailingToolRounds(messages)).toBe(2);
  });

  it("reaches the cap after MAX_SERVER_TOOL_ROUNDS rounds", () => {
    const messages = [{ role: "user", content: "q" }];
    for (let i = 0; i < MAX_SERVER_TOOL_ROUNDS; i++) messages.push(toolUse(`t${i}`), toolResult(`t${i}`));
    expect(countTrailingToolRounds(messages)).toBe(MAX_SERVER_TOOL_ROUNDS);
  });
});
