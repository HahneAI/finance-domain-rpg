# Investor Sign-In Code Feature — Spec & TODO

**Status legend:** `[ ]` not started · `[~]` in progress · `[x]` complete

---

## Overview

Adds a parallel investor access path to the login screen. An investor enters a
rotating access code (managed in Supabase), lands on a Welcome screen, and can
either log in to an existing investor account or create a new one via the Demo
Account Tree. A new investor account gets a fully working non-DHL finance app.

---

## User Flow (complete)

```
Login screen
  └─ Investor section: enter code → validate against investor_codes table
       └─ WELCOME SCREEN  ("Welcome" heading)
             ├─ LOGIN → email + password → Supabase auth (code ignored)
             │         → lands in app (config.isInvestor true, accounts pill visible)
             └─ CREATE ACCOUNT → Demo Account Tree
                    ├─ Demo Account 1  (visual press only — separate sprint)
                    ├─ Demo Account 2  (visual press only — separate sprint)
                    └─ Create Personal Account
                           └─ Registration form (name, email, password req.; company, city opt.)
                                └─ non-DHL Setup Wizard
                                     └─ Full working app
```

---

## Phase 1 — UI & Client-Side Scaffolding

*No Supabase writes. All state is in-memory. Goal: complete visual + routing shell.*

---

### 1.1 — Login Screen: Investor Code Section (`LoginScreen.jsx`)

- [ ] Add a horizontal divider + section label below the existing form
- [ ] Section heading: "INVESTOR" — first letter rendered at 1.4× size, underlined, `var(--color-green)`
- [ ] Text input: letters only (`/^[a-zA-Z]*$/` enforced on `onChange`, prevent invalid chars)
- [ ] Placeholder: `enter access code`
- [ ] Submit on Enter key or button press
- [ ] Loading state while DB check is in flight (spinner on button)
- [ ] Error state: red inline message + 300ms shake animation (`"Invalid code"`)
- [ ] Success state: green flash → transition to `InvestorWelcome` view
- [ ] Add `investorCodeVerified` state to `LoginScreen` (`null | string`) — holds the verified code string on success; cleared on back

---

### 1.2 — Welcome Screen (`InvestorWelcome.jsx`)

- [ ] New component, full-screen, same shell/card style as LoginScreen
- [ ] Heading: `"Welcome"` — large, `var(--color-text-primary)`
- [ ] Subheading: `"Investor Access"` — small, `var(--color-text-secondary)`
- [ ] Two CTA buttons stacked:
  - `"Log In"` — secondary style (bg-raised, border-subtle)
  - `"Create Account"` — primary style (bg-accent, dark text)
- [ ] Back link: `"← Back"` — returns to LoginScreen, clears `investorCodeVerified`
- [ ] Props: `code` (the verified code string), `onLogin`, `onCreateAccount`, `onBack`

---

### 1.3 — Demo Account Tree (`DemoAccountTree.jsx`)

- [ ] New component, full-screen
- [ ] Section header: `"DEMO ACCOUNT TREE"` — SH component, teal
- [ ] Three equal-width cards/buttons:

| # | Label | Style |
|---|-------|-------|
| 1 | Demo Account 1 | standard card, secondary text |
| 2 | Demo Account 2 | standard card, secondary text |
| 3 | Create Personal Account | accent border, teal label, `✦` suffix |

- [ ] Visual press feedback on all three: `scale(0.97)` + `var(--color-gold)` border flash 150ms
- [ ] Buttons 1 & 2: no action beyond visual (console.log placeholder acceptable)
- [ ] Button 3: calls `onCreateAccount()` prop — routes to registration form
- [ ] Back link: `"← Welcome"` — returns to `InvestorWelcome`

---

### 1.4 — Investor Registration Form (inline or modal, pre-wizard)

Shown before launching Setup Wizard. Collects auth credentials + profile fields.

- [ ] Fields:
  - Investor Name — text, required (`attempted` + red border + `↑ Required` on blank submit)
  - Email — email type, required
  - Password — password type, required, min 8 chars, show/hide toggle
  - Confirm Password — password type, required, must match
  - Company / LLC — text, optional
  - City — text, optional
