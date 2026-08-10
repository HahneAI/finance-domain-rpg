# UX Animations — Tasks & Surface Map (Authority Finance)

**Purpose:** Single source of truth for the app's motion systems and their rollout across
every interactive surface. This file is the handoff doc — read the Quick Reference, then
the section for whatever you're working on.

Three motion systems:
1. **Press feedback** (tap fill + spring) — *shipped everywhere* (`ui.jsx` primitives + `Pressable`).
2. **Fold-up transitions** (page moves · modal open/close · dropdown open/close) — *broadly rolled out*, tail remaining.
3. **External / full-screen surfaces** (SetupWizard, LoginScreen, PWA install, demo-account switch) — *in progress, current focus.*

**Scope:** The authenticated app shell + the setup/login takeovers. **Last updated:** 2026-07-16

---

## 🔭 CURRENT FOCUS

Tuning the **4 external/full-screen "placement" animations**, biggest two first:
1. **SetupWizard** — ✅ step slides + takeover entrance shipped (being feel-tested). Remaining: takeover **exit** + failed-Next **shake**.
2. **LoginScreen** — ⬜ next up (mode crossfades, then login→dashboard handoff).
3. **PwaInstallModal** — ⬜ native `<dialog>` open/close.
4. **DemoAccountTree / investor account switch** — ⬜ mode swap.

Approach agreed with the user: **cover the placements first with sensible first-pass values,
tune the feel after they test.** Don't gold-plate before they've felt it in the app.

---

## ⚡ Quick Reference — the animation API

All primitives live in **`src/components/ui.jsx`**; all keyframes/tokens in **`src/index.css`**.

**Press feedback** (shipped): `Pressable` (drop-in `<button>`/`<div>`), `usePressFeedback()` +
`PressFlashOverlay`, `pressScaleStyle()`. Auto-derives a lighter same-family fill via
`deriveTapFillColor` (red→lighter red, gold→lighter gold…). Don't re-touch — it's done.

**Fold transitions** — driven by a `data-fold="entering|entered|exiting"` attribute:
| Helper / class | Use for |
|---|---|
| `useFoldTransition(open, {ms})` → `{ mounted, fold }` | Any show/hide surface. Gate render on `mounted`; put `data-fold={fold}` on the element. Keeps it mounted through the exit tween. |
| `FoldSwitch({activeKey, children})` | Cross-fade **page moves** (keeps outgoing panel through its exit). Wraps `App.jsx` `activePanel`. |
| `StepSlide({stepKey, direction, children})` | Direction-aware horizontal **wizard step** push/pop. |
| class `fold-modal` + `fold-backdrop` | Centered **modal** card (folds down-from-top on open, slides up-and-out on close) + its backdrop fade. |
| class `fold-scale` | Inline **dropdown/expander** reveal (ScaleY from top edge). |
| class `fold-lift` | **Page** lift+fade (used by `FoldSwitch`). |
| classes `step-in/out-*` | Wizard step slides (used by `StepSlide`). |

**Recipe — animate a new modal:**
```jsx
const fold = useFoldTransition(showX, { ms: 340 });   // 340 gives the 300ms card exit a buffer
{fold.mounted && createPortal(
  <div className="fold-backdrop" data-fold={fold.fold} onClick={close} style={{/* fixed inset:0 backdrop */}}>
    <div className="fold-modal" data-fold={fold.fold} onClick={e=>e.stopPropagation()} style={{/* card */}}>…</div>
  </div>, document.body)}
```
**Recipe — animate a new dropdown/expander:** wrap the revealed content in
`{fold.mounted && <div className="fold-scale" data-fold={fold.fold}>…</div>}` with
`useFoldTransition(open, {ms:280})`.

**Tokens (index.css):** `--ease-fold-smooth` (page enter), `--ease-fold-page-in` (page enter
overshoot), `--ease-fold-overshoot` (modal/dropdown enter), `--ease-fold-exit` (dropdown close),
`--ease-fold-modal-exit` (modal card close). Durations: `--fold-ms-page` 340 / `--fold-ms-page-out`
180 / `--fold-ms-modal` 280 / `--fold-ms-modal-out` 240 / `--fold-ms-modal-card-out` 300.
**Always** guard new keyframes with `@media (prefers-reduced-motion: reduce) { animation:none }`.

**Gotchas learned the hard way:**
- Never leave a lingering `transform`/`will-change` on a *settled* element — it makes a
  stacking context/containing block that traps the fixed bottom nav + portaled modals
  (this caused the Account-panel "nav opens the install modal" bug). Apply them only in the
  `entering`/`exiting` rules; settle to a clean `entered`/no-class state.
- Modal **exit** needs visible *travel* (the `fold-modal` slides up 30px) — a pure scale+fade
  over a fading backdrop reads as a "pop", not a fold.
- If you change an exit CSS duration, keep it **≤ the hook's `ms`** or the unmount clips the
  animation (looks like a pop).

