# Investor Sign-In Code Feature — Spec & TODO

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` complete

---

## Separate Sprints

Work explicitly out of scope for this feature. Each is a self-contained sprint.

### Sprint A — Demo Account Content
Load real fixture data into Demo Accounts 1 & 2 and render the full panel suite
in a read-only/locked mode so investors can explore a realistic financial picture.

- [ ] Define fixture data shape (income config, expenses, goals, logs)
- [ ] Seed fixture files (`src/fixtures/demo-account-1.js`, `demo-account-2.js`)
- [ ] Extend `DemoAccountTree` to load fixture and render panels in read-only mode
- [ ] Lock all edit/save interactions when viewing a demo account
- [ ] Account switcher (1 ↔ 2 ↔ 3) loads correct data without triggering a Supabase write

### Sprint B — Investor Code Management
Give the admin (currently: Supabase dashboard) a real UI for managing access codes
and visibility into who has registered with each code.

- [ ] Admin UI: list `investor_codes` rows, toggle `is_active`, add new codes with labels
- [ ] Code usage log: which code → which `investor_users` row, registered at what time
- [ ] Optional: usage count badge per code (how many investors registered with it)
- [ ] Guard: admin-only, behind `config.isAdmin === true`

---

## Overview

Adds a parallel investor access path to the login screen. An investor enters a
rotating access code, immediately creates their account, and lands in the app
with demo account 1 as the default view. The accounts pill (`1 | 2 | 3*`) in
the hamburger menu lets them navigate. Selecting `3*` triggers the non-DHL
Setup Wizard to build their personal financial dashboard.

---

## User Flow (complete)

```
Login screen (sign-in mode)
  └─ INVESTOR section: enter code → validate against investor_codes table
       └─ InvestorRegister form
            (name req, email req, password req, company opt, city opt)
            └─ createInvestorAccount() → Supabase auth user created
                 + investor_users row (name, company, city, code_used)
                 + user_data row (is_investor:true, setupComplete:false)
                 └─ Logged in → App renders
                      └─ activeInvestorAccount: 1 (default)
                           → DemoAccountTree placeholder (demo 1)
                           └─ Accounts pill in hamburger: [1] [2] [3*]
                                ├─ 1 or 2 → DemoAccountTree placeholder
                                └─ 3* → setupComplete:false → non-DHL wizard
                                              → setupComplete:true → full app

Returning investor login:
  Regular email + password form (top of login screen) → app
  (investor code section is for new account creation only)
