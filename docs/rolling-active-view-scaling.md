# Rolling Active Views + Progressive Scaling

## Purpose

This note documents how active timelines should behave in the main app views until a dedicated full-year review tab is built.

## Active-window rules

- **Weekly timelines (income and similar weekly views):**
  - Show the **last 4 completed weeks**.
  - Show the **current week and all remaining weeks through end-of-year**.
  - Hide older completed weeks from the main view (do not delete source data).

- **Monthly timelines (goals and similar monthly overlays):**
  - Show the **previous month** for context.
  - Show the **current month and all remaining months through end-of-year**.
  - Hide older months from the main view (do not delete source data).

## Progressive scaling target

- The main active-window visuals should gradually increase in size over time.
- Target progression: **~1.00x in early year → ~1.15x by end-of-year**.
- Scale should change in small increments as old weeks/months age out so users notice only over longer use (e.g., months), not week-to-week jumps.
- Scaling should remain bounded (never exceed 15% growth in this phase).

## Testing guidance

- Manual date simulation is required to validate progression over time.
- Recommended QA flow:
  1. Test around start of year (minimal hidden periods, near 1.00x).
  2. Test mid-year (some hidden periods, clearly subtle scale increase).
  3. Test near end-of-year (many hidden periods, near 1.15x cap).
- Future admin/testing utility can expose a date override to speed validation.

## Future full-year review compatibility

- Hidden periods should be preserved in derived structures so a future full-year review tab can render archived periods without data migration.