## Git / environment context
- Branch: **`claude/click-animations-hierarchy-9ps15t`**. All this work lives here.
- The base **`Version-control`** moves fast and frequently absorbs our commits. When a merge
  conflict appears, it's almost always the same shape: **both sides edited an import line** →
  keep both imports. Resolve by rebasing onto `origin/Version-control`, then force-push with
  `--force-with-lease`. (Verify with `git merge-base --is-ancestor origin/Version-control HEAD`.)
- **Commits:** set `git config user.email noreply@anthropic.com` / `user.name Claude` before
  committing. A stop-hook will warn about "unverified" commits — that's just the missing GPG
  signature (no key in this sandbox); it's cosmetic, don't rewrite shared history over it.
- **Verify** with `npx vite build` + `npm run test:run`. Baseline: **3 `api/*` test files fail
  on a DB/env issue that is pre-existing and unrelated** — everything else must stay green.
**Last updated:** 2026-07-19

---

## The default tap-feedback system

**Standard:** every clickable surface uses the press feedback defined in `ui.jsx`.
Two cues, within the CLAUDE.md press budget (scale-only, ≤500ms):

1. **Family press fill** — a quick fill in a lighter shade of the target's **own**
   resting color (same hue family) that fades quickly (~180ms) back to the control's
   color. A red ✕/Cancel flashes lighter red, a teal tab lighter teal, a green Save
   lighter green, etc. The fill auto-derives at press time via `getComputedStyle` +
   HSL lightening (`deriveTapFillColor`), picking the most chromatic of the control's
   background/border/text. Pass `flashColor` to override; falls back to teal-bright
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
| Bespoke `<button>`s in **ProfilePanel** | `ProfilePanel.jsx` | ✅ on `Pressable` (all ~40: settings rows, email/password forms `type="submit"`, delete-account, Freedom Allowance On/Off + save, tax On/Off + past-week Taxed/Exempt toggles, edit/save/cancel, local sign-out confirm). `type`/`disabled`/hover handlers preserved via prop-forwarding + transition merge. |
| Persistent chrome + App-level overlays | `App.jsx` | ✅ on `Pressable` (all 48: sidebar/drawer nav rows via `SidebarNavItem`, hamburger, notification bell, sign-out, bottom nav, life-events/install, investor pills, admin tools in sidebar/drawer/sheet, live inspector pill, week inspector closes, lock-date clears). Sheet drag-handle is a `<div>` (untouched). |
| Modal + SetupWizard buttons | `WeekConfirmModal`, `LifeEventMenu`, `NewJobSeasonEntry`, `ExpenseTriage`, `PwaInstallModal`, `SetupWizard` | ✅ on `Pressable`. LifeEventMenu + NetWorthHealthTips had manual scale hacks (`onMouseDown`/`onPointerDown` mutating `transform`) — removed in favor of the standard feedback. |
| Aux components | `BenefitsPanel`, `DemoAccountTree`, `InvestorAdminPanel`, `ReemploymentTracker`, `NewJobSeasonDashboard`, `MonthQuarterSelector`, `NetWorthHealthTips` | ✅ on `Pressable` (`type="submit"` preserved; `<tr>` table rows left as-is). |

Because most panel tap targets funnel through the four `ui.jsx` primitives above,
**every panel already has baseline feedback.** The remaining work is the long tail of
bespoke raw `<button>`s, swept region by region.

### Rollout order (one region at a time)
1. ✅ Shared `ui.jsx` primitives (`VT`/`NT`/`SmBtn`/`MetricCard`) — baseline for all panels.
2. ✅ Panels, one at a time (bespoke buttons): ✅ Home → ✅ Income → ✅ Budget → ✅ Log → ✅ Account.
3. ✅ Persistent chrome + App-level overlays (bottom nav, hamburger, drawer, header, admin tools/inspectors — all in `App.jsx`).
4. ✅ Modals + SetupWizard + aux components (all converted to `Pressable`).

**Rollout complete.** Every clickable surface in the authenticated app now uses the
default press feedback. Only the excluded pre-auth screens (`LoginScreen`,
`InvestorRegister`) and two deliberate non-button skips — the expense **drag handle**
(`BudgetPanel`) and `<tr>` table rows — remain on raw elements.

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
│   ├── NewJobSeasonEntry            (up to 4 steps as of §1.H15)
│   ├── CashOnHandSheet         (bottom sheet, §1.H17 — shared by New Job Season Home + Budget)
│   ├── SetupWizard            (first-run + life-event re-entry)
│   ├── PwaInstallModal
│   └── New Job Season banner (inline, not modal — "Go to Budget" / "Back to Work" / dismiss)
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
| NewJobSeasonEntry | `NewJobSeasonEntry.jsx` | date/cash/benefits, pending-check step (§1.H15), expense review, due dates, activate, close |
| CashOnHandSheet | `CashOnHandSheet.jsx` | draft input, Save, Cancel, backdrop (§1.H17 — bottom sheet, not `fold-modal`) |
| SetupWizard | `SetupWizard.jsx` | step Next/Back, pills, toggles, benefit cards (~63 sites) |
| PwaInstallModal | `PwaInstallModal.jsx` | dismiss, platform steps |
| New Job Season banner | `App.jsx` inline | Go to Budget · Back to Work · dismiss |

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