```

---

## Phase 1 — UI & Client-Side Scaffolding ✓

*No Supabase writes. All state is in-memory. Goal: complete visual + routing shell.*

---

### 1.1 — Login Screen: Investor Code Section (`LoginScreen.jsx`) ✓

- [x] Horizontal divider + section below existing form (sign-in mode only)
- [x] Heading: "INVESTOR" — `I` at 1.4× size, underlined, `var(--color-green)`
- [x] Text input: letters only (`/^[a-zA-Z]*$/` on `onChange`)
- [x] Placeholder: `enter access code`
- [x] Submit on Enter key or button
- [x] Loading state: "Verifying…" on button, 420ms simulated delay
- [x] Error state: red inline message + 300ms shake animation
- [x] `onInvestorVerified(code)` callback fires on valid code
- [x] Phase 1 placeholder validation replaced with `validateInvestorCode()` in Phase 2

---

### 1.2 — Investor Registration Form (`InvestorRegister.jsx`) ✓

Shown immediately after code validation — this IS the first screen after code entry.
New investors register here. Returning investors use the regular email + password form.

- [x] Full-screen Shell card (same style as LoginScreen)
- [x] Title: `"Create Your Account"` · subtitle: describes demo + personal access
- [x] Fields:
  - Your Name — text, required
  - Email — email type, required
  - Password — password type, required, min 8 chars, show/hide toggle
  - Confirm Password — required, must match
  - Company / LLC — text, optional
  - City — text, optional
- [x] `attempted` flag: validation UI (red label + border + ↑ message) only after first submit attempt
- [x] Password short / mismatch errors fire independently
- [x] Error box for server errors
- [x] Hint: `"Already have an investor account? Sign in using the form above."`
- [x] CTA: `"Create Account & Continue"` (disabled while loading)
- [x] `onRegister(formData)` callback on valid submit — wired to `createInvestorAccount()` in App.jsx
- [x] Back link → `onBack()` returns to login screen

---

### 1.3 — Demo Account Placeholder (`DemoAccountTree.jsx`) ✓

In-app view shown when `activeInvestorAccount === 1 || 2`. Not a pre-auth screen.

- [x] `accountNumber` prop (1 or 2)
- [x] SH header: `"Demo Account {n}"`
- [x] Placeholder card with hint to switch to `3*` for personal account
- [ ] Sprint A: load read-only fixture data, render panels in demo/locked mode

---

### 1.4 — Setup Wizard: Investor Branch (`SetupWizard.jsx`) ✓

Triggered when investor selects `3*` and `config.setupComplete === false`.
Standard non-DHL wizard path — no DHL employer options shown.

- [x] `isInvestor` prop (boolean, default `false`)
- [x] When `isInvestor` is true:
  - Skip DHL employer preset entirely
  - Force `employerPreset: null` in formData
  - Default `standardWeeklyHours: 40`, `otThreshold: 40`
- [x] Investor's first name (from `config.investorName`) shown in welcome step greeting
- [x] No additional steps beyond standard non-DHL wizard path

---

### 1.5 — Config Shape (`config.js`) ✓

- [x] Added to `DEFAULT_CONFIG`:
  ```js
  isInvestor: false,
  investorName: null,
  investorCompany: null,
  investorCity: null,
  ```

---

### 1.6 — Accounts Pill in Hamburger Menu (`App.jsx`) ✓

- [x] `activeInvestorAccount` state: `1 | 2 | 3` (default `1` — demo account 1 on first load)
- [x] Render pill only when `config.isInvestor === true`
- [x] Position: in drawer, below navigation items, above sign-out button
- [x] Label: `"ACCOUNTS"` — 10px, 2px letter-spacing, uppercase
- [x] Pill structure (LiquidGlass container, 3 equal-width buttons): `1` · `2` · `3*`
- [x] Active button: `var(--color-accent-primary)` background, dark text
- [x] Inactive buttons: `var(--color-bg-raised)`, `var(--color-text-secondary)`
- [x] Switching to 3*: if `setupComplete: false` → trigger wizard; if `true` → show app panels
- [x] Switching to 1 or 2: render `<DemoAccountTree accountNumber={n} />`

---

### 1.7 — App.jsx Routing ✓

- [x] `investorSession` state: `null | { code: string }` — set when code is verified
- [x] Auth gate: `if investorSession && !authedUser` → render `<InvestorRegister />`
- [x] `<LoginScreen>` gets `onInvestorVerified={code => setInvestorSession({ code })}` prop
- [x] `<InvestorRegister>` gets `onRegister` (calls `createInvestorAccount`) + `onBack`
- [x] After `createInvestorAccount` succeeds → `authedUser` set by `onAuthStateChange` → app renders
- [x] On app render with `config.isInvestor === true`: content area shows `<DemoAccountTree>`
- [x] When `activeInvestorAccount === 3` and `!config.setupComplete`: wizard launches with `isInvestor={true}`
- [x] `investorSession` and `investorProfile` cleared on sign-out

---

## Phase 2 — Supabase Data Layer ✓

*Migrations, table creation, auth functions, DB reads/writes.*

---

### 2.1 — Migration: `investor_codes` Table ✓

**File:** `database/migrations/010_add_investor_codes.sql`

- [x] Migration file written
- [x] Run against Supabase
- [x] Anon SELECT verified against `is_active = true` filter
- [x] Initial seed code inserted

---

### 2.2 — Migration: `investor_users` Table ✓

**File:** `database/migrations/011_add_investor_users.sql`

- [x] Migration file written (includes `active_account SMALLINT DEFAULT 1`)
- [x] Run against Supabase
- [x] RLS verified: investor row only visible to matching `auth.uid()`

---

### 2.3 — Migration: Add `is_investor` to `user_data` ✓

**File:** `database/migrations/012_add_is_investor_to_user_data.sql`

- [x] Migration file written
- [x] Run against Supabase
- [x] Existing rows default to `false`

---

### 2.4 — Code Validation (`supabase.js`) ✓

- [x] `validateInvestorCode(code)` queries `investor_codes` case-insensitively against `is_active = true`
- [x] Returns `boolean`
- [x] Wired into `LoginScreen.jsx` `handleInvestorSubmit()`

---

### 2.5 — Investor Account Creation (`db.js`) ✓

- [x] `supabase.auth.signUp` with `display_name` metadata
- [x] Insert `investor_users` row with `auth_user_id`, name, email, company, city, `code_used`, `code_used_at`
- [x] Upsert `user_data` row: `is_investor: true`, config seeded with investor fields, `setupComplete: false`
- [x] Rollback: deletes `investor_users` row if `user_data` upsert fails
- [x] Wired into `InvestorRegister`'s `onRegister` callback in App.jsx
- [x] Returns `{ session, error, needsConfirmation }`

---

### 2.6 — Save Active Account (`db.js`) ✓

- [x] `saveInvestorActiveAccount(accountNum)` updates `investor_users.active_account`
- [x] Called fire-and-forget when accounts pill selection changes in App.jsx

---

### 2.7 — Load Investor Profile on Auth (`db.js` + `App.jsx`) ✓

- [x] `loadUserData()` fetches `investor_users` row when `is_investor = true`
- [x] `activeInvestorAccount` restored from `investor_users.active_account` (default `1`)
- [x] `investorProfile` stored in App.jsx state

---

### 2.8 — Returning Investor Login ✓

- [x] Investor signs in via regular email + password form (top of login screen)
- [x] `supabase.auth.signInWithPassword` → session → `loadUserData()` → `config.isInvestor: true`
- [x] App renders with `activeInvestorAccount` restored from `investor_users.active_account`
- [x] Investor code section on login screen is for new account creation only — ignored on returning login

---

## Files Created

| File | Purpose |
|------|---------|
| `src/components/InvestorRegister.jsx` ✓ | Registration form — shown immediately after code validation |
| `database/migrations/010_add_investor_codes.sql` ✓ | investor_codes table + seed |
| `database/migrations/011_add_investor_users.sql` ✓ | investor_users table with active_account column |
| `database/migrations/012_add_is_investor_to_user_data.sql` ✓ | is_investor flag on user_data |

---

## Files Modified

| File | Change |
|------|--------|
| `src/components/LoginScreen.jsx` ✓ | Investor code section + `onInvestorVerified` prop + `validateInvestorCode` wired |
| `src/components/DemoAccountTree.jsx` ✓ | In-app demo placeholder (`accountNumber` prop) |
| `src/components/SetupWizard.jsx` ✓ | `isInvestor` prop — suppresses DHL path, pre-fills welcome name |
| `src/App.jsx` ✓ | `investorSession` + `investorProfile` state, InvestorRegister routing, accounts pill, 3* wizard gate |
| `src/lib/supabase.js` ✓ | `validateInvestorCode` |
| `src/lib/db.js` ✓ | `createInvestorAccount`, `saveInvestorActiveAccount`, investor profile load in `loadUserData` |
| `src/constants/config.js` ✓ | Investor fields added to `DEFAULT_CONFIG` |

## Files Removed

| File | Reason |
|------|--------|
| `src/components/InvestorWelcome.jsx` | Replaced by InvestorRegister — welcome/login/create split eliminated |

---

## Edge Cases & Notes

| Scenario | Handling |
|----------|---------|
| Code entered in any case (`SUCCESS`, `Success`) | `.trim().toLowerCase()` before DB query |
| Returning investor enters the code by accident | Hint text on InvestorRegister: "Already have an account? Sign in above" |
| Two investors register with same email | Supabase auth rejects duplicate — surfaced as error in InvestorRegister error box |
| `investor_users` insert fails after auth user created | Catch + surface error; re-attempt is safe (signUp is idempotent for unconfirmed users) |
| Investor abandons mid-wizard | `setupComplete: false` → wizard re-launches when 3* is selected again |
| Accounts pill on non-investor user | Guarded by `config.isInvestor === true` — never rendered |
| 3* selected with `setupComplete: false` | Wizard launches; completing it sets `setupComplete: true` |
| 3* selected with `setupComplete: true` | Full financial app panels shown normally |
| Multiple valid codes simultaneously | Fully supported — any `is_active = true` row validates |
| `investor_codes` management | Done directly in Supabase dashboard table editor (Sprint B adds admin UI) |
| Email confirmation required | `needsConfirmation: true` returned → InvestorRegister shows "Check your email" screen |