- [ ] Use existing `Field` + `errBorder` pattern from SetupWizard
- [ ] Hint text below form: `"You can return here with your email and password at any time."`
- [ ] CTA: `"Create Account & Continue"` (disabled while loading)
- [ ] On success: launch `SetupWizard` with `isInvestor={true}` prop
- [ ] Error display: inline, below the submit button

---

### 1.5 — Setup Wizard: Investor Branch (`SetupWizard.jsx`)

- [ ] Add `isInvestor` prop (boolean, default `false`)
- [ ] When `isInvestor` is true:
  - Hide DHL employer preset entirely (skip the team/shift selection branch)
  - Force `employerPreset: null` in formData
  - Default `standardWeeklyHours: 40`, `otThreshold: 40`
- [ ] Registration fields pre-populate into wizard config (name, company, city passed as props, not re-collected)
- [ ] No other wizard step changes — investor completes the standard non-DHL path

---

### 1.6 — Config Shape (`config.js`)

- [ ] Add to `DEFAULT_CONFIG`:
  ```js
  isInvestor: false,
  investorName: null,
  investorCompany: null,
  investorCity: null,
  ```

---

### 1.7 — Accounts Pill in Hamburger Menu (`App.jsx`)

- [ ] Add `activeInvestorAccount` state: `1 | 2 | 3` (default `3`)
- [ ] Render pill only when `config.isInvestor === true`
- [ ] Position: in sidebar/drawer, below navigation items, above sign-out button
- [ ] Label: `"ACCOUNTS"` — 10px, 2px letter-spacing, uppercase (matches `lS` style)
- [ ] Pill structure (LiquidGlass container, 3 equal-width buttons):
  - `1` — Demo Account 1
  - `2` — Demo Account 2
  - `3*` — Personal (asterisk denotes custom account)
- [ ] Active button: `var(--color-accent-primary)` background, dark text
- [ ] Inactive buttons: `var(--color-bg-raised)`, `var(--color-text-secondary)`
- [ ] Visual only — no account switching logic yet
- [ ] Match LiquidGlass + animated indicator style from `MonthQuarterSelector`

---

### 1.8 — App.jsx Routing

- [ ] Add `investorSession` state: `null | { code: string }` — set on code verification
- [ ] Add `investorScreen` state: `"welcome" | "tree" | "register" | null`
- [ ] Auth gate sequence (insert before existing `<LoginScreen>` render):
  ```
  if investorSession && !authedUser → render InvestorWelcome / DemoAccountTree / registration
  ```
- [ ] After successful registration + wizard → `authedUser` set by Supabase → normal app renders
- [ ] After successful login from InvestorWelcome → `authedUser` set → normal app renders
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

-- Anon read so client can validate without exposing full list via RPC (Phase 2+)
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
  code_used      TEXT,           -- code active at account creation time
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

### 2.3 — Migration: Add `is_investor` to `user_data`

**File:** `database/migrations/012_add_is_investor_to_user_data.sql`

```sql
ALTER TABLE user_data
  ADD COLUMN IF NOT EXISTS is_investor BOOLEAN NOT NULL DEFAULT false;
```

- [ ] Write migration file
- [ ] Run against Supabase
- [ ] Verify existing rows default to `false` (no data impact)

---

### 2.4 — Code Validation (`supabase.js`)

```js
// Returns true if code exists and is_active = true; false otherwise
export async function validateInvestorCode(code) { ... }
```

- [ ] Query `investor_codes` where `lower(code) = lower(input)` and `is_active = true`
- [ ] Return `boolean` (not the full row — no need to expose label/notes to client)
- [ ] Called from LoginScreen on submit; drives success/error state

---

### 2.5 — Investor Account Creation (`supabase.js` + `db.js`)

**`supabase.js`:**
```js
// Creates Supabase auth user, investor_users row, and user_data row atomically
export async function createInvestorAccount({ name, email, password, company, city, codeUsed }) { ... }
```