---

# Fold-Up Transition System (page moves · modals · dropdowns)

Second motion system layered on top of the press-feedback rollout. A shared "fold"
entrance/exit for **page moves**, **modal open/close**, and **dropdown open/close** so
navigation across the app moves as one language. Tuned live in the Motion Lab.

## Locked decisions

| Surface | Variant | Enter direction | Exit direction | Duration | Easing |
|---------|---------|-----------------|----------------|----------|--------|
| **Page moves** | Lift + fade (translateY + opacity, subtle scale — no squish) | Up from bottom | Reverse (fade + settle back down) | **300 ms** | Smooth `cubic-bezier(0.2, 0.7, 0.2, 1)` |
| **Modals & dropdowns** | ScaleY fold (`transform-origin` edge, `scaleY`) | Down from top | Up toward top (reverse of enter) | **280 ms** | Slight overshoot `cubic-bezier(0.34, 1.32, 0.64, 1)` |

- **Enter AND exit are both required** (this release).
- Proposed easing tokens for `index.css`: `--ease-fold-smooth: cubic-bezier(0.2,0.7,0.2,1)` ·
  `--ease-fold-overshoot: cubic-bezier(0.34,1.32,0.64,1)`.
- **Open question (flag on implement):** overshoot on *close* can read as a bounce-out. If it
  feels off, swap modal/dropdown exit to a clean ease-in and keep overshoot on enter only.
- Reduced-motion: all folds collapse to instant (`prefers-reduced-motion: reduce`).

## Implementation approach

Exit animation means the element can't unmount immediately — it must stay mounted through the
close tween. So this is **not** pure CSS; it needs a small React helper:

- `useFoldTransition(open, { ms })` → returns `{ mounted, state }` where `state` is
  `entering | entered | exiting`; keeps `mounted` true until the exit tween finishes, then
  drops it. Drives a `data-fold` attribute the CSS keys off.
- Keyframes/classes in `index.css`: `foldScaleYIn/Out` (modals+dropdowns), `foldLiftIn/Out`
  (pages). Reuse the existing `.wc-modal-in` learnings.
- **Page moves** are the hardest: today `activePanel` swaps instantly on `currentView`
  (`App.jsx`). To cross-fade, the outgoing panel must persist during its exit — a
  `<FoldSwitch>` wrapper keyed on `currentView` that renders outgoing+incoming briefly.

## Surface catalog — everything to convert

### A. Page moves  (`App.jsx`)
- `activePanel` conditional renders — `currentView === "home"|"income"|"budget"|"log"|"profile"` (~L1191–1289).
- Navigation drivers: `navigate()` / `navigateDirect()` (L353, L362), `viewStack` push/pop.
- Panel-level swaps that also count as "page moves": `DemoAccountTree` replacing `activePanel` (~L1999, investor/admin demo); `UpgradePanel` swap for expired read-only (L1219, L1250).

### B. Modals & full overlays  (open → fold down from top · close → fold up to top)
| Surface | File:line | Notes |
|---------|-----------|-------|
| Week confirm | `WeekConfirmModal.jsx:652` (z60) | already has `.wc-modal-in` enter — replace with shared fold |
| Sharpen rates | `IncomePanel.jsx:123` (z200, portal) | |
| Missed-event info | `IncomePanel.jsx:227` (z210, portal) | |
| Week detail | `IncomePanel.jsx:495` (z1000, portal) | |
| Restore-deleted sheet | `BudgetPanel.jsx:2063` (z60) + `slideUpSheet` L2191 | currently bottom-sheet slide |
| Check-info | `BudgetPanel.jsx:2174` (z200) | |
| Delete-account dialog | `ProfilePanel.jsx:535` (z240) | |
| Local sign-out confirm | `ProfilePanel.jsx:2050` (z240) | |
| Week Inspector | `App.jsx:2575` (z300) | admin |
| Admin tools sheet | `App.jsx:2682` (z24, slide-up) | keep drag-to-dismiss |
| Mobile drawer | `App.jsx` `.drawer-slide` | slides on X — likely leave as-is (not a fold) |
| Life Events menu | `LifeEventMenu.jsx:72` (z70) | |
| Job-loss entry | `NewJobSeasonEntry.jsx:78` (z80) | up to 4 steps as of §1.H15; `ExpenseTriage.jsx` (this row used to also list it) was deleted in the §1.H7 rebuild — triage is now inline in `NewJobSeasonBudgetPanel`, a panel not a modal |
| Cash On Hand sheet | `CashOnHandSheet.jsx` (z90) | §1.H17 — new `.fold-sheet` class, not `fold-modal` |
| Upgrade modal | `UpgradeModal.jsx:11` (z1000, portal) | VC feature |
| Reorder goals | `HomePanel.jsx` (portal) | |
| Reset timeline | `HomePanel.jsx` (portal) | |
| PWA install | `PwaInstallModal.jsx` | opens via ref imperative handle |
| Setup wizard | `SetupWizard.jsx` | full-screen — evaluate (may want its own step transitions) |
| Ask Coach panel | `AskCoachPanel.jsx` (`askCoachOpen`) | VC §2.B chat panel — ✅ converted, `fold-lift` not `fold-modal` (full-screen, not a centered card) |
| Bulk edit | `BulkEditPanel.jsx` (`bulkEditOpen`) | |

