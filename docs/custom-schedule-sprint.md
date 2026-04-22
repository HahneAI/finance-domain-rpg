# Custom Schedule Sprint — DHL Weekly Hour Projection

*From voice memo review, 2026-04-22.*

Three sprints. Sprint 1 fixes the projection math bug. Sprint 2 upgrades
the wizard to capture per-week-type hour targets. Sprint 3 wires the
WeekConfirmModal to demand core shift day selection for bucket tracking.
**Mandatory OT day selector is left alone in all three sprints — pinned for
later brainstorm.**

---

## Sprint 1 — [CC] Fix Custom Schedule Income Mismatch (bug)

**Problem:** A new DHL user sets `customWeeklyHours = 48` expecting a
flat weekly income projection. The dashboard shows two different take-home
amounts for alternating weeks. Root source: when `customWeeklyHours`
overrides `totalHours`, the `weekendHours` value is still derived from the
full rotation-day array (`worked`), which differs between long week
(Tue/Wed/Sat/Sun + OT = Sat+Sun in rotation → 24h weekend hours) and short
week (Mon/Thu/Fri + OT → ~6h weekend hours only). Same total hours, radically
different weekend-differential pay.

**Scope of investigation:**
- `finance.js` `buildYear` DHL branch, lines around 379–383 — the
  `customWeeklyHours` override for `totalHours` does not recompute
  `weekendHours` to match the reduced/adjusted day set.
- Confirm whether the income delta observed (~$300 gap per user report)
  matches the weekend-diff discrepancy alone, or if there is a second source
  (e.g., `firstActiveIdx` causing one rotation week to be partially inactive,
  or a `rollingTimeline` estimate path diverging from `buildYear` actuals).
- `computeNet` / `calcEventImpact` — verify custom-hours net is consistent.

**Tasks:**
- [ ] Run a controlled `buildYear` trace with `customWeeklyHours = 48`,
  `dhlTeam = "B"` (starts long), standard night+weekend rates. Log
  `totalHours`, `weekendHours`, and `grossPay` for week N (long) vs N+1
  (short). Confirm dollar delta and whether it matches the weekend-diff math.
- [ ] Determine the correct fix: when `customWeeklyHours` reduces a long
  week below its standard rotation total (e.g., 48 < 60h), the `worked` set
  needs to be trimmed to only the shifts that fit, and `weekendHours`
  recalculated from that trimmed set, so the pay formula reflects actual
  shifts rather than phantom rotation days.
  - Trimming rule: drop the OT-default day first (Mon for long week), then
    drop non-weekend days before weekend days, to preserve differential
    earnings as much as possible.
- [ ] Apply the fix in `buildYear`. Guard: only activate when
  `cfg.customWeeklyHours != null && !cfg.dhlCustomSchedule` and
  `customWeeklyHours < worked.length * cfg.shiftHours`.
- [ ] Regression: verify Anthony's existing 60h custom schedule is unaffected
  (60h exactly matches the long-week standard → no trimming triggered).
- [ ] Update `docs/account-reference.json` `computed_expectations` if any
  weekly gross values change, and run `npm run test:run` to confirm.

---

## Sprint 2 — [CODEX] Variable Per-Week-Type Hours in Wizard

**Problem:** A single flat `customWeeklyHours` value forces both rotation
weeks to the same hour target, which doesn't match real DHL schedules where
the user may want to project 60h on long weeks and 48h on short weeks (or
any other split). The wizard collects only one number.

**New fields:** `customWeeklyHoursLong` (hours target for the high week) and
`customWeeklyHoursShort` (hours target for the low week). Both optional; if
only one is set, that value is used for both. If neither is set, falls back
to the current `customWeeklyHours` behavior.

**Wizard UI change (Step 1, custom schedule section):**
- Replace the single "Hours per week" input with two labeled inputs:
  - **Long week target (hrs)** — placeholder "e.g. 60"
  - **Short week target (hrs)** — placeholder "e.g. 48"