- [ ] `supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })`
- [ ] On auth user created: insert `investor_users` row (`auth_user_id`, `investor_name`, `email`, `company_name`, `city`, `code_used`, `code_used_at: now()`)
- [ ] Upsert `user_data` row: `{ user_id: authUser.id, is_investor: true, config: { ...DEFAULT_CONFIG, isInvestor: true, investorName: name, investorCompany: company, investorCity: city } }`
- [ ] On any step failure: attempt cleanup (delete `investor_users` row if `user_data` insert fails); surface error to UI
- [ ] Returns `{ user, error }`

---

### 2.6 — Save Active Account (`db.js`)

```js
export async function saveInvestorActiveAccount(authUserId, accountNum) { ... }
```

- [ ] Updates `investor_users.active_account` (add column to migration 011 if not already there)
- [ ] Called when accounts pill selection changes
- [ ] Debounced not required — direct write on interaction

---

### 2.7 — Load Investor Profile on Auth (`db.js` + `App.jsx`)

- [ ] In `loadUserData()`: after loading `user_data`, if `is_investor = true` fetch matching `investor_users` row
- [ ] Merge `investor_users` fields into app state (`investorProfile`) for display in ProfilePanel / drawer
- [ ] `activeInvestorAccount` initialized from `investor_users.active_account` (default `3`)

---

### 2.8 — Returning Investor Login (full path test)

- [ ] Investor enters any currently-valid code → Welcome screen
- [ ] Taps "Log In" → email + password form
- [ ] `supabase.auth.signInWithPassword({ email, password })` → session created
- [ ] `authedUser` set → `loadUserData()` → `config.isInvestor: true` → normal app renders
- [ ] Code used to reach Welcome screen is **not recorded** (login path ignores it)
- [ ] Test: investor whose original code has been rotated can still log in via new code

---

## Files To Create

| File | Purpose |
|------|---------|
| `src/components/InvestorWelcome.jsx` | Welcome screen post-code |
| `src/components/DemoAccountTree.jsx` | 3-button tree |
| `database/migrations/010_add_investor_codes.sql` | investor_codes table + seed |
| `database/migrations/011_add_investor_users.sql` | investor_users table |
| `database/migrations/012_add_is_investor_to_user_data.sql` | is_investor flag on user_data |

---

## Files To Modify

| File | Change |
|------|--------|
| `src/components/LoginScreen.jsx` | Investor code section |
| `src/components/SetupWizard.jsx` | `isInvestor` prop + DHL suppression |
| `src/App.jsx` | Investor routing states + accounts pill in drawer |
| `src/lib/supabase.js` | `validateInvestorCode`, `createInvestorAccount` |
| `src/lib/db.js` | `saveInvestorActiveAccount`, load investor profile |
| `src/constants/config.js` | Add investor fields to `DEFAULT_CONFIG` |

---

## Edge Cases & Notes

| Scenario | Handling |
|----------|---------|
| Code entered in any case (`SUCCESS`, `Success`) | `.trim().toLowerCase()` before DB query |
| Code rotated since investor last logged in | Login path ignores code entirely — no issue |
| Two investors register with same email | Supabase auth rejects duplicate email — surface as "email already in use" |
| `investor_users` insert fails after auth user created | Catch + delete auth user via service role, or surface retry; `setupComplete: false` means wizard re-runs on next login |
| Investor completes registration but abandons wizard | `setupComplete: false` → wizard re-launches on next login; `investor_users` row intact |
| Accounts pill on non-investor user | Guarded by `config.isInvestor === true` — never rendered |
| RLS: investor reading their own code history | Not needed — `code_used` field is on their own row, always visible |
| Multiple valid codes simultaneously | Fully supported — any `is_active = true` row validates |
| `investor_codes` management | Done directly in Supabase dashboard table editor (no admin UI needed) |

---

## Out of Scope (Separate Sprints)

- Demo Account 1 & 2 fixture data and read-only rendering
- Account switcher functional logic (loading demo data when 1 or 2 selected)
- Admin UI for managing `investor_codes`
- Investor analytics / code usage reporting
