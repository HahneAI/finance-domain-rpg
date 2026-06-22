import { forwardRef, useImperativeHandle, useRef, useEffect } from "react";

// Five-step iOS Safari "Add to Home Screen" tutorial. Ported from the Authority
// OS marketing site (src/pages/products/finance.astro). Rendered once at the app
// root; both the hamburger drawer and the Account panel open this single instance
// via the imperative `open(triggerEl)` handle.
//
// Uses the native <dialog> element + showModal() so we get ESC-to-close, a focus
// trap, top-layer stacking, and a real backdrop for free. The click-to-open
// transform-origin math makes the dialog appear to pop out of the tapped button.

const STEPS = [
  {
    title: "The Three Dots",
    text: "Click the three dots button for the Safari menu.",
    img: "/pwa/ios-pwa-step-1.jpeg",
    alt: "Safari with the three-dots menu button highlighted at the bottom right",
  },
  {
    title: "Share",
    text: 'Click the "Share" option in the popup menu.',
    img: "/pwa/ios-pwa-step-2.jpeg",
    alt: "Safari menu with the Share option highlighted",
  },
  {
    title: "More Options",
    text: 'Click the "View More" circular button with the arrow-down icon at the bottom right.',
    img: "/pwa/ios-pwa-step-3.jpeg",
    alt: "Share sheet with the View More button highlighted at the bottom right",
  },
  {
    title: "Adding to Home",
    text: 'At the bottom of this final menu view, click the "Add to Home Screen" option.',
    img: "/pwa/ios-pwa-step-4.jpeg",
    alt: "Expanded share sheet with the Add to Home Screen option highlighted",
  },
  {
    title: "Name and Save",
    text: "Click the Add button. You can rename it first — keep it finance-themed for consistency.",
    img: "/pwa/ios-pwa-step-5.jpeg",
    alt: "Add to Home Screen confirmation with the Add button highlighted",
  },
];

