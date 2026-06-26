# Clickable Component Hierarchy — Authority Finance

**Purpose:** Map every interactive (clickable / pressable) surface in the app so we can
roll out an Apple-style **flash + bounce** press animation section by section.
**Scope:** The entire authenticated app shell. **Excludes the Login screen only**
(`LoginScreen.jsx` and its pre-auth siblings — see [Excluded](#excluded)).

**Last updated:** 2026-06-26

---

## How clicks are wired today

Almost every interactive element is one of a handful of shapes. This matters: the
animation can be applied at the *primitive* level and inherited everywhere, rather
than touched at 500+ call sites.

| Funnel | Where defined | Press anim today? | Notes |
|--------|---------------|-------------------|-------|
| `MetricCard` / `Card` (button mode) | `ui.jsx` | ✅ `scale(0.97)` on `onPointerDown/Up/Leave` | The reference press behavior. Only this primitive animates today. |
| `NT` (nav tab) | `ui.jsx` | ❌ | Raw `<button>`, teal fill when active. |
| `VT` (view tab) | `ui.jsx` | ❌ | Raw `<button>`, smaller padding. |
| `SmBtn` (inline utility) | `ui.jsx` | ❌ | Raw `<button>`. |
| `SidebarNavItem` | `App.jsx` (local) | ❌ | Sidebar + drawer rows. |
| Bottom-nav buttons | `App.jsx` (local) | ❌ | `color` transition only. |
| Raw `<button>` / `<div onClick>` | every file | ❌ | ~515 onClick/button sites across 22 files. |

**Implication for the animation rollout:** wrapping/upgrading the five `ui.jsx`
primitives (`MetricCard`, `NT`, `VT`, `SmBtn`, + a new shared `Pressable`/CSS class)
covers the majority of taps. Raw buttons in `App.jsx` and panels are the long tail.
The current press scale already obeys the CLAUDE.md Animation Rules
(*"Press = `scale(0.97)` only … ≤ 500ms"*) — the flash+bounce must stay within that budget.

---

## Top-level tree

```
App (authenticated shell)
├── Chrome (persistent navigation)
│   ├── Desktop Sidebar              [≥768px]
│   ├── Mobile Header                [<768px]
│   ├── Mobile Drawer (slide-in)     [<768px]
│   └── Mobile Bottom Nav (pill)     [<768px]
├── Panels (one visible at a time, via viewStack)
│   ├── Home      → HomePanel
│   ├── Income    → IncomePanel
│   ├── Budget    → BudgetPanel
│   ├── Log       → LogPanel
│   └── Account   → ProfilePanel
├── Modals / Overlays
│   ├── WeekConfirmModal
│   ├── LifeEventMenu
│   ├── JobLossEntry
│   ├── ExpenseTriage
│   ├── SetupWizard            (first-run + life-event re-entry)
│   ├── PwaInstallModal
│   └── Job Loss banner + JobLossDashboard (inline, not modal)
├── Investor / Demo surfaces
│   ├── DemoAccountTree        (investor accounts 1–2, admin demo edit)
│   └── Investor account pills (drawer)
└── Admin-only surfaces  [isAdmin gate]
    ├── Admin Tools (sidebar + drawer inline)
    ├── Admin Tools slide-up sheet  [mobile]
    ├── Live State Inspector pill
    └── Week Inspector modal
```

---

## 1. Persistent chrome

### 1.1 Desktop Sidebar (`App.jsx`, `.sidebar`, ≥768px)
- **Sign-out** icon button
- **Unconfirmed-weeks badge** button → reopens WeekConfirmModal
- **Lock-date clear** button (admin, when locked)
- **Nav rows** (`SidebarNavItem`): Home · Income · Budget · Log · Account
- **Life Events** row → opens `LifeEventMenu`
- **Admin Tools** block (admin): Lock Date set/clear · Sync Push/Pull · Config JSON view/copy · DB Row fetch/view · Tax Weeks view · Demo 1 / Demo 2 toggles

### 1.2 Mobile Header (`App.jsx`, `.mobile-header`, <768px)
- **Hamburger** → opens drawer
- **Lock-date clear** (admin)
- **Notification bell** → reopens WeekConfirmModal (badge count overlay)

### 1.3 Mobile Drawer (`App.jsx`, `.drawer-slide`, <768px)
- **Backdrop** → closes drawer
- **Sign-out** + **Close (✕)** buttons
- **Nav rows** (`SidebarNavItem`): Home · Income · Budget · Log · Account
- **Life Events** row · **Install on home screen** row (when not standalone)
- **Investor account pills** 1 / 2 / 3* (investor only)
- **Admin Tools** block (mirrors sidebar)

### 1.4 Mobile Bottom Nav (`App.jsx`, `.mobile-bottom-nav`, <768px)
- Icon+label buttons: Home · Income · Budget · Log · Account · **Tools** (admin only)
- Wrapped in `LiquidGlass`; hidden via `body.modal-open`.

---

## 2. Panels

### 2.1 HomePanel (`HomePanel.jsx`)
- **Hero metric tiles** (`MetricCard` button mode) — *Next Check* → Log · *Net Worth Trend* → Income · *Budget Health* → Budget. **← already animated (scale).**
- **Goals section:** add goal · edit goal (inline) · delete goal (confirm) · reorder modal · reset-timeline modal · show-completed toggle · celebrate dismiss.
- Sign-out passthrough.

### 2.2 IncomePanel (`IncomePanel.jsx`)
- Summary metric tiles (`MetricCard`, some with `InsightRow`).
- **Show-extra / withholding toggle**.
- **Weekly rolling rows** — each week row clickable → Week Inspector (admin) via `onWeekInspect`.
- Swipeable stat stacks (`ScrollSnapRow`).

### 2.3 BudgetPanel (`BudgetPanel.jsx`)
- **View tabs** (`VT`): `overview` · `breakdown` · `loans`.
- **overview:** expense cards (drag-reorder, inline edit), category section headers (`SH`), add-expense.
- **breakdown:** Annual Projection (`SectionHeader`).
- **loans:** loan rows + payoff controls.

### 2.4 LogPanel (`LogPanel.jsx`)
- **Hero** (`PanelHero`) + event-type entry buttons.
- Per-entry **▼ chevron** expand (admin impact breakdown).
- Sections (`SectionHeader`): 401k Projections · PTO Accrual · DHL Attendance Bucket · Attendance Tracker.

### 2.5 ProfilePanel (`ProfilePanel.jsx`)
- Account/employment settings rows, **Schedule Override** (`SH`).
- Save/Cancel button pairs, install-PWA trigger, sign-out.

---

## 3. Modals / overlays

| Modal | File | Key clickables |
|-------|------|----------------|
| WeekConfirmModal | `WeekConfirmModal.jsx` | day toggles, confirm, skip, backdrop |
| LifeEventMenu | `LifeEventMenu.jsx` | life-event route options, close |
| JobLossEntry | `JobLossEntry.jsx` | activate, fields, close |
| ExpenseTriage | `ExpenseTriage.jsx` | per-expense pause/cancel/keep, close |
| SetupWizard | `SetupWizard.jsx` | step Next/Back, pills, toggles, benefit cards (~63 sites) |
| PwaInstallModal | `PwaInstallModal.jsx` | dismiss, platform steps |
| Job Loss banner | `App.jsx` inline | Triage Expenses · Back to Work · dismiss |

---

## 4. Admin-only surfaces (`isAdmin`)

- **Admin Tools slide-up sheet** (`.mobile-admin-sheet`): drag handle, close, Lock Date, Sync Push/Pull, Config JSON, DB Row Fetch/View, Tax Weeks View, Demo 1/2.
- **Live State Inspector** pill → expand/collapse 11-value card.
- **Week Inspector modal** → backdrop close, ✕ close (opened from Income week rows).

---

## Excluded

Per the request, the following pre-authentication surfaces are **out of scope** for the
animation rollout:

- `LoginScreen.jsx` — email/password, Google OAuth, investor-code, password-recovery modes.
- `InvestorRegister.jsx` — only reachable after a valid investor code on the login screen.

> These render *before* `authedUser` exists (`App.jsx` early returns), so they never
> mount alongside the authenticated shell.

---

## Candidate sections for the first animation test

Ranked by how cleanly they isolate the flash+bounce work:

1. **Home hero tiles** (`HomePanel` → `MetricCard`) — *recommended.* Already press-animates,
   single primitive, 3 visible tiles, every tap navigates so the effect is immediately
   visible. Lowest blast radius, highest signal.
2. **Bottom nav pill** (`App.jsx`) — 5–6 always-visible buttons, raw `<button>`, high tap
   frequency. Good real-world feel test but edits `App.jsx` directly.
3. **Budget view tabs** (`VT` in `BudgetPanel`) — exercises the `VT` primitive; tab switches
   give clear visual confirmation.

Once a section is chosen, we prototype the flash+bounce there, confirm it stays within the
≤500ms / `scale(0.97)` press budget from CLAUDE.md, then promote it into the shared `ui.jsx`
primitives for global rollout.
