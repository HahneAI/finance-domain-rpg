# UI Rework — Home+Goals Merge & Log+Benefits Merge

Two structural changes: goals move to the home screen, benefits get absorbed into the log panel.

---

## Files Touched

| File | What changes |
|------|-------------|
| `src/components/HomePanel.jsx` | Reorder cards, embed full Goals system |
| `src/components/BudgetPanel.jsx` | Remove Goals tab, strip goal-exclusive code |
| `src/components/LogPanel.jsx` | Add Benefits content + priority metric cards at top |
| `src/App.jsx` | Remove Benefits from nav, re-route props |

---

## 1 — HomePanel.jsx

### A. Props — add to signature
```js
setGoals,
futureWeeks = [],
timelineWeekNets = [],
expenses = [],
logNetLost = 0,
logNetGained = 0,
futureEventDeductions = {},
fiscalWeekInfo,   // already passed from App, not yet consumed
```

### B. Imports — add what's missing
```js
import { useState, useMemo, useEffect, useRef } from "react";
import { computeGoalTimeline, toLocalIso } from "../lib/finance.js";
import { deriveRollingTimelineMonths, progressiveScale } from "../lib/rollingTimeline.js";
import { formatFiscalWeekLabel } from "../lib/fiscalWeek.js";
import { SmBtn, iS, lS } from "./ui.jsx";
```

### C. Module-level constants — add above function
```js
const BURST_PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const r = i % 2 === 0 ? 60 : 88;
  return {
    dx: Math.round(Math.cos(angle) * r),
    dy: Math.round(Math.sin(angle) * r),
    symbol: ['$','✓','▪','+','◆','▸','$','✓','▪','+','◆','▸'][i],
    delay: `${(i % 4) * 0.04}s`,
  };
});
const MONTH_SUBDIVISIONS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const GOAL_SYSTEM_COLOR = "var(--color-accent-primary)";
const clamp01 = (n) => Math.min(1, Math.max(0, n));
const safeDate = (raw) => {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};
```

### D. Metric cards — reorder tiles array
New order (remove "Left This Week", move "Next Week Takehome" to slot 0):
1. **Next Week Takehome** — span 2, first card
2. **Net Worth Trend** — span 1
3. **Goals** — span 1, remove `onClick` (goals are inline now)
4. **Budget Health** — span 2

Also update the info banner copy:
> "Add your first goal below to unlock timeline forecasting."  
(remove "in Budget")

### E. Goals state — add inside function body (ported from BudgetPanel lines 117–141)
```js
const TODAY_ISO = today;
const [editGoalId, setEditGoalId]   = useState(null);
const [editGoalVals, setEditGoalVals] = useState({});
const [addingGoal, setAddingGoal]   = useState(false);
const [newGoal, setNewGoal]         = useState({ label: "", target: "", note: "" });
const [delGoalId, setDelGoalId]     = useState(null);
const [fundingId, setFundingId]     = useState(null);
const [showCompleted, setShowCompleted] = useState(false);
const [draggingGoalId, setDraggingGoalId] = useState(null);
const [dragOverGoalId, setDragOverGoalId] = useState(null);
const goalInsertRef       = useRef({ targetId: null, insertIndex: null });
const goalDragFinalizedRef = useRef(false);
```

### F. Goals computed values — add after state
```js
const f  = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const f2 = n => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fiscalWeekLabel = formatFiscalWeekLabel(fiscalWeekInfo);
const weeksLeft   = futureWeeks?.length ?? 44;
const fiscalYearEnd = futureWeeks?.length ? toLocalIso(futureWeeks[futureWeeks.length - 1].weekEnd) : "2027-01-04";
const activeGoals    = goals.filter(g => !g.completed);
const completedGoals = goals.filter(g => g.completed);
const totG = activeGoals.reduce((s, g) => s + g.target, 0);
const wr   = weeklyIncome - avgWeeklySpend;         // avgWeeklySpend already computed above
const projS = wr * weeksLeft;
const projSAfterFunded = projS - fundedGoalSpend;
const nowIdx = getFiscalWeekNumber(currentWeek?.idx ?? 0) ?? 1;
```

### G. Goals timeline memos — port from BudgetPanel lines 796–857
- `timelineBounds` useMemo (safeDate + futureWeeks → startMs/endMs/spanMs)
- `timelineMonthSegments` useMemo (month segments with subdivisions)
- `rollingGoalTimeline` useMemo → `deriveRollingTimelineMonths(...)`
- `visibleTimelineSegments = rollingGoalTimeline.visibleMonths`
- `goalTimelineScale = progressiveScale(rollingGoalTimeline.scaleProgress, 0.15)`
- `tl` useMemo → `computeGoalTimeline(activeGoals, futureWeeks, timelineWeekNets, expenses, logNetLost, logNetGained, futureEventDeductions)`
- `lastGoalEW = tl.length ? (tl[tl.length - 1].eW ?? weeksLeft + 1) : 0`

### H. Auto-effects — port from BudgetPanel lines 860–883
- Effect 1: auto-set `dueWeek` on goals with projection but no stored due date
- Effect 2: auto-mark `completed: true` when `eW <= 0`

