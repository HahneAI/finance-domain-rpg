// Shared with App.jsx (which captures ?beta=<value> into localStorage and
// consumes it on SIGNED_IN via redeemBetaCode) and LoginScreen.jsx (which
// reads it read-only to show the marketing site's beta-seat-scarcity message
// before the visitor even creates an account). Single source of truth for
// the storage key + parse shape so the two never drift.
export const PENDING_BETA_CODE_STORAGE_KEY = "pendingBetaCode";
export const MAX_PENDING_BETA_CODE_ATTEMPTS = 5;

// Stored as JSON `{ code, attempts }` (see App.jsx's capture effect for why:
// a retryable redemption failure needs to survive to the next sign-in).
// Also accepts the old plain-string format for anyone with a pre-hardening
// value already sitting in localStorage.
export function parsePendingBetaCode(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.code === "string") return { code: parsed.code, attempts: parsed.attempts ?? 0 };
  } catch { /* pre-hardening plain-string format */ }
  return { code: raw, attempts: 0 };
}
