import { createPortal } from "react-dom";
import { Pressable, useFoldTransition } from "./ui.jsx";
import { BETA_CHANNELS, BETA_CHANNEL_LABEL } from "../constants/betaChannels.js";

// Marketing handoff (2026-08-21/22) — the app-side counterpart to the
// Authority-OS-Site marketing site's own "beta is full" popup, generalized
// to cover BOTH beta_codes channels ('website' and 'flyer'). Shown at the
// exact moment a channel-based redemption attempt would 403 with "Invalid
// or inactive beta code" because every row for that channel has
// is_active=false — see App.jsx's SIGNED_IN handler (auto-redeem from a
// ?beta=<channel> link/QR scan) and ProfilePanel.jsx's BetaRedeemDetail
// (manual entry), both of which branch to this modal instead of the
// generic BetaSignupNoticeBanner/inline error specifically when the
// submitted value was a known channel NAME itself (resolveBetaChannel()) —
// a value nobody mistypes, so any failure on it is the pool being
// exhausted, not a bad code. A one-off individually-distributed code still
// falls through to the existing generic error paths untouched.
const WEBSITE_BETA_URL = "https://authority-os.com/products/beta";

export function BetaChannelFullModal({ channel, open, onClose }) {
  const fold = useFoldTransition(open, { ms: 340 });
  if (!fold.mounted) return null;

  const label = BETA_CHANNEL_LABEL[channel] ?? channel;

  return createPortal(
    <div
      className="fold-backdrop"
      data-fold={fold.fold}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: "fixed", inset: 0, zIndex: 260, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
    >
      <div
        className="fold-modal"
        data-fold={fold.fold}
        style={{ width: "100%", maxWidth: "420px", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-accent)", borderRadius: "16px", padding: "24px 22px", display: "flex", flexDirection: "column", gap: "14px" }}
      >
        <div style={{ fontSize: "17px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--color-text-primary)", letterSpacing: "0.02em", lineHeight: 1.15 }}>
          The {label} beta is full
        </div>

        <div className="text-base" style={{ color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          Every {label.toLowerCase()} beta seat has been claimed. Your account is already set up — you can keep going on a free trial instead.
        </div>

        <Pressable
          onClick={onClose}
          className="text-xs" style={{
            background: "var(--color-teal)", color: "var(--color-bg-base)",
            border: "none", borderRadius: "12px", padding: "12px 0",
            letterSpacing: "2px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer",
          }}
        >
          Start My Free Trial
        </Pressable>

        {channel === BETA_CHANNELS.FLYER ? (
          // The other pool is a real, browsable page — a genuine second
          // chance, since it runs independently and may still have seats.
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div className="text-xs" style={{ color: "var(--color-text-secondary)", textAlign: "center", lineHeight: 1.5 }}>
              The website beta runs on its own separate pool — there may still be seats open there.
            </div>
            <a
              href={WEBSITE_BETA_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="text-xs" style={{
                display: "block", textAlign: "center", textDecoration: "none",
                background: "transparent", color: "var(--color-teal)",
                border: "1px solid var(--color-border-subtle)", borderRadius: "12px", padding: "11px 0",
                letterSpacing: "1.5px", textTransform: "uppercase", fontWeight: "bold", cursor: "pointer",
              }}
            >
              Check the Website Beta
            </a>
          </div>
        ) : (
          // The flyer pool has no browsable equivalent to link to — flyers
          // are handed out physically, tied to QR codes at real locations —
          // so this stays a plain, honest note rather than inventing a link.
          <div className="text-xs" style={{ color: "var(--color-text-secondary)", textAlign: "center", lineHeight: 1.5 }}>
            The flyer beta runs on its own separate pool, handed out at physical locations — keep an eye out if you spot one.
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