### I. Goal CRUD helpers — port from BudgetPanel lines 689–793
Move verbatim:
`startEditGoal`, `saveEditGoal`, `addGoal`, `deleteGoal`, `toggleComplete`, `handleMarkDone`, `moveGoal`, `reorderGoalByDrag`, `finalizeGoalDrag`, `cleanupGoalDragState`, `onGoalDragStart`, `onGoalDragEnd`

Also port the finish-label helpers defined inline inside the goals IIFE (BudgetPanel lines 1278–1308):
`ordinalSuffix`, `formatGoalFinishDate`, `buildGoalFinishLabel`, `resolveGoalFinishLabel`

### J. Goals JSX section — append after `<FlowSparklineCard />`
Port the full block from BudgetPanel `{view === "goals" && ...}` (lines 1310–1629):
1. Current week info banner (fiscal week label + rotation + end date)
2. Summary cards row: Left This Week · Active Goals Total · Weeks to Complete All
3. Active goals draggable list with timeline bars, celebration, CRUD actions
4. Drop zone marker at bottom of active list
5. "+ ADD GOAL" button / New Goal inline form
6. Funded History collapsible
7. Year-End Outlook box with Reset Timelines button

---

## 2 — BudgetPanel.jsx

### A. Props — remove from signature
`setGoals`, `logNetLost`, `logNetGained`, `timelineWeekNets`, `futureEventDeductions`

Keep `goals` (read-only) — verify overview/breakdown don't reference it before removing.

### B. State — delete all goal-specific entries (lines 117–141)
`editGoalId`, `editGoalVals`, `addingGoal`, `newGoal`, `delGoalId`, `fundingId`, `showCompleted`, `draggingGoalId`, `dragOverGoalId`, `goalInsertRef`, `goalDragFinalizedRef`

### C. Functions — delete all goal helpers (lines 689–793)
`startEditGoal`, `saveEditGoal`, `addGoal`, `deleteGoal`, `toggleComplete`, `handleMarkDone`, `moveGoal`, `reorderGoalByDrag`, `finalizeGoalDrag`, `cleanupGoalDragState`, `onGoalDragStart`, `onGoalDragEnd`

### D. Memos/effects — delete goal timeline logic (lines 796–883)
`timelineBounds`, `timelineMonthSegments`, `rollingGoalTimeline`, `visibleTimelineSegments`, `goalTimelineScale`, `tl` useMemo, both auto-effects, `lastGoalEW`, `activeGoals`/`completedGoals` filters

### E. View tab bar — remove "goals" (line 903)
```js
// before
{["overview", "breakdown", "goals", "loans"].map(...)}
// after
{["overview", "breakdown", "loans"].map(...)}
```

### F. JSX — delete `{view === "goals" && ...}` block (lines 1271–1630)

### G. Imports — remove now-unused symbols
`computeGoalTimeline`, `deriveRollingTimelineMonths`, `progressiveScale` (if only used by goals)

---

## 3 — LogPanel.jsx

### A. Props — add to signature
```js
allWeeks,
setConfig,
logK401kLost, logK401kMatchLost,
logK401kGained, logK401kMatchGained,
logPTOHoursLost,
ptoGoal, setPtoGoal,
// config, isDHL, bucketModel already present
```

### B. Computed values — port from BenefitsPanel lines 38–69
```js
const bE = allWeeks.reduce((s, w) => s + w.k401kEmployee, 0);
const bM = allWeeks.reduce((s, w) => s + w.k401kEmployer, 0);
const aE = Math.max(bE - logK401kLost + (logK401kGained ?? 0), 0);
const aM = Math.max(bM - logK401kMatchLost + (logK401kMatchGained ?? 0), 0);
const ptoCutoff = ptoGoal?.targetDate ? new Date(ptoGoal.targetDate) : null;
const ptoBs = ptoCutoff
  ? allWeeks.filter(w => w.active && w.weekEnd <= ptoCutoff).reduce((s, w) => s + w.totalHours, 0) / 20
  : 0;
const adjP = Math.max(ptoBs - (logPTOHoursLost ?? 0) / 20, 0);
const effectiveAdjP = config.ptoHoursOverride != null ? config.ptoHoursOverride : adjP;
const negCap  = ptoGoal?.negativeBalanceCap ?? 40;
const avail   = effectiveAdjP + negCap;
const onTrack = ptoGoal ? avail >= ptoGoal.hoursNeeded : false;
```

### C. State — add BenefitsPanel form state
```js
const [formOpen, setFormOpen]           = useState(false);
const [formVals, setFormVals]           = useState({ label: "", hoursNeeded: "", targetDate: "", negativeBalanceCap: "40" });
const [editMode, setEditMode]           = useState(false);
const [editingBalance, setEditingBalance] = useState(false);
const [balanceInput, setBalanceInput]   = useState("");
const [editingPto, setEditingPto]       = useState(false);
const [ptoInput, setPtoInput]           = useState("");
```