### C. Dropdowns & expand/collapse reveal panels
The app has almost no native-popover dropdowns; its "dropdowns" are inline reveal panels
toggled by a trigger. These get the ScaleY fold (down from top / up to top).
- Admin sidebar/drawer/sheet: `configViewOpen`, `rowViewOpen`, `taxGridOpen` (`App.jsx`).
- `LogPanel`: `histOpen` (attendance history), `expandedImpact` (per-entry breakdown).
- `BudgetPanel`: `expandedCats`, `expandedExpId`, `showCalc`.
- `ProfilePanel`: `showEmailForm`, `showPwForm`, `showAddForm`, `showCalc`.
- `HomePanel`: `showCompleted` (funded history).
- `NetWorthHealthTips`: `open` (tips) — currently `fadeSlideUp`, migrate to shared fold.

### Out of scope
- **Native `<select>`** (BudgetPanel ×5, BulkEditPanel ×3, LogPanel ×2, ProfilePanel, others) —
  OS-rendered, cannot be animated.
- `MonthQuarterSelector` — a segmented selector bar, not an open/close surface.
- Mobile drawer X-slide — already has its own slide; fold would fight it.

## Rollout status

**System built** ✅ — `useFoldTransition` + `FoldSwitch` (`ui.jsx`); `foldLift*` (pages),
`foldScale*` (dropdowns), `fold-modal`/`foldModalOut` (modal cards with visible upward
travel on close), `foldBackdrop*` + easing/duration tokens (`index.css`). Reduced-motion
guarded. Tuned live via the Motion Lab.

**Page moves** ✅ — `App.jsx` `activePanel` wrapped in `<FoldSwitch>` (lift+fade, up from
bottom, 340ms enter w/ gentle overshoot, 180ms exit).

**Modals — converted (`fold-modal` + `fold-backdrop`, open/close both animate):**
- ✅ IncomePanel: missed-event, Sharpen-rates, Week Detail
- ✅ BudgetPanel: check-info
- ✅ ProfilePanel: delete-account, local sign-out confirm
- ✅ HomePanel: reorder goals, reset timeline
- ✅ LifeEventMenu · NewJobSeasonEntry (`ExpenseTriage` deleted in the §1.H7 rebuild — triage is
  now inline in `NewJobSeasonBudgetPanel`, not a modal)
- ✅ **CashOnHandSheet** (§1.H17) — a new fifth motion system, not `fold-modal`: bottom sheet
  using the new `.fold-sheet` class (up-from-bottom entrance / slide-down exit), shared by
  NewJobSeasonHomePanel + NewJobSeasonBudgetPanel
- ✅ **AskCoachPanel** (2026-07-25) — full-screen surface, not a centered dialog, so it took the
  `fold-lift` treatment (open/close) instead of `fold-modal`/`fold-backdrop`, same as
  SetupWizard/LoginScreen (see the "External / full-screen surfaces" section below). Close is
  driven by
  `App.jsx`'s `askCoachExiting` state + `closeAskCoachWithAnimation()`, mirroring
  `wizardExiting`/`closeWizardWithAnimation()` exactly. The panel's internal chat↔history view
  swap (History / Back / New Chat buttons) also got its own `fold-lift` entrance, applied
  directly via the `fold-lift` class + `data-fold` rather than through `FoldSwitch` — `FoldSwitch`
  assumes a page that fills its container on its own; AskCoachPanel's chat body is two flex
  siblings (message list + input bar) that need their column-flex relationship preserved through
  the swap, which was simpler to get right with a manually-driven `data-fold` than by fitting the
  content into `FoldSwitch`'s crossfade-overlay layout. Skipped on the view's first mount (a ref
  flag) so it doesn't double up with the panel's own entrance lift. Tests:
  `AskCoachPanel.test.jsx`'s "fold-lift animation wiring" block.
- ⬜ WeekConfirmModal (currently `.wc-modal-in`; migrate) · App Week Inspector · UpgradeModal
  (parent mounts/unmounts it — needs the toggle to drive `useFoldTransition`) · BulkEditPanel
- ⏭️ **Skip:** admin tools slide-up sheet (keep its drag-dismiss slide) · mobile drawer
  (X-slide) · PwaInstallModal (native `<dialog>`, top layer)

**Dropdowns / expanders — converted (`fold-scale`):**
- ✅ HomePanel funded-history · NetWorthHealthTips · LogPanel attendance history
- ⬜ LogPanel per-entry impact · Budget expense/category expanders · admin Config/DB-Row/Tax
  toggles (rendered in 3 places each)
