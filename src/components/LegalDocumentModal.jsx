import { createPortal } from "react-dom";
import { Pressable, useFoldTransition } from "./ui.jsx";
import { ChangelogBody } from "./ChangelogModal.jsx";

// Renders a Terms of Service / Privacy Policy document (or any other legal
// markdown text) in the same portal + fold-motion modal shape as
// ChangelogModal — reuses ChangelogBody's token-styled markdown renderers
// rather than a second copy, so legal copy and changelog copy render with
// the same typographic treatment. Opened from LoginScreen's consent
// checkbox links and (once ENFORCE_EXISTING_USER_RECONSENT is live) the
// re-consent gate in App.jsx.
export function LegalDocumentModal({ open, title, markdown, onClose }) {
  const fold = useFoldTransition(open, { ms: 340 });
  if (!fold.mounted) return null;

  return createPortal(
    <div className="fold-backdrop" data-fold={fold.fold} style={{ position: "fixed", inset: 0, zIndex: 260, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="fold-modal" data-fold={fold.fold} style={{ width: "100%", maxWidth: "480px", maxHeight: "80vh", overflowY: "auto", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "16px", padding: "22px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ fontSize: "17px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "0.02em", lineHeight: 1.15 }}>
          {title}
        </div>
        <ChangelogBody markdown={markdown} />
        <Pressable
          onClick={onClose}
          className="text-xs" style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "10px 0", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer", marginTop: "4px" }}
        >
          Close
        </Pressable>
      </div>
    </div>,
    document.body,
  );
}
