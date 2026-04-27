-- Authority Finance — Expense History Reset (Phase 2)
-- Scope: Car (delete), Car Insurance, Gas, Phone
--        + Corrections to Angel and Housing from Phase 1 (wrong weekly[] encoding)
-- Date: 2026-04-27
-- Depends on: 007_fix_expenses_phase1.sql
-- Target: Anthony — 57318ced-60a0-4fdf-9a58-a6409ba8c9db

-- ── System reference ─────────────────────────────────────────────────────────
-- history[].weekly[4]   Quarter-indexed amounts: [Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec]
--                       Resolution: most-recent entry where effectiveFrom <= weekDate
-- monthlyOverrides      { "YYYY-MM": { perPaycheck, amount, cycle } }
--                       Checked FIRST by getEffectiveAmountForMonth() before history fallback.
--                       Use for mid-quarter rate changes (month is the smallest addressable unit).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.user_data
SET expenses = (
  SELECT jsonb_agg(updated_item ORDER BY item_idx)
  FROM (
    SELECT
      ordinality AS item_idx,
      CASE

        -- ─── CAR (EXPENSE) — DELETE ───────────────────────────────────────────
        -- Removed: car payment is tracked by loan_1776832499286 (Bob).
        -- Returning NULL causes jsonb_agg to drop this entry from the array.
        WHEN item->>'id' = 'exp_1776582411500' THEN NULL

        -- ─── CAR INSURANCE ────────────────────────────────────────────────────
        -- Hasn't started until May (mid-Q2).
        -- effectiveFrom "2026-05-01": April lookup (2026-04-15) finds no matching entry → $0.
        -- May onward: $32.50/wk ($130/mo), flat all remaining quarters.
        WHEN item->>'id' = 'exp_1776569858289' THEN
          '{"id":"exp_1776569858289","note":["","","",""],"label":"Car Insurance","history":[{"weekly":[32.5,32.5,32.5,32.5],"effectiveFrom":"2026-05-01"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":130,"effectiveFrom":"2026-05-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── GAS ──────────────────────────────────────────────────────────────
        -- Starts April (Q2 start). effectiveFrom "2026-04-01": Q1 lookup → no match → $0.
        -- Q2 onward: $100/wk ($400/mo), flat all remaining quarters.
        WHEN item->>'id' = 'exp_1776582325174' THEN
          '{"id":"exp_1776582325174","note":["","","",""],"label":"Gas","history":[{"weekly":[100,100,100,100],"effectiveFrom":"2026-04-01"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":400,"effectiveFrom":"2026-04-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── PHONE ────────────────────────────────────────────────────────────
        -- Q1: $45/mo plan → $11.25/wk. Changed to $55/mo plan in April (Q2+) → $13.75/wk.
        -- Quarter boundary change: encoded directly in weekly[4] within a single history entry.
        -- weekly[0]=Q1=11.25, weekly[1]=Q2=13.75, weekly[2]=Q3=13.75, weekly[3]=Q4=13.75
        WHEN item->>'id' = 'exp_1776582310679' THEN
          '{"id":"exp_1776582310679","note":["","","",""],"label":"Phone","history":[{"weekly":[11.25,13.75,13.75,13.75],"effectiveFrom":"2026-01-05"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":55,"effectiveFrom":"2026-01-05"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── ANGEL (Phase 1 correction) ───────────────────────────────────────
        -- Phase 1 used all-same quarterly values per entry. Corrected here to use:
        --   history: one entry encoding Q1=450 (Feb-Mar), Q2 base=400 (June), Q3/Q4=400
        --   monthlyOverrides: April ($525) and May ($500) are mid-Q2 deviations.
        -- Resolution path for each month:
        --   Feb–Mar  → history weekly[0] = 450
        --   Apr      → monthlyOverrides["2026-04"].perPaycheck = 525  (checked first)
        --   May      → monthlyOverrides["2026-05"].perPaycheck = 500  (checked first)
        --   Jun      → no override → history weekly[1] = 400
        --   Jul–Dec  → no override → history weekly[2]/[3] = 400
        WHEN item->>'id' = 'exp_1776582476985' THEN
          '{"id":"exp_1776582476985","note":["","","",""],"label":"Angel","history":[{"weekly":[450,400,400,400],"effectiveFrom":"2026-02-01"}],"monthlyOverrides":{"2026-04":{"perPaycheck":525,"amount":525,"cycle":"weekly"},"2026-05":{"perPaycheck":500,"amount":500,"cycle":"weekly"}},"category":"Needs","billingMeta":{"cycle":"weekly","amount":400,"effectiveFrom":"2026-02-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── HOUSING (Phase 1 correction) ─────────────────────────────────────
        -- Phase 1 used two separate history entries. Corrected to single entry with
        -- quarterly encoding: weekly[4] = [Q1=50, Q2=50, Q3=150, Q4=150].
        -- Starts March. Q1 pre-March: effectiveFrom 2026-03-01 > Jan/Feb lookup → $0.
        -- Q1 Mar: $50/wk ($200/mo). Q2: $50/wk. Q3/Q4 (July+): $150/wk ($600/mo).
        -- No mid-quarter changes — no monthlyOverrides needed.
        WHEN item->>'id' = 'exp_1776580334361' THEN
          '{"id":"exp_1776580334361","note":["","","",""],"label":"Housing","history":[{"weekly":[50,50,150,150],"effectiveFrom":"2026-03-01"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":600,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── ALL OTHER EXPENSES ───────────────────────────────────────────────
        -- Loans, Jesse, Food, Walmart, Lifestyle entries — untouched this phase.
        ELSE item

      END AS updated_item
    FROM jsonb_array_elements(expenses) WITH ORDINALITY AS t(item, ordinality)
  ) AS subq
)
WHERE user_id = '57318ced-60a0-4fdf-9a58-a6409ba8c9db';
