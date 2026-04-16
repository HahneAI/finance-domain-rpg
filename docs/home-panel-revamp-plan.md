# Home Panel Revamp — Sprint Plan

**Branch:** `claude/home-panel-revamp-planning-CnfBY`
**File:** `src/components/HomePanel.jsx`

---

## Sprint 1 — Structural Changes

Lower risk first: data and layout moves before visual polish.

- [ ] **Remove duplicate "Next Week Takehome" tile** (tiles array index 4, lines 229–245). This card is a copy of tile 0 but carries `pulseNextWeek` instead of `pulseLeftThisWeek`.
- [ ] **Promote `pulseNextWeek` to the top "Next Week Takehome" tile** (tile 0, line 194). Replace its current `insight: pulseLeftThisWeek` with `insight: pulseNextWeek` so the forward-looking signal stays but the duplicate card is gone.
- [ ] **Move "Goals" counter tile out of the top tiles grid.** It currently lives as tile index 2 (span=1) in the hero tile array. Remove it from `tiles[]`.
- [ ] **Add Goals counter as a 4th MetricCard in the goals mini grid** (lines 535–539). The mini grid currently has 3 cards (Left This Week, Active Goals Total, Weeks to Complete All); the Goals counter fills the open 4th slot.

---

## Sprint 2 — Visual Polish

Visual upgrades after structure is stable.

- [ ] **Upgrade hero text area.** Current: tiny "Financial Health" label + small subtitle. Target: larger, more commanding typographic treatment — still on-brand teal/tokens, no raw hex, no bounce animations.
- [ ] **Upgrade Goals section header.** Current: plain `<SH>Goals</SH>`. Target: more grand, clear section-change marker. Should feel noticeably different from the top area — could use size, weight, spacing, or a decorative element. Must stay on-brand.
- [ ] **Upgrade Year-End Outlook card.** Current: flat green box with a simple 2-col grid. Target: more custom / premium feel while on-brand. Remove the "Active goals total" data row (the total goals amount line).

---

## Reference — Current Layout Order

```
1. [Conditional] No-goals banner
2. Hero section (Financial Health label + subtitle)
3. Tile grid (2-col):
     Tile 0: Next Week Takehome (span=2) + pulseLeftThisWeek  ← Sprint 1: swap insight
     Tile 1: Net Worth Trend (span=1)
     Tile 2: Goals (span=1)                                   ← Sprint 1: REMOVE from here
     Tile 3: Budget Health (span=2)
     Tile 4: Next Week Takehome DUPLICATE (span=2)            ← Sprint 1: DELETE entire tile
4. FlowSparklineCard (Flow Score)
5. Goals section:
     SH "Goals" header                                         ← Sprint 2: make grand
     Fiscal week badge
     Mini grid (3 cards):
       Left This Week | Active Goals Total | Weeks to Complete All
       [4th slot open]                                         ← Sprint 1: Goals counter goes here
     Active goal cards (ScrollSnapRow on mobile, list on desktop)
     Add goal form
     Completed goals history
     Year-End Outlook card                                     ← Sprint 2: redesign + remove total line
```

---

## Notes

- `pulseNextWeek` (currently on the duplicate tile) uses `nextWeekNet vs weeklyIncome` — this is the more meaningful forward signal for the top card.
- `pulseLeftThisWeek` is dropped from display entirely (the signal logic can stay in the file for potential future use or be removed cleanly).
- The Goals MetricCard moved to the mini grid should keep the same props: `label="Goals"`, `val={completedGoals.length + "/" + goals.length}`, same `status`, same `insight: pulseGoals`.
- Year-End Outlook line to remove: `"Active goals total"` row (lines 1007).
- All edits must use design tokens only — no raw hex.
