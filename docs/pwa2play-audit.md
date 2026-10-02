# pwa2play Audit — Play Store Readiness

**Audited:** 2026-10-02 · **Method:** static read of `public/manifest.json`, `index.html`, `vite.config.js`,
`vercel.json`, `public/`, `api/`, `src/constants/legalDocuments.js`, repo-wide search for TWA artifacts.
**Not done:** no live-site checks (Lighthouse, deployed `/.well-known/` response), no `.apk` inspection (none exists).
**Skill reference:** `pwa2play:pwa2play` (Bubblewrap TWA path).

**Verdict: not ready.** The PWA shell is sound. Blocking items are policy/business ones (billing, legal text,
account type), not build ones. Nothing Android-specific exists in the repo yet.

---

## Status key
🔴 blocks submission/rejection risk · 🟠 must do before production · 🟡 should do · 🟢 already fine

---

## 🔴 Blockers

### B1. Stripe subscriptions inside a Play-distributed app
`api/stripe-create-checkout.js`, `stripe-portal.js`, `stripe-revive-checkout.js`, `stripe-webhook.js` and the
paywall/upgrade UI (`UpgradeModal`, `ReviveScreen`, `AccountDetailSubscription`) sell a digital subscription via
Stripe. Google Play's Payments policy generally requires Google Play Billing for in-app digital goods/subscriptions
in apps distributed through Play. A TWA that shows a Stripe checkout is the classic rejection/suspension cause.
**Decide a strategy before building anything:**
1. Play Billing via the Digital Goods API + Payment Request API (TWA-supported) — new code path, entitlements
   (`src/lib/entitlements.js`, `subscription.js`, webhook-driven tier flags) need a second source of truth. Large; a
   drift-warden §entitlements change.
2. Hide all purchase UI when running inside the TWA (detect via `document.referrer` starting `android-app://`) and
   sell only on the web — the app becomes a "reader" for subscribers. Verify current Play policy wording on external
   links/steering before relying on this; do not link out to the Stripe checkout from inside the TWA.
3. Ship Play version as free/beta-only (`is_tester`/beta tier) until 1 or 2 lands.
**Owner decision needed.** Everything else is secondary to this.

### B2. Legal text is placeholder
`src/constants/legalDocuments.js` is explicitly `"0.1-placeholder"`, "NOT fit to govern a real user's account", and
`ENFORCE_EXISTING_USER_RECONSENT` is off. Play requires a real, publicly reachable **privacy policy URL** (this app
handles financial + employment data) and Terms. Needs: lawyer-reviewed text, bumped `CURRENT_LEGAL_VERSION`,
re-consent flipped on, and the policy hosted at a stable public URL (not only inside a modal).

### B3. No Digital Asset Links
No `public/.well-known/assetlinks.json` exists and `vercel.json` has no headers/rewrites for it. Without it the app
opens with a Chrome address bar. Must carry the **Play App Signing** SHA-256 (Play Console → App integrity), not the
Bubblewrap upload key — so it can only be finalized *after* the first upload. Verify the file returns JSON/200 and
is not swallowed by the SPA fallback (`navigateFallback: 'index.html'` in `vite.config.js` — add
`navigateFallbackDenylist: [/^\/\.well-known\//, /^\/api\//]`).

### B4. No TWA project / signing key
No `twa-manifest.json`, no Android project, no keystore (good: none committed). Needs `bubblewrap init`, a permanent
package id (suggest `com.authority.finance`; **irreversible** once uploaded), and a keystore + 2 passwords backed up
**outside** the repo and OneDrive-synced project folder. Add `*.keystore`, `*.jks`, `twa-manifest.json` secrets
handling to `.gitignore` first.

---

## 🟠 Required before production

