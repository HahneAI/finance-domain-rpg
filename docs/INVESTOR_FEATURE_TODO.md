# Investor Sign-In Code Feature — Spec & TODO

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` complete

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

## Phase 1 — UI & Client-Side Scaffolding

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
- [x] Phase 1 placeholder validation (`"success"` hardcoded); Phase 2: `validateInvestorCode()`

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
- [x] Error box for server errors (Phase 2)
- [x] Hint: `"Already have an investor account? Sign in using the form above."`
- [x] CTA: `"Create Account & Continue"` (disabled while loading)
- [x] `onRegister(formData)` callback on valid submit — Phase 2 wires `createInvestorAccount()`
- [x] Back link → `onBack()` returns to login screen

---

### 1.3 — Demo Account Placeholder (`DemoAccountTree.jsx`) ✓

In-app view shown when `activeInvestorAccount === 1 || 2`. Not a pre-auth screen.

- [x] `accountNumber` prop (1 or 2)
- [x] SH header: `"Demo Account {n}"`
- [x] Placeholder card with hint to switch to `3*` for personal account
- [ ] Future sprint: load read-only fixture data, render panels in demo/locked mode

---

### 1.4 — Setup Wizard: Investor Branch (`SetupWizard.jsx`)

Triggered when investor selects `3*` and `config.setupComplete === false`.
Standard non-DHL wizard path — no DHL employer options shown.

- [ ] Add `isInvestor` prop (boolean, default `false`)
- [ ] When `isInvestor` is true:
  - Skip DHL employer preset entirely
  - Force `employerPreset: null` in formData
  - Default `standardWeeklyHours: 40`, `otThreshold: 40`
- [ ] Investor's name (from `config.investorName`) pre-fills the welcome step display name
- [ ] No additional steps beyond standard non-DHL wizard path

---

### 1.5 — Config Shape (`config.js`)

- [ ] Add to `DEFAULT_CONFIG`:
  ```js
  isInvestor: false,
  investorName: null,
  investorCompany: null,
  investorCity: null,
  ```

---

### 1.6 — Accounts Pill in Hamburger Menu (`App.jsx`)

- [ ] Add `activeInvestorAccount` state: `1 | 2 | 3` (default `1` — demo account 1 on first load)
- [ ] Render pill only when `config.isInvestor === true`
- [ ] Position: in sidebar/drawer, below navigation items, above sign-out button
- [ ] Label: `"ACCOUNTS"` — 10px, 2px letter-spacing, uppercase (matches `lS` style)
- [ ] Pill structure (LiquidGlass container, 3 equal-width buttons):
  - `1` — Demo Account 1
  - `2` — Demo Account 2
  - `3*` — Personal (asterisk = their custom financial account)
- [ ] Active button: `var(--color-accent-primary)` background, dark text
- [ ] Inactive buttons: `var(--color-bg-raised)`, `var(--color-text-secondary)`
- [ ] Switching to 3*: if `setupComplete: false` → trigger wizard; if `true` → show app panels
- [ ] Switching to 1 or 2: render `<DemoAccountTree accountNumber={n} />`
- [ ] Match LiquidGlass + animated indicator style from `MonthQuarterSelector`

---

### 1.7 — App.jsx Routing

- [ ] Add `investorSession` state: `null | { code: string }` — set when code is verified
- [ ] Auth gate sequence (before existing `<LoginScreen>` render):
  ```
  if investorSession && !authedUser → render <InvestorRegister />
  ```
- [ ] `<LoginScreen>` gets `onInvestorVerified={code => setInvestorSession({ code })}` prop
- [ ] `<InvestorRegister>` gets:
  - `onRegister={data => { /* Phase 2: createInvestorAccount */ }}` 
  - `onBack={() => setInvestorSession(null)}`
- [ ] After `createInvestorAccount` succeeds → `authedUser` set by Supabase `onAuthStateChange` → app renders
- [ ] On app render with `config.isInvestor === true`:
  - Default `activeInvestorAccount: 1`
  - Main content area: `<DemoAccountTree accountNumber={1} />`
- [ ] When `activeInvestorAccount === 3` and `!config.setupComplete`:
  - Trigger wizard with `isInvestor={true}`
- [ ] `investorSession` cleared when user signs out

---

## Phase 2 — Supabase Data Layer

*Migrations, table creation, auth functions, DB reads/writes.*

---

### 2.1 — Migration: `investor_codes` Table

**File:** `database/migrations/010_add_investor_codes.sql`

```sql
CREATE TABLE IF NOT EXISTS investor_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT NOT NULL UNIQUE,
  label      TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE investor_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon can read active codes"
  ON investor_codes FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Seed the initial code
INSERT INTO investor_codes (code, label)
  VALUES ('success', 'Initial Launch Code')
  ON CONFLICT (code) DO NOTHING;
```

- [ ] Write migration file
- [ ] Run against Supabase (dashboard SQL editor or CLI)
- [ ] Verify anon SELECT works with `is_active = true` filter

---

### 2.2 — Migration: `investor_users` Table

**File:** `database/migrations/011_add_investor_users.sql`

```sql
CREATE TABLE IF NOT EXISTS investor_users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  investor_name  TEXT NOT NULL,
  email          TEXT NOT NULL,
  company_name   TEXT,
  city           TEXT,
  code_used      TEXT,
  code_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS investor_users_auth_idx
  ON investor_users (auth_user_id);

