import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether the user is scrolling down inside a given scroll container.
 * Returns true when scrolling down and not at the very top; false otherwise.
 *
 * Accepts the DOM element directly (not a ref object) so the effect re-runs
 * correctly when the element mounts after an auth/loading gate.
 *
 * @param {HTMLElement|null} el — the scrollable container element
 * @returns {boolean} isScrollingDown
 */
export function useScrollDirection(el) {
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (!el) return;

    const handleScroll = () => {
      const current = el.scrollTop;
      if (current <= 0) {
        setIsScrollingDown(false);
      } else if (current > lastScrollY.current) {
        setIsScrollingDown(true);
      } else {
        setIsScrollingDown(false);
      }
      lastScrollY.current = current;
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [el]); // re-runs when el changes: null → div (after auth gate resolves)

  return isScrollingDown;
}
