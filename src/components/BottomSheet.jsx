import { useEffect, useRef } from "react";

/**
 * BottomSheet — slides up from the bottom like a native iOS action sheet.
 *
 * Props:
 *   open      {boolean}   controls visibility
 *   onClose   {function}  called when the sheet should close
 *   title     {string}    optional header label (uppercase monospace)
 *   children  {ReactNode} content rendered inside scrollable area
 *
 * Touch behaviour:
 *   - Drag handle (36×4px pill) accepts touchstart/touchmove/touchend.
 *   - Dragging down follows your finger in real time (no transition during drag).
 *   - Release > 80px down → dismiss (runs close animation then calls onClose).
 *   - Release ≤ 80px → spring back to translateY(0) with 280ms ease.
 */
export function BottomSheet({ open, onClose, title, children }) {
  const sheetRef = useRef(null);
  const backdropRef = useRef(null);
  const dragStartY = useRef(0);
  const currentDrag = useRef(0);
  const isDragging = useRef(false);

  // Sync open/close via direct DOM manipulation to avoid layout jank.
  useEffect(() => {
    const el = sheetRef.current;
    const bd = backdropRef.current;
    if (!el || !bd) return;

    if (open) {
      // Force a reflow so the transition plays from translateY(100%) → translateY(0).
      el.style.transition = "none";
      el.style.transform = "translateY(100%)";
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.offsetHeight; // trigger reflow
      el.style.transition = "transform 280ms ease";
      el.style.transform = "translateY(0)";

      bd.style.pointerEvents = "auto";
      bd.style.opacity = "1";
    } else {
      el.style.transition = "transform 280ms ease";
      el.style.transform = "translateY(100%)";
      bd.style.opacity = "0";
      bd.style.pointerEvents = "none";
    }
  }, [open]);

  // Body scroll lock — prevents background from scrolling while sheet is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // ── Drag-to-dismiss handlers (on the drag handle only) ──────────────────────
  const handleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
    currentDrag.current = 0;
    isDragging.current = true;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    const delta = Math.max(0, e.touches[0].clientY - dragStartY.current);
    currentDrag.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;

    if (currentDrag.current > 80) {
      // Dismiss
      sheetRef.current.style.transition = "transform 280ms ease";
      sheetRef.current.style.transform = "translateY(100%)";
      if (backdropRef.current) {
        backdropRef.current.style.opacity = "0";
        backdropRef.current.style.pointerEvents = "none";
      }
      setTimeout(onClose, 280);
    } else {
      // Spring back
      sheetRef.current.style.transition = "transform 280ms ease";
      sheetRef.current.style.transform = "translateY(0)";
    }
    currentDrag.current = 0;
  };

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 199,
          opacity: 0,
          transition: "opacity 280ms ease",
          pointerEvents: "none",
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 200,
          background: "#1a1a1a",
          borderRadius: "16px 16px 0 0",
          borderTop: "1px solid #2e2e2e",
          maxHeight: "90dvh",
          display: "flex",
          flexDirection: "column",
          transform: "translateY(100%)",
          willChange: "transform",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {/* Drag handle — touch target that triggers drag-to-dismiss */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            padding: "14px 0 10px",
            flexShrink: 0,
            cursor: "grab",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "2px",
              background: "#3a3a3a",
              margin: "0 auto",
            }}
          />
        </div>

        {/* Header row */}
        {title && (
          <div
            style={{
              padding: "0 20px 12px",
              borderBottom: "1px solid #222",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "3px",
                textTransform: "uppercase",
                color: "#c8a84b",
                fontFamily: "'Courier New',monospace",
              }}
            >
              {title}
            </div>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#555",
                cursor: "pointer",
                fontSize: "16px",
                lineHeight: 1,
                fontFamily: "'Courier New',monospace",
                minWidth: "44px",
                minHeight: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable content area */}
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            padding: "16px 20px 24px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
