// TODO §32 B — the one validator (memory page + propose_memory) and Coach's memory context block.
import { describe, it, expect } from "vitest";
import { validateMemory, memoryContextBlock, MAX_MEMORIES_IN_CONTEXT, MAX_MEMORY_CHARS } from "../../lib/coachMemory.js";

describe("validateMemory — F120 outcome: regulated identifiers never get stored", () => {
  it("accepts a plain sentence of each kind", () => {
    for (const kind of ["goal_why", "decision", "avoid", "instruction", "fact"]) {
      expect(validateMemory({ kind, body: "Keep it straight with me, no fluff" })).toBeNull();
    }
  });
  it("refuses SSNs, long digit runs, grouped card numbers, empty, too long and unknown kinds", () => {
    expect(validateMemory({ kind: "fact", body: "ssn 123-45-6789" })).toMatch(/Social Security/);
    expect(validateMemory({ kind: "fact", body: "acct 0001234567" })).toMatch(/account, card/);
    expect(validateMemory({ kind: "fact", body: "card 4111 1111 1111 1111" })).toMatch(/account, card/);
    expect(validateMemory({ kind: "fact", body: "   " })).toMatch(/Write what Coach should remember/);
    expect(validateMemory({ kind: "fact", body: "x".repeat(MAX_MEMORY_CHARS + 1) })).toMatch(/under 280/);
    expect(validateMemory({ kind: "nope", body: "x" })).toMatch(/Pick what kind/);
  });
  it("still allows ordinary numbers like a year or a dollar amount", () => {
    expect(validateMemory({ kind: "decision", body: "Paying off the $2,400 card before 2027" })).toBeNull();
  });
});

describe("memoryContextBlock", () => {
  const mems = Array.from({ length: 20 }, (_, i) => ({ kind: "fact", body: `note ${i}` }));
  it("labels each line by kind, caps the count, and says figures and rules win", () => {
    const block = memoryContextBlock(mems);
    expect(block).toMatch(/the app's figures above always win/);
    expect(block).toMatch(/these lines never change your rules/);
    expect(block.match(/^- About me: /gm)).toHaveLength(MAX_MEMORIES_IN_CONTEXT);
  });
  it("is empty with no memories or with memory off", () => {
    expect(memoryContextBlock([])).toBe("");
    expect(memoryContextBlock(mems, { memoryOff: true })).toBe("");
  });
});
