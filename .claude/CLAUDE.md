# CLAUDE.md — Authority Finance

## Product
**Company:** Authority | **Product:** Authority OS | **Tagline:** *"You are missing out… on you."*
**This app:** Authority Finance (A:Fin) — personal finance dashboard: income modeling, budgeting, goals, event logging.
**Design system:** Flow shell (live) + Pulse overlay (Phase 2). See `docs/authority-design-system`.
**Liquid Glass UI:** `src/components/LiquidGlass.jsx` — frosted glass for nav, pills, modals. Recipe in `docs/active-systems.md` §13.

---

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 |
| Styling | Tailwind CSS v4 + CSS custom properties |
| Auth + DB | Supabase (auth live, localStorage→Supabase migration path) |
| Testing | Vitest + Testing Library |
| PWA | vite-plugin-pwa (manifest + service worker active) |
| Hosting | Vercel |

**No backend server.** Pure frontend. No Express, no Claude API, no Stripe — yet.

---

## File Structure
```
src/
├── App.jsx                  — root shell, nav, auth gate, fiscal week state
├── index.css                — @theme design tokens (single source of truth)
├── components/
│   ├── ui.jsx               — shared primitives (MetricCard, NT, VT, SmBtn, SH, iS, lS)
│   ├── HomePanel.jsx        — dashboard home tiles
│   ├── IncomePanel.jsx      — income / tax / rolling weekly view
│   ├── BudgetPanel.jsx      — expenses / goals / loans
│   ├── BenefitsPanel.jsx    — 401k + PTO
│   ├── LogPanel.jsx         — event log + Log Effect Summary
│   ├── WeekConfirmModal.jsx — weekly schedule confirmation
│   ├── SetupWizard.jsx      — multi-step onboarding (see §SetupWizard below)
│   ├── LoginScreen.jsx      — auth shell
│   └── ProfilePanel.jsx     — account + employment settings
├── constants/
│   ├── config.js            — FISCAL_YEAR_START, PHASES, EVENT_TYPES, DHL_PRESET, BENEFIT_OPTIONS
│   └── stateTaxTable.js     — state tax rate table
├── hooks/useLocalStorage.js
├── lib/
│   ├── finance.js           — buildYear, computeNet, computeGoalTimeline, calcEventImpact
│   ├── rollingTimeline.js   — deriveRollingIncomeWeeks, deriveRollingTimelineMonths
│   ├── fiscalWeek.js        — FISCAL_WEEKS_PER_YEAR, week index helpers
│   ├── db.js                — localStorage persistence
│   └── supabase.js          — Supabase client
└── test/                    — Vitest tests
docs/                        — project documentation
database/migrations/         — Supabase SQL migrations
```

---

## SetupWizard Quick Reference (`src/components/SetupWizard.jsx` ~1800 lines)

**Export:** `SetupWizard({ config, onComplete, onCancel, lifeEvent })`
- `config` — current app config; spread into `formData` on mount
- `lifeEvent` — `null` (first-run) | `"lost_job"` | `"changed_jobs"` | `"commission_job"`
- `onComplete(data)` — receives merged config + `taxedWeeks` array + `setupComplete: true`

**Steps (controlled by `STEP_DEFS` — each has `showIf(formData, lifeEvent)` + `isValid(formData)`):**
| Step ID | Title | Key fields / notes |
|---------|-------|-------------------|
| 0 | Welcome | First-run intro or life event picker (LIFE_EVENTS array) |
| 1 | Pay Structure | DHL employer gate → team/shift/rotation; base rate, OT threshold/multiplier, weekend diff, commission |
| 2 | Schedule | Job start date → `firstActiveIdx`; rotation week (DHL) or std hours + pay period close day |
| 3 | Deductions | BenefitCard toggles (BENEFIT_OPTIONS), `otherDeductions` rows, attendance gate; `skippable: true` |
| 4 | Tax Rates | State select, inline `PaystubCalc`, rate summary with FICA + std deduction; DHL MO preset |
| 7 | Wrap Up | Live net preview (`estimateWeeklyGross`), paycheck buffer toggle ($50 default, $200 max), tax-exempt opt-in |

