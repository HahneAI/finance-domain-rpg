# Clickable Component Hierarchy — Authority Finance

**Purpose:** Map every interactive (clickable / pressable) surface in the app so we can
roll out an Apple-style **flash + bounce** press animation section by section.
**Scope:** The entire authenticated app shell. **Excludes the Login screen only**
(`LoginScreen.jsx` and its pre-auth siblings — see [Excluded](#excluded)).

**Last updated:** 2026-06-26

---

## The default tap-feedback system

**Standard:** every clickable surface uses the press feedback defined in `ui.jsx`.
Two cues, within the CLAUDE.md press budget (scale-only, ≤500ms):

1. **Family press fill** — a quick fill in a lighter shade of the target's **own**
   resting color (same hue family) that fades quickly (~180ms) back to the control's
   color. A red ✕/Cancel flashes lighter red, a gold tab lighter gold, a green Save
   lighter green, etc. The fill auto-derives at press time via `getComputedStyle` +
   HSL lightening (`deriveTapFillColor`), picking the most chromatic of the control's
   background/border/text. Pass `flashColor` to override; falls back to gold-bright
   when no usable color is found. This is the primary cue.
2. **Scale spring** — a subtle `scale(0.94)` press-in with a gentle overshoot spring
   back. Supporting cue.

**Building blocks (all exported from `ui.jsx`):**

| Export | Use it when |
|--------|-------------|
| `<Pressable as="button" …>` | New or refactored call sites — drop-in for `<button>`/`<div onClick>`. Bakes in the fill + spring; forwards `style`/`onClick`/`aria`/`disabled`. |
| `usePressFeedback()` → `{ pressed, lit, handlers }` + `<PressFlashOverlay lit={lit} />` | A component must keep its own element/state but wants identical feedback (e.g. `MetricCard`). Parent needs `position:relative; overflow:hidden; isolation:isolate`. |
| `pressScaleStyle(pressed)` | Just the transform/transition for the scale spring. |

**Mechanics:** the green fill is a `<span>` overlay at `zIndex:-1` (paints over the
control's background, behind its text/icons), clipped to the radius by `overflow:hidden`,
contained by `isolation:isolate`. A short `lit` timer keeps the fill up briefly after
release so fast taps still register.

## How clicks are wired — rollout status

| Funnel | Where | Status |
|--------|-------|--------|
| `VT` (view tab) | `ui.jsx` | ✅ on default system (prototype surface) |
| `NT` (nav tab) | `ui.jsx` | ✅ on default system (via `Pressable`) |
| `SmBtn` (inline utility) | `ui.jsx` | ✅ on default system (via `Pressable`) |
| `MetricCard` / `Card` (button mode) | `ui.jsx` | ✅ on default system (`usePressFeedback` + overlay; `scale(0.97)` for the larger surface) |
| `SidebarNavItem` | `App.jsx` (local) | ⬜ pending (nav-bar pass) |
| Bottom-nav buttons | `App.jsx` (local) | ⬜ pending (nav-bar pass) |
| Hamburger / drawer / header buttons | `App.jsx` | ⬜ pending (nav-bar pass) |
| Bespoke `<button>`s in **HomePanel** | `HomePanel.jsx` | ✅ on `Pressable` (goal add/edit/delete, reorder ↑↓/done, reset-timeline, show-completed) |
| Bespoke `<button>`s in **IncomePanel** | `IncomePanel.jsx` | ✅ on `Pressable` (sharpener cancel/confirm, event-loss close, sharpen-rates, info, full-detail, ✕). Week rows skipped — admin-only diagnostics; desktop rows are `<tr>` (can't host the overlay). |
| Bespoke `<button>`s in **BudgetPanel** | `BudgetPanel.jsx` | ✅ on `Pressable` (add expense/loan, edit/restore, expense-sheet save-scope/edit/delete/cancel, check-info + restore-sheet closes, inline editor SAVE/CANCEL). **Expense drag handle left as raw `<button>`** — it's a drag initiator (`data-expense-drag-handle`, `cursor:grab`), so press feedback would fight the DnD system. |
| Bespoke `<button>`s in **LogPanel** | `LogPanel.jsx` | ✅ on `Pressable` (all 22: + Log Event, save/cancel/confirm flows, day + extra-day toggles, per-entry edit/delete + impact chevron, attendance-history toggle, PTO form save/cancel). No drag handles to skip. |
| Bespoke `<button>`s in **ProfilePanel** | `ProfilePanel.jsx` | ✅ on `Pressable` (all ~40: settings rows, email/password forms `type="submit"`, delete-account, buffer On/Off + save, tax On/Off + past-week Taxed/Exempt toggles, edit/save/cancel, local sign-out confirm). `type`/`disabled`/hover handlers preserved via prop-forwarding + transition merge. |
| Persistent chrome + App-level overlays | `App.jsx` | ✅ on `Pressable` (all 48: sidebar/drawer nav rows via `SidebarNavItem`, hamburger, notification bell, sign-out, bottom nav, life-events/install, investor pills, admin tools in sidebar/drawer/sheet, live inspector pill, week inspector closes, lock-date clears). Sheet drag-handle is a `<div>` (untouched). |
| Modal / SetupWizard buttons | modal files | ⬜ pending (modal pass) |

Because most panel tap targets funnel through the four `ui.jsx` primitives above,
**every panel already has baseline feedback.** The remaining work is the long tail of
bespoke raw `<button>`s, swept region by region.

### Rollout order (one region at a time)
1. ✅ Shared `ui.jsx` primitives (`VT`/`NT`/`SmBtn`/`MetricCard`) — baseline for all panels.
2. ✅ Panels, one at a time (bespoke buttons): ✅ Home → ✅ Income → ✅ Budget → ✅ Log → ✅ Account.
3. ✅ Persistent chrome + App-level overlays (bottom nav, hamburger, drawer, header, admin tools/inspectors — all in `App.jsx`).
4. ⬜ Modals + SetupWizard buttons (`WeekConfirmModal`, `LifeEventMenu`, `JobLossEntry`, `ExpenseTriage`, `PwaInstallModal`, `SetupWizard`).

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