- ⚠️ ProfilePanel email/password forms are **swaps** (`!show ? trigger : form`), not reveals —
  need a crossfade, not the fold-reveal pattern.

## External / full-screen surfaces (own treatment, outside the fold system)
These are mode takeovers with their own internal navigation — not modal/dropdown/page-move.
Order: the two large ones first, then the two smaller.
1. **SetupWizard** — ✅ *complete: step slides + entrance/exit + validation shake.*
   - Step slides: `StepSlide` component (direction-aware horizontal push/pop, `step-in/out-*` 
     keyframes) driven by `stepDir` (Next/Skip = forward, Back = back). Consistent across 
     normal and job-loss paths.
   - Entrance: wizard card fades in + rises (`foldLiftIn`, 340ms, gentle overshoot).
   - Exit: fold-lift downward + fade exit (`foldLiftOut`, 180ms) driven by `wizardExiting` 
     state in App.jsx. `closeWizardWithAnimation()` helper manages the lifecycle: sets 
     wizardExiting, waits for animation, then unmounts.
   - Validation shake: when `attempted` becomes true (failed Next), card shakes horizontally 
     (`validationShake`, 400ms, ease-out). Respects prefers-reduced-motion.
   - **GRANDER FIRST-MOUNT ENTRANCE (optional)** — current entrance uses `foldLiftIn` 
     (340ms); could consider a more standout first-run entrance (e.g., stagger header + 
     step counter + intro text separately) to emphasize onboarding importance. Test feel 
     if prioritized.
2. **LoginScreen** — ✅ *complete: mode crossfades + login→dashboard handoff.*
   - Mode crossfades: `ModeFade` component (`login-fade-*` classes, 200ms ease-out/in). All mode 
     transitions smooth: signin ↔ signup ↔ forgot ↔ revive ↔ info ↔ recovery.
   - Login→dashboard handoff: `postLoginFade` state (App.jsx) triggers 340ms transition when 
     `authedUser` becomes truthy. LoginScreen fades out (fold-lift exiting) while authenticated 
     shell fades in (fold-lift entering) using shared animations. Smooth visual continuity 
     across the auth unmount boundary.
   - Test status: **1119/1119 passing** ✅ (revival form timing issue fixed).
   - Ready for manual feature verification (all animations).
3. **PwaInstallModal** — ⬜ native `<dialog>`; needs a `<dialog>`-level open/close animation.
4. **DemoAccountTree / investor account switch** — ⬜ mode swap that bypasses `FoldSwitch`.

---

## New Job Season — Complete Component Audit (✅ VERIFIED 2026-07-24, updated 2026-07-25)

**Summary:** All New Job Season buttons use the `Pressable` design class, and all modals/sheets use standardized fold animations. **Updated 2026-07-25** to add §1.H15's pending-check wizard step, §1.H17's `CashOnHandSheet` (the first bottom sheet in the app with a real animated exit, not just entrance), and DW-8's `CoachNetWorthCard` mount inside `NewJobSeasonHomePanel` — none of these existed at the original 2026-07-24 audit. **1 non-critical inconsistency** from the original pass (RateUpdateModal's custom animation) has since been refactored onto the standard fold system (`e25b7b4`) and is no longer open.

### Audit Coverage

**Modals (fold-modal + fold-backdrop + data-fold attribute):**
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| NewJobSeasonEntry | `src/components/NewJobSeasonEntry.jsx` | ✅ | Up to 4-step modal (date/cash/benefits → pending-check, §1.H15 → expense review → due dates; steps 2–3 skip with no expenses). All buttons `Pressable`. Uses `fold-backdrop` + `fold-modal` with proper `data-fold` lifecycle. |
| LifeEventMenu | `src/components/LifeEventMenu.jsx` | ✅ | Life event selector modal. Close X + all route tiles use `Pressable`. Standardized fold animation. |
| RateUpdateModal | `src/components/RateUpdateModal.jsx` | ✅ | On `fold-modal` + `fold-backdrop` via `useFoldTransition`. All buttons `Pressable`. |