| # | Item | Detail |
|---|------|--------|
| P1 | **Developer account type** | Personal accounts need a closed test with **12 testers opted in for 14 continuous days** before production. Org accounts are exempt. The existing beta program (40-seat cap, `beta_codes`) is a ready tester pool, but testers must opt in via the Play test link. |
| P2 | **Data safety form** | Declare: financial info (income, expenses, goals), employment/pay data, email/auth, purchase history, Coach AI prompts sent to Anthropic (`api/coach.js`), résumé uploads (`resumes` bucket), usage events (`beta_activity_events`). Encryption in transit = yes; at rest = TLS+RLS only per CLAUDE.md — answer honestly. |
| P3 | **Account deletion** | `api/delete-account.js` + Profile UI exist (🟢), but Play also requires a **web-reachable deletion URL** declared in the listing, usable without installing the app. Add a public page/instructions. |
| P4 | **Financial-features declaration** | Play's Financial Features form applies to finance apps. This is a budgeting/income tracker, not lending/banking/trading — declare accordingly; confirm no loan-offering language (BudgetPanel has a "loans" feature: tracking only). |
| P5 | **Store listing assets** | Not in repo: 512×512 icon (🟢 `icon-512.png` exists), **1024×500 feature graphic**, ≥2 phone screenshots (`public/pwa/` holds iOS install steps, not store screenshots), short (80) + full (4000) description, category (Finance), contact email, content rating questionnaire, target audience. |
| P6 | **Target API** | Bubblewrap must target API 36 (2026 requirement). Use latest CLI; verify with `pwa2play:check` on the built `.apk` before upload. |
| P7 | **Version code discipline** | Start `appVersionCode: 1`; increment every upload to any track. |
| P8 | **Test on a real device** | Internal-testing track first; confirm full-screen (no URL bar), safe-area insets (`viewport-fit=cover` already set), back-button behavior, auth redirects, Stripe/portal behavior (see B1), PWA service-worker update banner. |

---

## 🟡 Manifest & PWA polish (`public/manifest.json`)

| # | Finding | Fix |
|---|---------|-----|
| M1 | `description`: "Personal finance dashboard — DHL/P&G Jackson MO" — leaks a single-employer/location framing into the manifest (and Play may surface it). | Reword to product language, e.g. "Personal finance dashboard — income modeling, budgeting, goals." |
| M2 | No `id` field. | Add `"id": "/"` so install identity is stable if `start_url` ever changes. |
| M3 | No `categories`, `screenshots`, `shortcuts`. | Add `"categories": ["finance"]`; screenshots improve Chrome install UI. Optional shortcuts → Income/Upkeep/Log. |
| M4 | `theme_color`/`background_color` `#0d0d0d` ≠ design-system base `#05100c` (`--color-bg-base`). | Align to tokens so splash screen and shell match; update `<meta name="theme-color">` in `index.html` too. |
| M5 | `apple-touch-icon.png` listed in the *Android* manifest `icons`. | Harmless, but remove — iOS reads the `<link>` tag. |
| M6 | `"orientation": "portrait"` locks the TWA. Fine for phone; Play large-screen quality guidance prefers not locking on tablets/foldables. | Decide; consider removing. |
| M7 | Maskable icon: verify the artwork keeps its key content inside the 80% safe zone. | Check at maskable.app. |
| M8 | Splash/branding: TWA splash uses `background_color` + icon. | Verify on device. |

---

## 🟢 Already in good shape

- HTTPS on Vercel; valid linked manifest with `name`, `short_name`, `start_url`, `scope`, `display: standalone`.
- 192, 512, and maskable-512 PNG icons present at correct sizes.
- Service worker via `vite-plugin-pwa` (precache + NetworkFirst navigation, offline fallback); `registerType: 'prompt'`
  deliberately avoids mid-session reloads — keep it.
- Single canonical manifest (no duplicate `<link rel="manifest">`).
- `viewport-fit=cover`, no `user-scalable=no`.
- Terms/Privacy **consent capture** mechanism exists (migration 033) — only the text is missing.
- Account deletion endpoint + in-app control exist.
- No keystores/`.jks` committed.

---

## Recommended order of work

1. **Decide B1** (billing strategy) — gates scope and timeline.
2. Account type (P1): organization vs. personal + tester recruitment plan.
3. Real legal text + public URLs for privacy policy and deletion (B2, P3).
4. `.gitignore` hardening → `bubblewrap init` → build `.aab` → upload to Internal testing (B4, P6, P7).
5. Read App Signing SHA-256 from Play Console → add `public/.well-known/assetlinks.json` + SW denylist → deploy (B3).
6. Device test, manifest polish (M1–M7), Data safety + listing assets (P2, P4, P5).
7. Closed test (if personal account) → production.

**Drift-warden note:** B1/option 1 touches entitlements, paywall, and persistence spines
(`docs/drift-app-warden.md`); B3's SW denylist touches PWA config. Consult those sections before changing.
