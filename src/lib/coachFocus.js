// Scroll-to-and-highlight for Coach's navigate_to chip (src/lib/coachTools.js).
//
// Deliberately generic rather than per-panel: a panel opts in by putting a
// `data-coach-ref` attribute on the row it wants reachable, and nothing else.
// The alternative — a focus prop threaded into each of the five panels and
// handled separately — would put five copies of the same scroll/highlight
// behaviour in five 1500+ line files.
//
// Refs are the canonical strings toolNavigateTo() builds after validating the
// target against real account data: "expense:<label>" and "goal:<rank>".
//
// Failing to find the node is a NORMAL outcome, not an error: the row may be
// inside a collapsed category, filtered out of the current view, or simply not
// rendered yet. The chip's job is to open the right panel; the highlight is a
// bonus on top of that, so a miss stays silent.

const HIGHLIGHT_CLASS = "coach-focus";
// Matches the .coach-focus animation in index.css. Kept in sync by hand — the
// class is removed after this so a second visit re-triggers the animation
// rather than finding the class already applied and doing nothing.
const HIGHLIGHT_MS = 1600;

/**
 * Waits briefly for the target to exist, then scrolls it into view and flashes
 * it. Panels mount and lay out over a few frames after navigation, so a single
 * synchronous query right after the view switches usually misses.
 */
export function focusCoachTarget(ref, { attempts = 12, intervalMs = 60, doc = globalThis.document } = {}) {
  if (!ref || !doc) return () => {};

  let tries = 0;
  let timer = null;
  let cleanupTimer = null;

  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(ref) : ref.replace(/"/g, '\\"');

  const tick = () => {
    const node = doc.querySelector(`[data-coach-ref="${escaped}"]`);
    if (node) {
      node.scrollIntoView?.({ block: "center", behavior: "smooth" });
      node.classList?.add(HIGHLIGHT_CLASS);
      cleanupTimer = setTimeout(() => node.classList?.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
      return;
    }
    if (++tries < attempts) timer = setTimeout(tick, intervalMs);
  };
  tick();

  // Returned so a caller unmounting mid-search can stop it; without this a
  // pending timer would query a document the panel has already left.
  return () => {
    if (timer) clearTimeout(timer);
    if (cleanupTimer) clearTimeout(cleanupTimer);
  };
}

/** Human label for a ref, for a chip rendered without the tool's own linkLabel. */
export function describeCoachRef(ref) {
  if (typeof ref !== "string") return null;
  const [kind, ...rest] = ref.split(":");
  const value = rest.join(":");
  if (kind === "expense") return value;
  if (kind === "goal") return `Goal ${value}`;
  return null;
}