**Life event routing:** `lost_job` → steps 0–4; `commission_job` → steps 0–4 + commission field in step 1; `null` / `"changed_jobs"` → all steps including WrapUp (step 7).

**Internal helpers (file-private):** `Pill`, `Field`, `FieldRow`, `errBorder`, `BenefitCard`, `PaystubCalc`, `StepWrapUp`, `StepStub`, `estimateWeeklyGross`.

**State:** `formData` is flat; `update(patch)` merges via `setFormData(prev => ({ ...prev, ...patch }))`. `attempted` bool set on failed Next — triggers red borders/labels; resets on step change.

**On complete:** enforces DHL overrides (`payPeriodEndDay: 0, otThreshold: 40`), runs `buildYear`, derives `taxedWeeks` from `firstActiveIdx`, calls `onComplete`.

---

## Employer Preset Naming Convention

**Adopted 2026-04-29.** DHL is the first employer preset; the pattern generalizes to future partners (Amazon, FedEx, etc.).

| Variable | Meaning | Derived from |
|----------|---------|--------------|
| `isEmployerDHL` | User has the DHL employer preset | `config.employerPreset === "DHL"` |
| `isBaseUser` | User has no employer preset | `!isEmployerDHL` (currently; more precisely `!config.employerPreset`) |
| `isEmployerAmazon` | (future) User has Amazon preset | `config.employerPreset === "AMAZON"` |

**Rules:**
- Every component/function that gates on employer type must declare `const isEmployerDHL = config.employerPreset === "DHL"` locally (or receive it as a prop).
- Every component that gates base-user behavior must also declare `const isBaseUser = !isEmployerDHL` immediately after.
- Prop names follow the same pattern: `isEmployerDHL={isEmployerDHL}` (not `isDHL`).
- The Supabase column `is_dhl` (in `user_data`) intentionally keeps its legacy name — renaming it is a separate schema migration tracked in TODO. In JS, `loadUserData()` maps it to the `isEmployerDHL` property.
- Source-code comments say "base user" (not "non-DHL"). Doc files use whatever phrasing is clearest.

---

## UI Component Standards

### Shared Primitives (`src/components/ui.jsx`)
| Export | What it is | Key props |
|--------|-----------|-----------|
| `MetricCard` / `Card` | Static + interactive metric card | `label`, `val`, `sub`, `status` (`green\|gold\|red`), `onClick`, `rawVal`, `entranceIndex`, `span` |
| `NT` | Nav tab | `label`, `active`, `onClick` — teal fill when active |
| `VT` | View tab | Same as NT, smaller padding |
| `SmBtn` | Inline utility button | `children`, `onClick`, `c`, `bg` |
| `SH` | Section header | `children`, `color`, `right` — teal left-bar + uppercase |
| `iS` | Input style object | Spread onto `<input>` / `<select>` — JetBrains Mono, 16px |
| `lS` | Label style object | Spread onto `<label>` — 10px, 2px tracking, uppercase |

**Layout:** card gap `12px` · section `marginBottom` `20px` · card pad `18px 16px` (static) / `16px 18px` + `minHeight: 88px` (interactive).

**Button pattern:** CANCEL — bg-raised, text-secondary, border-subtle, radius 12px, pad 7px 14px, 10px uppercase. SAVE — bg-gold/green, color bg-base, radius 12px, pad 8px 16px, 10px bold uppercase.

### Numeric Input Standard
**Never coerce on `onChange`.** Use string draft state (`field ?? ""`); only `parseFloat` at commit (blur/save). For required fields, pass `attempted` bool — show red label + border + `↑ Required` when `attempted && fieldEmpty`. Reference implementation: `Field` + `errBorder` in SetupWizard.

### Animation Rules
- Entrance stagger: `entranceIndex` on MetricCard → `fadeSlideUp` 400ms, 80ms/card, capped 400ms
- Countup: `rawVal` → 0→target 1200ms on mount/change · value flash → gold 150ms, fades 600ms
- **No bounce, no spin, no scale-up on mount. Press = `scale(0.97)` only. All ≤ 500ms except countup.**

