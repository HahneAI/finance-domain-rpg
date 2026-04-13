import { useEffect, useRef, useState } from "react";

/**
 * Tracks whether the user is scrolling down inside a given scroll container.
 * Returns true when scrolling down and not at the very top; false otherwise.
 * Resets to false when scrollTop reaches 0.
 *
 * @param {React.RefObject} scrollRef — ref attached to the scrollable container
 * @returns {boolean} isScrollingDown
 */
export function useScrollDirection(scrollRef) {
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const el = scrollRef?.current;
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
  }, [scrollRef]);

  return isScrollingDown;
}
