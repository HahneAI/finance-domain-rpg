// useSwipeStack(count) → { containerRef, activeIndex }
// Attaches an IntersectionObserver to each snap child.
// Reports the most-visible child index as activeIndex (integer, 0-based).
// Uses threshold: 0.6 so partial-visibility doesn't fire false positives.

import { useRef, useState, useEffect } from "react";

export function useSwipeStack(count) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || count === 0) return;
    // Guard: IntersectionObserver unavailable in some test/SSR environments
    if (typeof IntersectionObserver === "undefined") return;

    const children = Array.from(container.children);
    const obs = new IntersectionObserver(
      (entries) => {
        let best = { ratio: 0, idx: 0 };
        entries.forEach((entry) => {
          const idx = children.indexOf(entry.target);
          if (idx !== -1 && entry.intersectionRatio > best.ratio) {
            best = { ratio: entry.intersectionRatio, idx };
          }
        });
        if (best.ratio > 0) setActiveIndex(best.idx);
      },
      { root: container, threshold: [0.6] }
    );
    children.forEach((child) => obs.observe(child));
    return () => obs.disconnect();
  }, [count]);

  return { containerRef, activeIndex };
}