- Both inputs follow the existing `hoursDraft` / sentinel-0 pattern from the
  `customWeeklyHours` input (never coerce on change; parse at commit).
- Existing `customWeeklyHours` kept as the summary value used by
  `estimateWeeklyGross` (set to average of long+short for the wizard preview).
- Validation: at least one value > 0 required to pass Step 1 `isValid`.

**Finance engine:** `buildYear` DHL branch: when `customWeeklyHoursLong`
or `customWeeklyHoursShort` are present, use the appropriate value based on
`isHighWeek` instead of the single `customWeeklyHours`. Fallback chain:
`customWeeklyHoursLong ?? customWeeklyHours ?? rotation` for high weeks,
`customWeeklyHoursShort ?? customWeeklyHours ?? rotation` for low weeks.

**CODEX task spec notes:**
- Touch only `SetupWizard.jsx` (wizard UI) and `finance.js` (engine use).
- Do not touch `DEFAULT_CONFIG` — add the two new keys as optional (undefined
  by default, not null/0, so old configs that never set them fall through to
  the existing `customWeeklyHours` path cleanly).
- `estimateWeeklyGross` in `SetupWizard.jsx` — update to average the two
  targets when both are set.
- Tests: add one case — wizard with `customWeeklyHoursLong=60`,
  `customWeeklyHoursShort=48` produces two different `totalHours` values in
  consecutive `buildYear` weeks.

---

## Sprint 3 — [CC] WeekConfirmModal Core Day Selection for Custom Schedule

**Problem:** For standard DHL users the WeekConfirmModal demands selection of
an OT day (one extra shift). For custom schedule users, the modal currently
inherits the same OT-day-only demand, but it does not require selection of
the 3 or 4 core rotation days. Without knowing WHICH days were worked, the
app cannot determine whether bucket hours were hit for that week, because
weekend-differential hours depend on whether Sat/Sun were worked.

**What "core days" means for DHL:**
- Short week: 3 core shifts — Mon / Thu / Fri (from `DHL_PRESET.rotation.short.days`)
- Long week: 4 core shifts — Tue / Wed / Sat / Sun (from `DHL_PRESET.rotation.long.days`)
- The OT day is still selectable on top of these. Leave the OT selector as-is.

**Desired behavior for custom schedule users:**
- WeekConfirmModal shows the core rotation days as a multi-select (or a
  "confirm these days" toggle block), pre-checked to the standard pattern.
- User can uncheck a core day if they called out / missed it that week
  (this triggers a log entry or at least a bucket-hours recalculation).
- If all core days are confirmed + OT day selected → same flow as today.
- If a core day is missed → calculate actual hours without that shift, update
  bucket hours accordingly, surface a note.
- Gate: this enhanced day-selection UI should activate only when
  `cfg.customWeeklyHours != null && !cfg.dhlCustomSchedule`. Standard
  rotation users are unchanged.

**Tasks:**
- [ ] Audit `WeekConfirmModal.jsx`: identify where `requiredOtShifts` drives
  the current OT-day UI and where `workedDayNames` is displayed. Map the
  props flowing in from `App.jsx`.
- [ ] Design the core-day confirmation block: show standard core days
  (derived from `DHL_PRESET.rotation.long/short.days` based on `isHighWeek`)
  as pre-checked pills; let user toggle individually.
- [ ] Wire the confirmed-days set into bucket-hour recalculation: actual hours
  = (confirmed core days + OT day) × `shiftHours`. If below the custom
  weekly target, treat the difference as missed hours for bucket purposes.
- [ ] Keep the OT day selector present and required as today (pinned — do not
  redesign mandatory OT logic in this sprint).
- [ ] Log: if a core day is unchecked, auto-generate a missed-day event log
  entry (same type as existing attendance events) so the history stays clean.
- [ ] Tests: WeekConfirmModal renders core-day pills when
  `customWeeklyHours != null`; unchecking a day reduces the computed
  actualHours; OT selector still present and required.
