import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { Pressable, useFoldTransition } from "./ui.jsx";

// Markdown → React element renderers, styled with Flow's own tokens instead of
// react-markdown's unstyled default HTML — keeps admin-authored changelog copy
// visually consistent with the rest of the app rather than looking like a
// dropped-in web page. No rehype-raw plugin is used anywhere in this file, so
// raw HTML in an entry's body is never rendered — admin-authored markdown is
// still untrusted-enough content to keep that door shut.
const MARKDOWN_COMPONENTS = {
  p:  ({ children }) => <p className="text-base" style={{ color: "var(--color-text-primary)", lineHeight: 1.7, margin: "0 0 12px" }}>{children}</p>,
  strong: ({ children }) => <strong style={{ color: "var(--color-teal)", fontWeight: 700 }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: "var(--color-text-primary)" }}>{children}</em>,
  ul: ({ children }) => <ul style={{ margin: "0 0 12px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "0 0 12px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>{children}</ol>,
  li: ({ children }) => <li className="text-base" style={{ color: "var(--color-text-primary)", lineHeight: 1.6 }}>{children}</li>,
  h1: ({ children }) => <div className="text-base" style={{ fontWeight: 700, color: "var(--color-text-primary)", marginTop: "16px", marginBottom: "8px" }}>{children}</div>,
  h2: ({ children }) => <div className="text-xs" style={{ letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-teal)", marginTop: "16px", marginBottom: "6px" }}>{children}</div>,
  h3: ({ children }) => <div className="text-xs" style={{ letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginTop: "14px", marginBottom: "6px" }}>{children}</div>,
  a:  ({ children, href }) => <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--color-teal)" }}>{children}</a>,
  code: ({ children }) => <code className="text-sm" style={{ fontFamily: "var(--font-mono)", background: "var(--color-bg-raised)", padding: "1px 5px", borderRadius: "4px", }}>{children}</code>,
  blockquote: ({ children }) => <blockquote style={{ margin: "0 0 12px", borderLeft: "2px solid var(--color-border-accent)", paddingLeft: "12px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>{children}</blockquote>,
  hr: () => <div style={{ height: "1px", background: "var(--color-border-subtle)", margin: "14px 0" }} />,
};

export function ChangelogBody({ markdown }) {
  return (
    <div>
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
    </div>
  );
}

// Paired with UpdateAvailableBanner's "What's New" tap target (App.jsx). Same
// portal + fold-motion shape as ProfilePanel's AccountDetail delete-confirm
// dialog — position:fixed must portal to document.body or iOS Safari hit-tests
// against the wrong scroll container and the buttons go dead.
export function ChangelogModal({ open, entry, onClose }) {
  const fold = useFoldTransition(open, { ms: 340 });
  if (!fold.mounted || !entry) return null;

  const publishedLabel = entry.published_at
    ? new Date(entry.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return createPortal(
    <div className="fold-backdrop" data-fold={fold.fold} style={{ position: "fixed", inset: 0, zIndex: 240, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div className="fold-modal" data-fold={fold.fold} style={{ width: "100%", maxWidth: "460px", maxHeight: "80vh", overflowY: "auto", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "16px", padding: "22px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <div className="text-2xs" style={{ letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
            What's New{entry.version_label ? ` · ${entry.version_label}` : ""}
          </div>
          <div style={{ fontSize: "20px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "0.02em", lineHeight: 1.15 }}>
            {entry.title}
          </div>
          {publishedLabel && (
            <div className="text-xs" style={{ color: "var(--color-text-secondary)", marginTop: "6px" }}>{publishedLabel}</div>
          )}
        </div>

        <ChangelogBody markdown={entry.body} />

        <Pressable
          onClick={onClose}
          className="text-xs" style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "10px 0", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer", marginTop: "4px" }}
        >
          Got it
        </Pressable>
      </div>
    </div>,
    document.body,
  );
}
