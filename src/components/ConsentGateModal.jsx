import { useState } from "react";
import { createPortal } from "react-dom";
import { Pressable } from "./ui.jsx";
import { LegalDocumentModal } from "./LegalDocumentModal.jsx";
import { TERMS_OF_SERVICE_MARKDOWN, PRIVACY_POLICY_MARKDOWN } from "../constants/legalDocuments.js";

// Non-dismissible re-consent interstitial for EXISTING accounts whose latest
// consent_records row (if any) doesn't match CURRENT_LEGAL_VERSION — only
// ever rendered when constants/legalDocuments.js's
// ENFORCE_EXISTING_USER_RECONSENT is true (App.jsx owns that gate; this
// component has no opinion on when it should show, only how). Unlike
// LegalDocumentModal (dismissible, read-only), there's no backdrop-click or
// ✕ close here — Agree or Sign Out are the only two ways out, same "give a
// real exit, never trap the user" posture ProfilePanel's delete-confirm
// dialog already follows.
export function ConsentGateModal({ open, onAgree, onSignOut, agreeLoading = false }) {
  const [agreed, setAgreed] = useState(false);
  const [legalModalDoc, setLegalModalDoc] = useState(null); // null | "terms" | "privacy"

  if (!open) return null;

  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 280, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
        <div style={{ width: "100%", maxWidth: "440px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
              Updated Terms
            </div>
            <div style={{ fontSize: "18px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "0.02em", lineHeight: 1.15 }}>
              Please review and re-accept
            </div>
          </div>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-primary)", lineHeight: 1.6 }}>
            Our Terms of Service and Privacy Policy have changed since you last agreed to them.
            Please review and accept the current versions to keep using Authority Finance.
          </p>
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: "2px", width: "16px", height: "16px", accentColor: "var(--color-teal)", cursor: "pointer", flexShrink: 0 }}
            />
            <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.6" }}>
              I have read and agree to the{" "}
              <button type="button" onClick={() => setLegalModalDoc("terms")} style={linkStyle}>Terms of Service</button>
              {" "}and{" "}
              <button type="button" onClick={() => setLegalModalDoc("privacy")} style={linkStyle}>Privacy Policy</button>.
            </span>
          </label>
          <Pressable
            onClick={onAgree}
            disabled={!agreed || agreeLoading}
            style={{ background: "var(--color-teal)", color: "var(--color-bg-base)", border: "none", borderRadius: "12px", padding: "11px 0", fontSize: "10px", letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", opacity: !agreed ? 0.5 : 1 }}
          >
            {agreeLoading ? "..." : "Agree and Continue"}
          </Pressable>
          <button type="button" onClick={onSignOut} style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", fontSize: "11px", cursor: "pointer", textDecoration: "underline", alignSelf: "center" }}>
            Sign out instead
          </button>
        </div>
      </div>
      <LegalDocumentModal
        open={legalModalDoc === "terms"}
        title="Terms of Service"
        markdown={TERMS_OF_SERVICE_MARKDOWN}
        onClose={() => setLegalModalDoc(null)}
      />
      <LegalDocumentModal
        open={legalModalDoc === "privacy"}
        title="Privacy Policy"
        markdown={PRIVACY_POLICY_MARKDOWN}
        onClose={() => setLegalModalDoc(null)}
      />
    </>,
    document.body,
  );
}

const linkStyle = {
  background: "transparent", border: "none",
  color: "var(--color-teal)", fontSize: "12px",
  cursor: "pointer", padding: 0, textDecoration: "underline",
};
