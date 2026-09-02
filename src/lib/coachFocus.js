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
// Long enough to still be running once the smooth scroll and the settle passes
// above have finished — a shorter flash expired before the row was on screen.
const HIGHLIGHT_MS = 2600;

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

  // Verification passes after the first scroll. App.jsx's navigateDirect ends
  // in jumpToPanelTop(), which scrolls the new panel to the top inside a
  // requestAnimationFrame — i.e. AFTER this runs. Live testing caught exactly
  // that race: the class was applied and scrollIntoView called, but the panel
  // then scrolled back to top and the highlight expired off-screen, 877px down
  // an 844px viewport. Scrolling once is not enough; the position has to be
  // re-asserted until it sticks.
  const verifyTimers = [];
  const settle = (node) => {
    for (const delay of [180, 420, 700]) {
      verifyTimers.push(setTimeout(() => {
        const r = node.getBoundingClientRect?.();
        if (!r) return;
        const h = (globalThis.innerHeight || doc.documentElement?.clientHeight || 0);
        // Re-scroll only if it actually drifted out of view, so a user who has
        // deliberately scrolled away isn't yanked back repeatedly.
        if (r.bottom > h || r.top < 0) node.scrollIntoView?.({ block: "center", behavior: "smooth" });
      }, delay));
    }
  };

  // A row inside a collapsed container is laid out and reports a real
  // bounding box, but its parent is height:0 with overflow:hidden, so the user
  // sees nothing. Live testing hit exactly this: Budget's categories are
  // collapsed by DEFAULT, so the highlight was firing on a clipped row every
  // time and the deep link's whole point was lost. Opening the category first
  // is what makes the target actually reachable.
  const isClipped = (node) => {
    let n = node.parentElement;
    while (n && n !== doc.body) {
      const style = globalThis.getComputedStyle?.(n);
      if (style && (style.overflow === "hidden" || style.overflowY === "hidden")
        && n.getBoundingClientRect().height < 4) return true;
      n = n.parentElement;
    }
    return false;
  };

  const revealIfClipped = (node) => {
    if (!isClipped(node)) return false;
    // Walk up for the NEAREST ancestor holding a collapsed expander. The
    // expander is not necessarily a child of the element doing the clipping —
    // in BudgetPanel it sits two levels above it — so keying off the clipper's
    // immediate parent finds nothing. Nearest-ancestor-first also guarantees
    // the category actually containing this row, rather than a sibling
    // category's toggle further up the list.
    let a = node.parentElement;
    while (a && a !== doc.body) {
      const toggle = a.querySelector?.("[data-coach-expand]");
      if (toggle && toggle.getAttribute("aria-expanded") === "false") {
        toggle.click?.();
        return true;
      }
      a = a.parentElement;
    }
    return false;
  };

  const tick = () => {
    const node = doc.querySelector(`[data-coach-ref="${escaped}"]`);
    if (node) {
      // Expanding changes layout, so scroll on the next tick rather than to a
      // position that is about to move.
      if (revealIfClipped(node)) {
        verifyTimers.push(setTimeout(() => {
          node.scrollIntoView?.({ block: "center", behavior: "smooth" });
          node.classList?.add(HIGHLIGHT_CLASS);
          settle(node);
          cleanupTimer = setTimeout(() => node.classList?.remove(HIGHLIGHT_CLASS), HIGHLIGHT_MS);
        }, 260));
        return;
      }
      node.scrollIntoView?.({ block: "center", behavior: "smooth" });
      node.classList?.add(HIGHLIGHT_CLASS);
      settle(node);
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
    for (const t of verifyTimers) clearTimeout(t);
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
