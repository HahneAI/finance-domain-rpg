// Pure logic behind the archetype picker (TODO §31). No React, no I/O — the
// picker, App's handleApplyArchetype, and the tests all lean on these.
import { getArchetype, templateKeyFor } from "../constants/goalArchetypes.js";
import { buildGoal } from "./goalFunding.js";

const round50 = (n) => Math.round(n / 50) * 50;

/**
 * Resolve a template's targetRule to dollars. `weeksOfSpend` reads the same
 * `avgWeeklySpend` HomePanel shows (remainingSpend.avgWeeklySpend) — never a
 * second spend estimate (warden §12 parallel-formula rule).
 */
export function resolveTargetRule(rule, { avgWeeklySpend = 0 } = {}) {
  if (!rule) return 0;
  if (rule.kind === "weeksOfSpend") {
    const spend = Number.isFinite(avgWeeklySpend) && avgWeeklySpend > 0 ? avgWeeklySpend : 0;
    return Math.max(rule.floor ?? 0, round50(rule.weeks * spend));
  }
  return Number(rule.amount) || 0;
}

/**
 * The goals an archetype would seed for this user, minus any template they
 * already hold (matched on templateKey, or on a case-insensitive label so a
 * hand-made "Emergency Fund" is not duplicated).
 */
export function resolveTemplateGoals(archetypeOrId, { avgWeeklySpend = 0, existingGoals = [] } = {}) {
  const archetype = typeof archetypeOrId === "string" ? getArchetype(archetypeOrId) : archetypeOrId;
  if (!archetype) return [];
  const haveKeys = new Set(existingGoals.map((g) => g.templateKey).filter(Boolean));
  const haveLabels = new Set(existingGoals.map((g) => (g.label ?? "").trim().toLowerCase()));
  return archetype.goals
    .map((g) => ({
      templateKey: templateKeyFor(archetype.id, g.key),
      label: g.label,
      note: g.note,
      target: resolveTargetRule(g.targetRule, { avgWeeklySpend }),
    }))
    .filter((g) => !haveKeys.has(g.templateKey) && !haveLabels.has(g.label.trim().toLowerCase()));
}

/**
 * True when a finish date is more than `months` past today — the picker flags
 * these "stretch" instead of hiding them. Accepts the Date from
 * resolveGoalFinishInfo(); anything non-Date is not a stretch (no date to judge).
 */
export function isStretchDate(finishDate, todayIso, months = 12) {
  if (!(finishDate instanceof Date) || Number.isNaN(finishDate.getTime())) return false;
  const limit = new Date(`${todayIso}T00:00:00`);
  limit.setMonth(limit.getMonth() + months);
  return finishDate > limit;
}

/**
 * Build the next `goals` + `config` for a confirmed pick. `selected` is the
 * (possibly user-edited) list from the picker: { templateKey, label, note,
 * target }. New goals append LAST — the same rank a hand-added goal lands at,
 * and the rank the picker's Claim Date preview assumed. Goals with a
 * non-positive target are dropped (a cleared field must not seed a $0 goal).
 */
export function applyArchetype({ archetypeId, selected = [], goals = [], config = {}, now = new Date() }) {
  const valid = selected.filter((g) => g?.label && Number(g.target) > 0);
  const added = valid.map((g, i) => buildGoal({ label: g.label, target: g.target, note: g.note, templateKey: g.templateKey, seq: i }));
  return {
    goals: [...goals, ...added],
    // suggestions carry across a switch: accepted/dismissed state is keyed by templateKey
    // (archetype-prefixed), so switching back never re-offers what was already decided.
    config: { ...config, identity: { archetypeId, chosenAt: now.toISOString(), ...(config.identity?.suggestions ? { suggestions: config.identity.suggestions } : {}) } },
    addedCount: added.length,
  };
}

/**
 * Lifestyle bills the current identity OFFERS (TODO §31 Phase 2). Pure read: never
 * touches `expenses`. A suggestion is pending until the user accepts or dismisses
 * it (config.identity.suggestions[templateKey]); it is also withheld when a bill
 * with the same label already exists, so it never duplicates something the user
 * entered by hand. Pending suggestions are deliberately NOT bills: they enter no
 * total, runway, Claim Date or Coach context (warden F182).
 */
export function pendingBillSuggestions({ config, expenses = [] } = {}) {
  const identity = config?.identity;
  const archetype = identity ? getArchetype(identity.archetypeId) : null;
  if (!archetype?.suggestedBills?.length) return [];
  const resolved = identity.suggestions ?? {};
  const haveLabels = new Set((expenses ?? []).map((e) => (e?.label ?? "").trim().toLowerCase()));
  return archetype.suggestedBills
    .map((b) => ({ templateKey: templateKeyFor(archetype.id, b.key), label: b.label, amount: b.amount, cycle: b.cycle, category: "Lifestyle" }))
    .filter((b) => !resolved[b.templateKey] && !haveLabels.has(b.label.toLowerCase()));
}

/** config with one suggestion resolved ("accepted" | "dismissed"). Pure. */
export function markSuggestion(config, templateKey, state) {
  return { ...config, identity: { ...config.identity, suggestions: { ...(config.identity?.suggestions ?? {}), [templateKey]: state } } };
}