ALTER TABLE investor_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investor sees own row"
  ON investor_users FOR ALL
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);
```

- [ ] Write migration file
- [ ] Run against Supabase
- [ ] Verify RLS: investor row only visible to matching `auth.uid()`

---

### 2.3 — Migration: Add `is_investor` to `user_data` ✓

**File:** `database/migrations/012_add_is_investor_to_user_data.sql`

```sql
ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS is_investor BOOLEAN NOT NULL DEFAULT false;
```

- [x] Write migration file
- [ ] Run against Supabase
- [x] Verify existing rows default to `false`

---

### 2.4 — Code Validation (`supabase.js`) ✓

```js
// Returns true if code exists and is_active = true; false otherwise
export async function validateInvestorCode(code) { ... }
```

- [x] Query `investor_codes` where `lower(code) = lower(input)` and `is_active = true`
- [x] Return `boolean`
- [x] Replace Phase 1 hardcoded check in `LoginScreen.jsx` `handleInvestorSubmit()`

---

### 2.5 — Investor Account Creation (`supabase.js` + `db.js`)

```js
export async function createInvestorAccount({ name, email, password, company, city, codeUsed }) { ... }
```

- [ ] `supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })`
- [ ] Insert `investor_users` row: `auth_user_id`, `investor_name`, `email`, `company_name`, `city`, `code_used`, `code_used_at: now()`
- [ ] Upsert `user_data` row: `{ user_id, is_investor: true, config: { ...DEFAULT_CONFIG, isInvestor: true, investorName: name, investorCompany: company, investorCity: city, setupComplete: false } }`
- [ ] On partial failure: cleanup `investor_users` row if `user_data` upsert fails; surface error to `InvestorRegister`
- [ ] Wire into `InvestorRegister`'s `onRegister` callback in App.jsx
- [ ] Returns `{ user, error }`

---

### 2.6 — Save Active Account (`db.js`)

```js
export async function saveInvestorActiveAccount(authUserId, accountNum) { ... }
```

- [ ] Updates `investor_users.active_account` (add column to migration 011)
- [ ] Called when accounts pill selection changes in App.jsx

---

### 2.7 — Load Investor Profile on Auth (`db.js` + `App.jsx`)

- [ ] In `loadUserData()`: if `is_investor = true`, fetch matching `investor_users` row
- [ ] Populate `activeInvestorAccount` from `investor_users.active_account` (default `1`)
- [ ] Store `investorProfile` in App.jsx state for use in ProfilePanel / drawer display

---

### 2.8 — Returning Investor Login (full path test)

- [ ] Investor signs in via regular email + password form (top of login screen)
- [ ] `supabase.auth.signInWithPassword` → session → `loadUserData()` → `config.isInvestor: true`
- [ ] App renders with `activeInvestorAccount` restored from `investor_users.active_account`
- [ ] Investor code section on login screen is for new account creation only — ignored on existing login

---

## Files To Create

| File | Purpose |
|------|---------|
| `src/components/InvestorRegister.jsx` ✓ | Registration form — shown immediately after code validation |
| `database/migrations/010_add_investor_codes.sql` | investor_codes table + seed |
| `database/migrations/011_add_investor_users.sql` | investor_users table |
| `database/migrations/012_add_is_investor_to_user_data.sql` | is_investor flag on user_data |

---

## Files To Modify

| File | Change |
|------|--------|
| `src/components/LoginScreen.jsx` ✓ | Investor code section + `onInvestorVerified` prop |
| `src/components/DemoAccountTree.jsx` ✓ | In-app demo placeholder (accountNumber prop) |
| `src/components/SetupWizard.jsx` | `isInvestor` prop — suppress DHL path |
| `src/App.jsx` | `investorSession` state, routing to InvestorRegister, accounts pill in drawer, 3* wizard gate |
| `src/lib/supabase.js` | `validateInvestorCode`, `createInvestorAccount` |
| `src/lib/db.js` | `saveInvestorActiveAccount`, load investor profile |
| `src/constants/config.js` | Add investor fields to `DEFAULT_CONFIG` |

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
| Two investors register with same email | Supabase auth rejects duplicate — surface as "email already in use" in InvestorRegister error box |
| `investor_users` insert fails after auth user created | Catch + cleanup; `setupComplete: false` means wizard re-runs on next login |
| Investor abandons mid-wizard | `setupComplete: false` → wizard re-launches when 3* is selected again |
| Accounts pill on non-investor user | Guarded by `config.isInvestor === true` — never rendered |
| 3* selected with `setupComplete: false` | Wizard launches; completing it sets `setupComplete: true` |
| 3* selected with `setupComplete: true` | Full financial app panels shown normally |
| Multiple valid codes simultaneously | Fully supported — any `is_active = true` row validates |
| `investor_codes` management | Done directly in Supabase dashboard table editor |

---

## Out of Scope (Separate Sprints)

- Demo Account 1 & 2 fixture data and read-only panel rendering
- Account switcher data-loading logic (demo fixture → panels)
- Admin UI for managing `investor_codes`
- Investor analytics / code usage reporting