---

## UI Design System — Color Tokens (`src/index.css` `@theme`)
**Never use raw hex for accent, green, or red. Always reference tokens.**

| Token | Value | Role |
|-------|-------|------|
| `--color-bg-base` | `#05100c` | App shell background |
| `--color-bg-surface` | `#112c1f` | Card background |
| `--color-bg-raised` | `#163828` | Elevated surfaces, button hover |
| `--color-bg-gradient` | `linear-gradient(180deg, #091a11, #05100c)` | Header gradient |
| `--color-gold` / `--color-accent-primary` | `#00c896` | Active tabs, CTAs, section bars |
| `--color-green` | `#22c55e` | Income values, positive status |
| `--color-red` | `#ef4444` | Spend, negative, risk |
| `--color-deduction` | `#f4a4a4` | Soft deduction rows — same H=0° hue as `--color-red`, lightness ~80%; not harsh on dark. Candidate to replace `--color-red` in low-emphasis negative contexts. |
| `--color-warning` | `#f59e0b` | Warning / attention |
| `--color-text-primary` | `#e6f4ef` | Body text |
| `--color-text-secondary` | `#7fa39a` | Labels, sublabels |
| `--color-text-disabled` | `#4a645c` | Inactive / disabled |
| `--color-border-subtle` | `#1f3b31` | Card borders |
| `--color-border-accent` | `rgba(0,200,150,0.28)` | Accent borders |
| `--font-display` / `--font-sans` | `'Inter'` | Headings + body |
| `--font-mono` | `'JetBrains Mono'` | Inputs + data cells only |

**Status:** `green` = positive/ahead · `gold` = attention/mixed · `red` = risk/behind

**Pulse tokens (Phase 2 — not in index.css):** `--color-signal-blue` `#5B8CFF` · `--color-signal-purple` `#7C5CFF` · `--color-signal-glow` `rgba(124,92,255,0.25)` — reserved for AI insight overlay, do not use on Flow elements.

---

## Development Workflow
**30-min sprints, 4×/week.** Before: state the task clearly. After: commit + one-sentence summary.
- `docs/active-systems.md` — how every live system works
- `docs/TODO.md` — prioritized backlog
- `docs/account-reference.json` — Anthony's primary account ground truth

---

## Account Reference (`docs/account-reference.json`)
Three tiers: `db_record` (raw Supabase columns) → `computed_expectations` (what finance.js derives) → `ui_assertions` (what each panel displays). Derive `computed_expectations` from `db_record` — never fabricate. Update `last_updated` whenever config or account data changes.

---

## Testing
Runner: **Vitest**. Tests in `src/test/`. `vitest.config.js` is sandbox-safe — omits `@tailwindcss/vite`, `@rolldown/plugin-babel`, CSS processing (avoids native `.node` failures in CI).
```bash
npm run test:run      # single pass — use this to verify changes
npm test              # watch mode
npx vitest run -u     # update snapshots after DEFAULT_CONFIG changes
```
Reporter is `verbose` — Vitest 4's default misreports suite failures as "no tests." Do not use `-- --runInBand` (Jest flag, ignored by Vitest).

---

## Mobile Checklist
- [ ] No horizontal scroll at 390px / 375px · All tap targets ≥ 44×44px
- [ ] Font-size ≥ 16px on all inputs (prevents iOS zoom)
- [ ] Bottom nav clears `safe-area-inset-bottom` · PWA installs from Safari · Standalone mode active
- [ ] Dark status bar (black-translucent) · Dynamic Island / notch not obscured

---

## Environment Variables
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Naming Conventions
Files: kebab-case · Components: PascalCase · Utilities/hooks: camelCase · Database: snake_case

## Known Cleanup
- `index.html`: stale Google Fonts (DM Serif/Sans) · `<title>` "2026 Financial Dashboard" → "Authority Finance" · `apple-mobile-web-app-title` "Finance RPG" → "Authority Finance"
- `WeekConfirmModal.jsx`, `LoginScreen.jsx`, `ProfilePanel.jsx` — hardcoded hex colors not yet tokenized (tracked in TODO §10)
