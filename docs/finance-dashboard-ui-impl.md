# Finance Dashboard — UI Implementation Status

**DHL/P&G Finance RPG · Implementation confirmation through Priority 4**

Mirror of `docs/finance-dashboard-ui-spec` — each section confirms what is
actually live in the codebase, where it lives, and what (if anything) differs
from the spec.

---

## Color System

**Status: ✅ Complete**

**Definition file:** `src/index.css` — `@theme` block (lines 3–35)

```css
@theme {
  /* Backgrounds */
  --color-bg-base:    #0a0a0a;   /* app shell / page background */
  --color-bg-surface: #111814;   /* card background (green-tinted dark) */
  --color-bg-raised:  #1a2118;   /* elevated card, button hover */

  /* Gold */
  --color-gold:        #c9a84c;
  --color-gold-muted:  #8a6e2f;
  --color-gold-bright: #f0c040;

  /* Green */
  --color-green:       #4caf7d;
  --color-green-muted: #2d6b4a;

  /* Red */
  --color-red:         #e05c5c;
  --color-red-muted:   #7a2d2d;

  /* Text */
  --color-text-primary:   #f0ede6;
  --color-text-secondary: #8a9080;
  --color-text-disabled:  #444c40;

  /* Borders */
  --color-border-subtle: #1e2b1e;
  --color-border-accent: rgba(201,168,76,0.2);

  /* Fonts */
  --font-display: 'DM Serif Display', Georgia, serif;
  --font-sans:    'DM Sans', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', 'Courier New', monospace;
}
```

**Propagation:** Every JSX file — `ui.jsx`, `HomePanel.jsx`, `IncomePanel.jsx`,
`BudgetPanel.jsx`, `BenefitsPanel.jsx`, `LogPanel.jsx`, `WeekConfirmModal.jsx`,
`App.jsx`, `src/constants/config.js` — references these vars. No raw hex accent
values remain for gold, green, or red. Background and text values are also
fully tokenised.

**Opacity variants** (used inline for tinted borders/backgrounds):

| Usage | Value |
|-------|-------|
| Gold 40% | `rgba(201,168,76,0.4)` |
| Gold 27% | `rgba(201,168,76,0.27)` |
| Gold accent border | `var(--color-border-accent)` |
| Green 33% | `rgba(76,175,125,0.33)` |
| Green 27% | `rgba(76,175,125,0.27)` |
| Red 33% | `rgba(224,92,92,0.33)` |
| Red 13% | `rgba(224,92,92,0.13)` |

**Color roles enforced:**

- Hero numbers → `var(--color-gold)` or `var(--color-green)`
- Negative/spend → `var(--color-red)`
- Card backgrounds → `var(--color-bg-surface)`
- Labels/sublabels → `var(--color-text-secondary)`
- Section headers → `var(--color-text-primary)` + gold left border
- Inactive/disabled text → `var(--color-text-disabled)`

---

## Typography

**Status: ✅ Complete**

**Font loading:** `index.html` — Google Fonts `<link>` (lines 60–62)

```
DM Serif Display (display/hero numbers)
DM Sans 300/400/500/600 (UI body)
JetBrains Mono 400/500/700 (data tables)
```

**CSS vars:** `src/index.css` `@theme` block

```
--font-display: 'DM Serif Display', Georgia, serif
--font-sans:    'DM Sans', system-ui, sans-serif
--font-mono:    'JetBrains Mono', 'Courier New', monospace
```

**Applied usage:**

| Role | Where applied | Font | Size |
|------|--------------|------|------|
| Hero tile number | `MetricCard` val div (isButton=true) | DM Serif Display | `size` prop, default `30px` for HomePanel tiles |
| Card value | `MetricCard` val div (isButton=false) | DM Serif Display | `size` prop, default `22px` |
| Card label | `MetricCard` label div | DM Sans (inherited) | `10px`, `letter-spacing: 2.5px`, uppercase |
| Card sublabel | `MetricCard` sub div | DM Sans (inherited) | `10px`–`11px` |
| Tab buttons (NT/VT) | `ui.jsx` NT/VT | DM Sans (inherited) | `11px`, `letter-spacing: 2px`, uppercase |
| Section header | `ui.jsx` SH | DM Sans (inherited) | `11px`, `letter-spacing: 3px`, uppercase |
| Input fields | `ui.jsx` iS | JetBrains Mono | `16px` |
| Data tables | Various panels inline | JetBrains Mono | `11px`–`13px` |

**Rule confirmed:** Monospace is used only in `iS` (inputs) and explicit data
table `<td>` cells. No body text or labels use monospace.