**Bottom sheets (fold-sheet + fold-backdrop + data-fold attribute — new class, §1.H17):**
| Component | File | Status | Notes |
|-----------|------|--------|-------|
| CashOnHandSheet | `src/components/CashOnHandSheet.jsx` | ✅ | Single-line editor shared by NewJobSeasonHomePanel's Cash On Hand card and NewJobSeasonBudgetPanel's equivalent row. Uses the new `.fold-sheet` class (`index.css`) — up-from-bottom entrance (matches `BudgetPanel`'s pre-existing expense-detail sheet curve), slide-down exit (that older sheet never had one — instant unmount on close; this is the first sheet with a real symmetric pair). |

**Panels (panel mode, rendered via FoldSwitch):**
| Component | File | Status | All buttons Pressable? |
|-----------|------|--------|----------------------|
| NewJobSeasonHomePanel | `src/components/NewJobSeasonHomePanel.jsx` | ✅ | Yes (Cash On Hand card §1.H17, Log Income, Remove Entry, MetricCard headline, embedded CoachNetWorthCard's dismiss — DW-8). Uses `FoldSwitch` panel mode. |
| NewJobSeasonBudgetPanel | `src/components/NewJobSeasonBudgetPanel.jsx` | ✅ | Yes (Cash On Hand row §1.H17, benefit toggle, add/edit/delete expense, pause flexible, status change buttons). Uses `FoldSwitch` panel mode. |

**Embedded components in New Job Season:**
| Component | File | Status | All buttons Pressable? |
|-----------|------|--------|----------------------|
| ReemploymentTracker | `src/components/ReemploymentTracker.jsx` | ✅ | Yes (commit target, clear target, edit application ×4, delete application, apply filters). CRUD operations for job applications. |
| CoachNetWorthCard | `src/components/CoachNetWorthCard.jsx` | ✅ | Yes (dismiss). Mounted inside `NewJobSeasonHomePanel` since DW-8 (`docs/BUG_FIX_TODO.md`) — Red tier only from this mount; no own open/close animation (renders inline, unmounts via the tier condition). |

### Cross-component consistency table

| Animation Type | Component | File | Pattern | Duration | Status |
|---|---|---|---|---|---|
| **Modal open/close** | NewJobSeasonEntry | NewJobSeasonEntry.jsx | `fold-modal` + `fold-backdrop` + `data-fold={fold.fold}` | 280ms modal, 240ms backdrop | ✅ |
| **Modal open/close** | LifeEventMenu | LifeEventMenu.jsx | `fold-modal` + `fold-backdrop` + `data-fold={fold.fold}` | 280ms modal, 240ms backdrop | ✅ |
| **Modal open/close** | RateUpdateModal | RateUpdateModal.jsx | `fold-modal` + `fold-backdrop` + `data-fold={fold.fold}` | 280ms modal, 240ms backdrop | ✅ |
| **Sheet open/close** | CashOnHandSheet | CashOnHandSheet.jsx | `fold-sheet` + `fold-backdrop` + `data-fold={fold.fold}` | 320ms enter, 240ms exit | ✅ |
| **Button press** | All New Job Season modals/sheets | NewJobSeasonEntry.jsx, LifeEventMenu.jsx, RateUpdateModal.jsx, CashOnHandSheet.jsx | `Pressable` + press feedback | 180ms fill + spring | ✅ |
| **Button press** | All New Job Season panels | NewJobSeasonHomePanel.jsx, NewJobSeasonBudgetPanel.jsx | `Pressable` + press feedback | 180ms fill + spring | ✅ |
| **Panel enter/exit** | NewJobSeasonHomePanel, NewJobSeasonBudgetPanel | App.jsx (FoldSwitch) | `fold-lift` + fade | 340ms enter, 180ms exit | ✅ |

### Test coverage
New Job Season features are exercised in:
- `SetupWizard` — life-event routing (`lifeEvent="lost_job"` path)
- `NewJobSeasonEntry` — up to 4-step modal flow, including the §1.H15 pending-check step
- `NewJobSeasonHomePanel` — panel rendering when `config.newJobSeasonMode === true`, Cash On Hand
  card + sheet (§1.H17), Coach presence (DW-8)
- `NewJobSeasonBudgetPanel` — alternate budget view in job-loss state, Cash On Hand row + sheet
- Full suite (all of `newJobSeasonFlow.test.jsx` + `newJobSeasonRunway.test.js`): 100+ New Job Season
  tests, part of the app-wide 1231/1231 passing as of 2026-07-25 (see full-suite count
  below — this per-feature count is a floor, not the whole file's total).

All buttons verified for `Pressable` + all modals/sheets verified for fold animations.

---

## Animation Systems — Complete Reference

Five motion systems live in the codebase:

| System | Purpose | Key Components | Duration | Files |
|--------|---------|-----------------|----------|-------|
| **Press Feedback** | Tactile response on every clickable | `Pressable` component (ui.jsx); `usePressFeedback()` hook; `pressScaleStyle()` utility | 180ms fill, scale spring ~200ms | `src/components/ui.jsx`, `src/index.css` (.press-fill, .press-scale) |
| **Fold Transitions** | Page enters/exits, modals, dropdowns | `useFoldTransition()` hook, `FoldSwitch` wrapper, fold-* keyframes | 340ms enter, 180ms exit | `src/components/ui.jsx`, `src/index.css` (@keyframes foldLiftIn/Out, foldScaleIn/Out, etc.) |
| **Bottom Sheets** *(new, §1.H17)* | Single-purpose editors that slide up from the bottom edge | `useFoldTransition()` (same hook, new `.fold-sheet` class) | 320ms enter, 240ms exit | `src/components/CashOnHandSheet.jsx`, `src/index.css` (@keyframes foldSheetIn/Out) — `BudgetPanel.jsx`'s older expense-detail sheet still uses a bespoke inline `<style>` keyframe with entrance only, not yet migrated onto this class |
| **SetupWizard Lifecycle** | Onboarding flow animations | `StepSlide` component (direction-aware), `wizardExiting` state, `closeWizardWithAnimation()` | 300ms steps, 340ms enter, 180ms exit, 400ms shake | `src/components/SetupWizard.jsx`, `src/App.jsx` (wizardExiting state), `src/index.css` (.validation-shake) |
| **LoginScreen Transitions** | Auth form and handoff | `ModeFade` component (mode crossfades), `postLoginFade` state | 200ms mode fade, 340ms auth handoff | `src/components/LoginScreen.jsx`, `src/App.jsx` (postLoginFade state), `src/index.css` (.login-fade-in/out) |

**Test coverage:** 1231/1231 tests passing ✅ (as of 2026-07-25 — see `docs/TODO.md` §1.H17)
**Ready for:** Manual feature verification (all animations together).

---

**Tuning notes (revisit later):** page-enter distance/duration, modal-close travel, and the
wizard step-slide distance (38px) / durations are first-pass values; overhead pass pending
per the "cover first, tune later" plan. Wizard step scroll-reset between steps is a known
rough edge to revisit.

---

## Typography — Text Utility Class Rollout & Audit Map

**Purpose:** same job as the animation Surface Map above, for text sizing instead of motion.
Non-numeric text (labels, sublabels, descriptions, list summaries) should reference one of the
`text-*` utility classes below instead of a hardcoded inline `fontSize` — one place to tune the
smallest tiers instead of hundreds of scattered px literals. Large numeric emphasis (MetricCard
values, dollar totals, computed readouts) is explicitly out of scope; it keeps its own
per-component sizing. **Last updated:** 2026-08-10.

### The classes (`src/index.css`)

| Class | Size | Was | Status |
|---|---|---|---|
| `.text-2xs` | 10px | 9px (bumped) | shipped, in use |
| `.text-xs` | 11px | 10px *and* 11px (bumped — the two raw sizes collapsed into one class) | shipped, in use |
| `.text-sm` | 12px | 12px (unchanged) | shipped, in use |
| `.text-base` | 13px | 13px (unchanged) | shipped, defined, **not yet referenced anywhere** |
| `.text-md` | 14px | 14px (unchanged) | shipped, defined, **not yet referenced anywhere** |
| `.heading-xl` | 700 / 0.04em / 1.15 | — | shipped, parity class, **not yet referenced anywhere** |
| `.heading-lg` | 800 / -0.02em / 1.25 | — | shipped, parity class, **not yet referenced anywhere** |

### Where the classes are displayed today

All current usage is in `src/components/ui.jsx`'s shared primitives — meaning every panel that
renders these components already benefits, without the panel's own file being touched:

| Component (ui.jsx) | Class | Renders on |
|---|---|---|
| `lS` (shared label style object) | `.text-xs` (11px, set directly on the object, not a className) | Every form label across SetupWizard, ProfilePanel, BudgetPanel, LogPanel, IncomePanel |
| `Card` / `MetricCard` — label | `.text-2xs` | Every metric tile: Home, Income, Budget, Log |
| `Card` / `MetricCard` — sub | `.text-xs` (button variant) / `.text-sm` (default) | Metric tile sublines app-wide |
| `SH` (section header) — title | `.text-xs` | Every `<SH>` section eyebrow across all 5 panels |
| `SH` — right-aligned slot | `.text-sm` | Section header counts/totals (e.g. "3/4", "$X avg") |
| `PanelHero` — eyebrow | `.text-2xs` | Page-level hero eyebrows (Income, Budget, Account, Tester Homebase, Money Moves) |
| `SectionHeader` — sub | `.text-xs` | Sub-line under in-panel section titles |
| `NT` (nav tab) | `.text-xs` | Top-level nav tabs |
| `VT` (view tab) | `.text-xs` | Sub-view tabs (e.g. Budget's Overview/Breakdown/Loans) |
| `SmBtn` | `.text-xs` | Small inline utility buttons app-wide |
| `InsightRow` + its arrow glyph | `.text-xs` | Pulse insight chips on metric cards |

### Panels still needing audit — isolated (non-utility-class) text

Everything below still has its own inline `fontSize: "Npx"` literals in the 9–14px range,
independent of the `ui.jsx` primitives above. Counts are raw `fontSize` occurrences in that
size range per file (2026-08-10 grep), not a precise "needs conversion" count — some are
legitimately one-off (e.g. dynamic ternaries) and won't map cleanly to a single class. Audit
each file, convert what's a clean fit, and note anything that isn't.

| File | Raw 9–14px instances | Panel/surface |
|---|---|---|
| ~~`ProfilePanel.jsx`~~ | **0** (was 175) — ✅ converted 2026-08-10 | Account |
| ~~`LogPanel.jsx`~~ | **0** (was 130) — ✅ converted 2026-08-10 | Log |
| ~~`App.jsx`~~ | **0** (was 122) — ✅ converted 2026-08-10 | Shell / nav / admin toolkit / modals hosted at the root |
| ~~`BudgetPanel.jsx`~~ | **0** (was 105) — ✅ converted 2026-08-10 | Budget |
| `SetupWizard.jsx` | 97 | Onboarding |
| `WeekConfirmModal.jsx` | 75 | Weekly check-in modal |
| ~~`HomePanel.jsx`~~ | **0** (was 44) — ✅ converted 2026-08-10 | Home |
| `BulkEditPanel.jsx` | 35 | Budget (bulk expense edit) |
| ~~`IncomePanel.jsx`~~ | **0** (was 29) — ✅ converted 2026-08-10 | Income |
| `NewJobSeasonEntry.jsx` | 28 | New Job Season |
| `InvestorAdminPanel.jsx` | 25 | Investor demo |
| `NewJobSeasonBudgetPanel.jsx` | 17 | New Job Season |
| `ReemploymentTracker.jsx` | 16 | New Job Season |
| `LoginScreen.jsx` | 16 | Auth |
| `NewJobSeasonHomePanel.jsx` | 12 | New Job Season |
| `BetaHomebase.jsx` | 12 | Beta Homebase / Money Moves (shared exports) |
| `ReviveScreen.jsx` | 11 | Subscription revival |
| `DemoAccountTree.jsx` | 9 | Investor demo |
| `ChangelogModal.jsx` | 9 | What's New modal |
| `AskCoachPanel.jsx` | 9 | Coach |
| `UpgradeCard.jsx` | 8 | Paywall |
| `RateUpdateModal.jsx` | 8 | Profile (rate change) |
| `InvestorRegister.jsx` | 7 | Investor demo |
| `TipsCommissionCheckIn.jsx` | 6 | Home check-in card |
| `ResumeReviewCard.jsx` | 6 | New Job Season |
| `NetWorthHealthTips.jsx` | 6 | Home |
| `ConsentGateModal.jsx` | 6 | Legal re-consent modal |
| `SetupWizardAdlib.jsx` | 5 | Admin-only wizard pilot |
| `ProductivityHub.jsx` | 5 | Money Moves |
| `JobHuntChatPanel.jsx` | 5 | New Job Season |
| `UpdateAvailableBanner.jsx` | 4 | PWA update banner |
| `TrialExplainerScreen.jsx` | 4 | Trial onboarding |
| `CashOnHandSheet.jsx` | 4 | New Job Season |
| `TrialBanner.jsx` | 3 | Paywall |
| `SaveFailedBanner.jsx` | 3 | Persistence error banner |
| `LifeEventMenu.jsx` | 3 | Account |
| `DueDatePicker.jsx` | 3 | Budget |
| `CoachNetWorthCard.jsx` | 3 | Coach |
| `BetaSignupNoticeBanner.jsx` | 2 | Beta program |
| `MonthQuarterSelector.jsx` | 1 | Budget |
| `LegalDocumentModal.jsx` | 1 | Legal document modal (title already migrated; this is body text) |
| `ui.jsx` | 1 | `Card`'s dynamic `size` prop — numeric emphasis, intentionally out of scope |

**Suggested audit order:** highest-traffic panels first — `ProfilePanel` ✅, `LogPanel` ✅,
`App.jsx` ✅, `BudgetPanel` ✅, `HomePanel` ✅, `IncomePanel` ✅ — all 5 main panels + the app
shell are now fully converted. Remaining: `SetupWizard.jsx`, `WeekConfirmModal.jsx`, then the
lower-traffic surfaces (New Job Season, Investor demo, admin-only screens). Convert one file at a
time, run the test suite after each, and update this table's count (or strike the row) as each
file's cleanly-convertible instances land.

**Conversion method (established on `ProfilePanel.jsx`, 2026-08-10):** a scripted regex pass
handles the mechanical bulk — locate `<Tag ... style={{ ...fontSize: "Npx"... }}>` where the tag
has no pre-existing `className`, drop the `fontSize` entry, and inject the matching `className`
(size→class mapping is the same table as above). Three known gaps the script doesn't safely
handle and need hand-fixing per file: (1) arrow-function attributes (`onClick={() => ...}`)
contain a literal `>` that a naive tag-boundary regex misreads as the JSX close — match `=>`
as an allowed exception; (2) multi-line style objects containing a template literal (backtick
`` ` ``) or nested `{}` (e.g. a conditional `border: \`1px solid ${...}\``) can break a
brace-counting body match — worth a quick manual pass rather than fighting the regex further;
(3) a tag that already has a `className` (e.g. `<table className="data-table" style={{
fontSize: "12px", ... }}>`, found twice in `LogPanel.jsx`) is skipped by design — merge the size
class into the existing string by hand (`className="data-table text-sm"`) rather than adding a
second `className` attribute. Always finish with `npx eslint <file>`, `npm run test:run`, and a
real `npx vite build` (lint alone won't catch every JSX malformation from a scripted edit).