export const PwaInstallModal = forwardRef(function PwaInstallModal(_props, ref) {
  const dialogRef = useRef(null);

  useImperativeHandle(ref, () => ({
    // triggerEl: the DOM element that was clicked. Its center becomes the
    // scale animation's transform-origin so the dialog "grows" out of it.
    open(triggerEl) {
      const dlg = dialogRef.current;
      if (!dlg) return;
      if (triggerEl && typeof triggerEl.getBoundingClientRect === "function") {
        const rect = triggerEl.getBoundingClientRect();
        const btnCx = rect.left + rect.width / 2;
        const btnCy = rect.top + rect.height / 2;
        const dialogWidth = Math.min(560, window.innerWidth - 16);
        const dialogLeft = (window.innerWidth - dialogWidth) / 2;
        const dialogTop = 20; // matches `inset: 1.25rem 0 auto 0`
        dlg.style.setProperty("--origin-x", `${btnCx - dialogLeft}px`);
        dlg.style.setProperty("--origin-y", `${btnCy - dialogTop}px`);
      }
      // Lock background scroll and hide the floating bottom-nav pill, matching
      // the rest of the app's modals. The native dialog inert-locks the
      // background, but iOS Safari can still scroll behind it.
      document.body.classList.add("modal-open");
      document.body.style.overflow = "hidden";
      dlg.showModal();
    },
    close() {
      dialogRef.current?.close();
    },
  }), []);

  // Release the scroll lock on any close path (ESC, close(), backdrop, Got it).
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return undefined;
    const onClose = () => {
      document.body.classList.remove("modal-open");
      document.body.style.overflow = "";
    };
    dlg.addEventListener("close", onClose);
    return () => dlg.removeEventListener("close", onClose);
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      id="pwa-install-dialog"
      className="pwa-dialog"
      aria-labelledby="pwa-dialog-title"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <style>{`
        .pwa-dialog {
          position: fixed;
          inset: 1.25rem 0 auto 0;
          margin: 0 auto;
          border: 1px solid var(--color-border-subtle);
          border-radius: 16px;
          background-color: var(--color-bg-surface);
          color: var(--color-text-primary);
          padding: 0;
          width: min(560px, calc(100vw - 1rem));
          max-height: calc(100dvh - 2.5rem);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
          overflow: hidden;
        }
        .pwa-dialog::backdrop {
          background-color: rgba(5, 5, 10, 0.7);
          backdrop-filter: blur(4px);
          animation: pwa-backdrop-in 0.28s ease-out;
        }
        .pwa-dialog[open] {
          animation: pwa-dialog-pop 0.36s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: var(--origin-x, 50%) var(--origin-y, 0);
        }
        @keyframes pwa-dialog-pop {
          from { opacity: 0; transform: scale(0.12); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes pwa-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .pwa-dialog-inner {
          max-height: calc(100dvh - 2rem);
          overflow-y: auto;
          padding: 1.75rem;
        }
        .pwa-dialog-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .pwa-eyebrow {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--color-accent-primary);
          margin: 0 0 0.5rem;
        }
        .pwa-dialog-title {
          font-size: 1.375rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.25;
          color: var(--color-text-primary);
          margin: 0;
        }
        .pwa-dialog-sub {
          font-size: 0.9375rem;
          color: var(--color-text-secondary);
          margin: 0.5rem 0 0;
          line-height: 1.55;
        }
        .pwa-close {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: transparent;
          border: 1px solid var(--color-border-subtle);
          color: var(--color-text-secondary);
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background-color 0.15s;
        }
        .pwa-close:hover {
          color: var(--color-text-primary);
          border-color: var(--color-border-accent);
          background-color: rgba(0, 200, 150, 0.06);
        }
        .pwa-steps {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .pwa-step {
          border: 1px solid var(--color-border-subtle);
          border-radius: 12px;
          background-color: var(--color-bg-base);
          padding: 1rem;
        }
        .pwa-step-copy {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 0.875rem;
        }
        .pwa-step-num {
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 999px;
          background-color: rgba(0, 200, 150, 0.12);
          color: var(--color-accent-primary);
          font-size: 0.8125rem;
          font-weight: 700;
          border: 1px solid var(--color-border-accent);
        }
        .pwa-step-title {
          font-size: 0.9375rem;
          font-weight: 600;
          color: var(--color-text-primary);
          margin: 0 0 0.25rem;
          line-height: 1.3;
        }
        .pwa-step-text {
          font-size: 0.875rem;
          color: var(--color-text-secondary);
          margin: 0;
          line-height: 1.55;
        }
        .pwa-step-img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 8px;
          border: 1px solid var(--color-border-subtle);
          background-color: var(--color-bg-base);
        }
        .pwa-dialog-footer {
          position: sticky;
          bottom: -1.75rem;
          margin: 1.5rem -1.75rem -1.75rem;
          padding: 1rem 1.75rem;
          background: linear-gradient(180deg, rgba(17, 44, 31, 0.85) 0%, var(--color-bg-surface) 60%);
          border-top: 1px solid var(--color-border-subtle);
          backdrop-filter: blur(6px);
        }
        .pwa-got-it {
          width: 100%;
          padding: 0.75rem 1.625rem;
          border-radius: 10px;
          border: none;
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          background-color: var(--color-accent-primary);
          color: var(--color-bg-base);
          box-shadow: 0 4px 16px rgba(0, 200, 150, 0.3);
          transition: background-color 0.2s, transform 0.15s, box-shadow 0.2s;
        }
        .pwa-got-it:hover {
          background-color: #00b386;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(0, 200, 150, 0.45);
        }
      `}</style>

      <div className="pwa-dialog-inner">
        <header className="pwa-dialog-header">
          <div>
            <p className="pwa-eyebrow">iOS Install · Safari</p>
            <h2 id="pwa-dialog-title" className="pwa-dialog-title">Install A:Fin on your home screen</h2>
            <p className="pwa-dialog-sub">Five quick steps. Once installed, A:Fin opens like a native app.</p>
          </div>
          <button type="button" className="pwa-close" onClick={close} aria-label="Close install instructions">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <ol className="pwa-steps">
          {STEPS.map((step, i) => (
            <li className="pwa-step" key={i}>
              <div className="pwa-step-copy">
                <span className="pwa-step-num">{i + 1}</span>
                <div>
                  <h3 className="pwa-step-title">{step.title}</h3>
                  <p className="pwa-step-text">{step.text}</p>
                </div>
              </div>
              <img src={step.img} alt={step.alt} loading="lazy" className="pwa-step-img" />
            </li>
          ))}
        </ol>

        <footer className="pwa-dialog-footer">
          <button type="button" className="pwa-got-it" onClick={close}>Got it</button>
        </footer>
      </div>
    </dialog>
  );
});