---

## Spacing & Layout

**Status: ✅ Complete**

**Card gaps** (all `display:grid` card grid wrappers):
`gap: "12px"` — applied in HomePanel, IncomePanel, BudgetPanel,
BenefitsPanel, LogPanel.

**Section gaps** (card grid wrapper `marginBottom`):
`marginBottom: "20px"` — bumped from 14px across all card grid sections.

**Card padding** (inside `MetricCard`):
- Static mode: `18px 16px`
- Interactive/tile mode: `16px 18px` + `minHeight: "88px"`

**Panel outer padding** — set per-panel inline (typically `16px`–`20px`).

---

## Component Patterns

**Status: ✅ Complete**

All components live in `src/components/ui.jsx`.

---

### MetricCard

**File:** `src/components/ui.jsx` (lines 34–90)
**Alias:** `Card` exported for backward-compat (line 93)

Single component handles both static display and interactive tile modes.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | string | — | Uppercase label at top |
| `val` | string/node | — | Hero number or value |
| `sub` | string/node | — | Optional sublabel |
| `color` | string | — | Explicit val color; overrides `status` |
| `size` | string | `"22px"` | Font size of `val` |
| `status` | `"green"\|"gold"\|"red"` | — | Tinted bg + matching val color |
| `onClick` | function | — | Makes card a pressable button |
| `span` | number | — | `2` = `gridColumn: "span 2"` |

**Static mode** (no `onClick`):
```
background: var(--color-bg-surface)
border: 1px solid var(--color-border-subtle)
borderRadius: 16px
padding: 18px 16px
  ├── label  — 10px, letterSpacing 2.5px, var(--color-text-secondary), uppercase, mb 8px
  ├── val    — size prop, DM Serif Display, bold, lineHeight 1, tabular-nums
  └── sub    — 11px, var(--color-text-secondary), mt 5px
```

**Interactive/tile mode** (with `onClick`):
```
background: status-tinted (METRIC_STATUS[status].bg)
border: 1px solid status-tinted (METRIC_STATUS[status].border)
borderRadius: 16px
padding: 16px 18px
minHeight: 88px
display: flex, flexDirection: column
transform: scale(0.97) on pointer press (80ms ease)
  ├── label  — 10px, letterSpacing 2.5px, var(--color-text-secondary), uppercase, mb 2px
  ├── val    — size prop, DM Serif Display, bold, lineHeight 1, tabular-nums
  └── sub    — 10px, var(--color-text-secondary), marginTop: auto (pushes to bottom)
```

**Status color map** (`METRIC_STATUS` constant in ui.jsx):

| Status | Background | Border | Val color |
|--------|-----------|--------|-----------|
| `green` | `rgba(76,175,125,0.10)` | `rgba(76,175,125,0.22)` | `var(--color-green)` |
| `gold` | `rgba(201,168,76,0.10)` | `rgba(201,168,76,0.22)` | `var(--color-gold)` |
| `red` | `rgba(224,92,92,0.10)` | `rgba(224,92,92,0.22)` | `var(--color-red)` |

**Used in:**

| Panel | Mode | Grid | Size |
|-------|------|------|------|
| `HomePanel.jsx` | Interactive (tile) | `1fr 1fr`, gap `12px` | `30px` |
| `IncomePanel.jsx` | Static | `repeat(auto-fill,minmax(130px,1fr))`, gap `12px` | varies (`19px`–`22px`) |
| `BudgetPanel.jsx` | Static | `repeat(auto-fill,minmax(130px,1fr))`, gap `12px` | varies |
| `BenefitsPanel.jsx` | Static | `repeat(3,1fr)`, gap `12px` | varies |
| `LogPanel.jsx` | Static | `repeat(2,1fr)` / `repeat(3,1fr)`, gap `12px` | varies |

---

### NT — Nav Tab

**File:** `src/components/ui.jsx` (line 10)

Primary tab button. Used for top-level section navigation.

```
Props: label, active, onClick

Active:   bg var(--color-gold),   color var(--color-bg-base),   border 1px solid var(--color-gold)
Inactive: bg var(--color-bg-surface), color var(--color-text-secondary), border 1px solid var(--color-border-subtle)

padding: 8px 17px
fontSize: 11px, letterSpacing: 2px, uppercase
borderRadius: 12px
```

**Used in:** `App.jsx` — main navigation tab bar.

---

### VT — View Tab

**File:** `src/components/ui.jsx` (line 11)

Compact tab button. Used for sub-view switching within panels.

```
Props: label, active, onClick

Same color logic as NT.

padding: 7px 14px  (smaller than NT)
fontSize: 11px, letterSpacing: 2px, uppercase
borderRadius: 12px
```