Also port `openAdd()`, `openEdit()`, `saveForm()` helpers from BenefitsPanel lines 82–109.

### D. JSX layout — new order

**TOP (new):** Priority metric cards — DHL only
```jsx
{isDHL && (
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
    <MetricCard
      label="PTO Balance"
      val={`${effectiveAdjP.toFixed(1)} hrs`}
      rawVal={effectiveAdjP}
      status={effectiveAdjP >= 0 ? "green" : "red"}
    />
    <MetricCard
      label="Bucket Hours"
      val={bucketModel ? `${bucketModel.currentBalance} hrs` : "—"}
      rawVal={bucketModel?.currentBalance ?? 0}
      status={bucketModel?.status === "safe" ? "green" : bucketModel?.status === "caution" ? "gold" : "red"}
    />
  </div>
)}
```

**MIDDLE (existing, unchanged):**
Current week indicator → hero cards → compact bucket widget → log effect summary → attendance history → event log section

**BOTTOM (ported from BenefitsPanel):**
1. 401k status banner (BenefitsPanel lines 120–140)
2. 401k projections cards + monthly breakdown table (lines 142–203)
3. PTO Accrual section — balance override control, metric cards, leave goal tracker, form (lines 206–404) — `isDHL` only
4. Attendance Bucket detail — current month strip + month history table + year-end summary (lines 408–537) — `bucketModel` only; omit the balance bar since the compact widget above already shows it

---

## 4 — App.jsx

### A. NAV_ITEMS — remove Benefits entry (line 21)
```js
// delete:
{ key: "benefits", label: "Benefits" },
```

### B. BOTTOM_NAV — remove Benefits entry (lines 55–63)
Delete the `{ key: "benefits", label: "Benefits", icon: <heart SVG> }` object.

### C. Import — remove BenefitsPanel (line 10)
```js
// delete:
import { BenefitsPanel } from "./components/BenefitsPanel.jsx";
```

### D. Panel render — remove BenefitsPanel block (lines 691–703)
Delete `{currentView === "benefits" && <BenefitsPanel ... />}`.

### E. HomePanel render — add new props
```jsx
setGoals={setGoals}
futureWeeks={futureWeeks}
timelineWeekNets={futureWeekNetsRaw}
expenses={expenses}
logNetLost={logTotals.netLost}
logNetGained={logTotals.netGained}
futureEventDeductions={futureEventDeductions}
```

### F. LogPanel render — add new props
```jsx
allWeeks={allWeeks}
setConfig={setConfig}
logK401kLost={logTotals.k401kLost}
logK401kMatchLost={logTotals.k401kMatchLost}
logK401kGained={logTotals.k401kGained}
logK401kMatchGained={logTotals.k401kMatchGained}
logPTOHoursLost={logTotals.ptoHoursLost}
ptoGoal={ptoGoal}
setPtoGoal={setPtoGoal}
```

### G. BudgetPanel render — remove props no longer needed
Remove: `setGoals`, `logNetLost`, `logNetGained`, `timelineWeekNets`, `futureEventDeductions`

### H. Search for stray `navigate("benefits")` calls
Grep the whole codebase — redirect any found to `"log"` or remove.

---

## Routing Notes

- **Goals metric card** in HomePanel currently calls `navigate("budget")` — remove `onClick` since goals are now inline.
- **Mobile drawer** maps `NAV_ITEMS` — removing Benefits from the array auto-removes it from the drawer. No extra change needed.
- **Desktop sidebar** also maps `NAV_ITEMS` — same, auto-removed.
- **Bottom nav indicator** is index-based width (`100 / n %`). Removing the Benefits entry reduces `n` from 6 → 5; the indicator math self-corrects with no manual change.

---

## Verification Checklist

### Tests
- [ ] `npm run test:run` passes — all suites green
- [ ] Update `HomePanel.test.jsx` if it checks the props signature or card count

### Home tab
- [ ] "Next Week Takehome" is the first card (top, full width)
- [ ] "Left This Week" card is gone
- [ ] Goals section renders below FlowSparklineCard
- [ ] Add / Edit / Delete goals work
- [ ] Drag-drop reorder works
- [ ] Timeline bars render with month labels
- [ ] "✓ DONE" triggers celebration animation, then marks complete
- [ ] Funded History collapses/expands
- [ ] Year-End Outlook renders with Reset Timelines button

### Budget tab
- [ ] View tabs show: Overview · Breakdown · Loans (no Goals tab)
- [ ] Overview and Loans still function correctly

### Log tab
- [ ] PTO Balance + Bucket Hours cards at very top (DHL only)
- [ ] Event log section unchanged and functional below
- [ ] 401k status banner + projections table visible
- [ ] PTO accrual section + leave goal tracker visible (DHL)
- [ ] Attendance Bucket month history + year-end summary visible

### Navigation
- [ ] No "Benefits" button in desktop sidebar
- [ ] No "Benefits" item in mobile hamburger drawer
- [ ] No "Benefits" button in mobile bottom nav
- [ ] Bottom nav sliding indicator spans 5 items cleanly
- [ ] No runtime errors from stray `navigate("benefits")` calls