**Used in:** `IncomePanel.jsx` (Overview/Monthly/Weekly/Tax Schedule),
`BudgetPanel.jsx` (Expenses/Goals/Loans subtabs).

---

### SmBtn — Small Button

**File:** `src/components/ui.jsx` (line 95)

Inline utility button with customisable color.

```
Props: children, onClick, c (color, default var(--color-text-secondary)), bg (default var(--color-bg-surface))

border: 1px solid var(--color-border-subtle)
borderRadius: 12px
padding: 5px 12px
fontSize: 11px
```

**Used in:** BudgetPanel (edit/delete actions), LogPanel (event row actions).

---

### SH — Section Header

**File:** `src/components/ui.jsx` (line 96)

Gold left-border section label with optional right-side value.

```
Props: children, color (default var(--color-gold)), right (optional)

Layout: flex row, space-between
Left:  3px × 18px gold bar + label text
       fontSize: 11px, letterSpacing: 3px, uppercase, bold
Right: fontSize: 12px, bold, same color

marginBottom: 14px, marginTop: 4px
```

**Used in:** All panels — marks major subsections (e.g. "401K", "Tax Schedule",
"Goals").

---

### iS — Input Style

**File:** `src/components/ui.jsx` (line 7)

Shared inline style object applied to `<input>` and `<select>` elements.

```
background: var(--color-bg-base)
border: 1px solid var(--color-border-subtle)
color: var(--color-text-primary)
padding: 8px 10px
borderRadius: 6px
fontSize: 16px
width: 100%
fontFamily: JetBrains Mono
```

**Used in:** All panels with form inputs.

---

### lS — Label Style

**File:** `src/components/ui.jsx` (line 8)

Shared inline style object for form field labels.

```
fontSize: 10px
letterSpacing: 2px
color: var(--color-text-disabled)
textTransform: uppercase
marginBottom: 4px
display: block
```

**Used in:** All panels with form inputs, paired with `iS`.

---

## File Map

```
src/
├── index.css                  — @theme color/font tokens (single source of truth)
├── index.html                 — Google Fonts <link> (DM Serif, DM Sans, JetBrains Mono)
├── App.jsx                    — Root shell, NT tab bar, panel routing
└── components/
    ├── ui.jsx                 — ALL shared primitives: MetricCard, Card (alias),
    │                            NT, VT, SmBtn, SH, iS, lS
    ├── HomePanel.jsx          — Dashboard overview; uses MetricCard (interactive tiles)
    ├── IncomePanel.jsx        — Income breakdown; uses MetricCard (static), VT, SH, iS, lS
    ├── BudgetPanel.jsx        — Expenses/Goals/Loans; uses MetricCard (static), VT, SmBtn, SH, iS, lS
    ├── BenefitsPanel.jsx      — 401k + PTO; uses MetricCard (static)
    ├── LogPanel.jsx           — Event log; uses MetricCard (static), iS, lS
    └── WeekConfirmModal.jsx   — Week confirmation modal
```

---

## Inline Button Standard (Panels)

Action buttons (SAVE, CANCEL, EDIT, DELETE) that live inline within panels are
not abstracted into a shared component but follow a consistent style:

```
CANCEL pattern:
  background: var(--color-bg-raised)
  color: var(--color-text-secondary)
  border: 1px solid var(--color-border-subtle)
  borderRadius: 12px
  padding: 7px–8px 14px–16px
  fontSize: 10px, letterSpacing: 2px, uppercase

SAVE/PRIMARY pattern:
  background: var(--color-green) or var(--color-gold)
  color: var(--color-bg-base)
  borderRadius: 12px
  padding: 8px 16px
  fontSize: 10px, letterSpacing: 2px, uppercase, bold
```

---

## What Is NOT Yet Implemented (Priorities 5–6)

| Priority | Item | Status |
|----------|------|--------|
| 5 | Framer Motion install | ❌ Not started |
| 5 | Number countup animation (hero metrics) | ❌ Not started |
| 5 | Card entrance stagger (fade + slide up 8px) | ❌ Not started |
| 5 | Value change flash (gold → normal, 600ms) | ❌ Not started |
| 6 | Tab underline sliding indicator (layoutId) | ❌ Not started |

**Rule reminder (from spec):** No bounce, no spin, no scale pop. Finance apps
feel calm and precise. Max animation duration 500ms (except countup at 1.2s).

---

*Generated against commit `9139387` — Priority #4 complete.*
*Spec source: `docs/finance-dashboard-ui-spec`*
