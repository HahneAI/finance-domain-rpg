-- Authority Finance — Expense History Reset
-- Scope: All Lifestyle edits + all Needs edits except Jesse and Food
--        Jesse and Food → 009_fix_expenses_phase3.sql
-- Date: 2026-04-27
-- Target: Anthony — 57318ced-60a0-4fdf-9a58-a6409ba8c9db

-- ── System reference ─────────────────────────────────────────────────────────
-- history[].weekly[4]   Quarter-indexed spend: [Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec]
--                       Resolution: most-recent entry where effectiveFrom <= weekDate
-- monthlyOverrides      { "YYYY-MM": { perPaycheck, amount, cycle } }
--                       Checked FIRST by getEffectiveAmountForMonth() before history fallback.
--                       Required for mid-quarter rate changes (month = smallest addressable unit).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.user_data
SET expenses = (
  SELECT jsonb_agg(updated_item ORDER BY item_idx)
  FROM (
    SELECT
      ordinality AS item_idx,
      CASE

        -- ══════════════════════════════════════════════════════════════════════
        --  NEEDS
        -- ══════════════════════════════════════════════════════════════════════

        -- ─── HOUSING ─────────────────────────────────────────────────────────
        -- Starts March. Quarter boundary change encoded directly in weekly[4]:
        --   Q1=50 (Mar only), Q2=50, Q3=150, Q4=150
        -- Jan/Feb: effectiveFrom 2026-03-01 > lookup date → no match → $0.
        -- No mid-quarter changes → no monthlyOverrides needed.
        WHEN item->>'id' = 'exp_1776580334361' THEN
          '{"id":"exp_1776580334361","note":["","","",""],"label":"Housing","history":[{"weekly":[50,50,150,150],"effectiveFrom":"2026-03-01"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":600,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── ANGEL ───────────────────────────────────────────────────────────
        -- Weekly billing. History encodes Q1=450 (Feb–Mar), Q2 base=400 (Jun+), Q3/Q4=400.
        -- April ($525) and May ($500) deviate from the Q2 base → monthlyOverrides.
        -- Resolution path:
        --   Jan      → effectiveFrom 2026-02-01 > 2026-01-15 → $0
        --   Feb–Mar  → history weekly[0] = 450
        --   Apr      → monthlyOverrides["2026-04"].perPaycheck = 525  ← checked first
        --   May      → monthlyOverrides["2026-05"].perPaycheck = 500  ← checked first
        --   Jun      → no override → history weekly[1] = 400
        --   Jul–Dec  → no override → history weekly[2]/[3] = 400
        WHEN item->>'id' = 'exp_1776582476985' THEN
          '{"id":"exp_1776582476985","note":["","","",""],"label":"Angel","history":[{"weekly":[450,400,400,400],"effectiveFrom":"2026-02-01"}],"monthlyOverrides":{"2026-04":{"perPaycheck":525,"amount":525,"cycle":"weekly"},"2026-05":{"perPaycheck":500,"amount":500,"cycle":"weekly"}},"category":"Needs","billingMeta":{"cycle":"weekly","amount":400,"effectiveFrom":"2026-02-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── CAR INSURANCE ────────────────────────────────────────────────────
        -- Hasn't started until May (mid-Q2).
        -- effectiveFrom 2026-05-01: April lookup (2026-04-15) finds no entry → $0.
        -- No monthlyOverride needed for April — the missing history entry is sufficient.
        -- May onward: $32.50/wk ($130/mo), flat all remaining quarters.
        WHEN item->>'id' = 'exp_1776569858289' THEN
          '{"id":"exp_1776569858289","note":["","","",""],"label":"Car Insurance","history":[{"weekly":[32.5,32.5,32.5,32.5],"effectiveFrom":"2026-05-01"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":130,"effectiveFrom":"2026-05-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── CAR (EXPENSE) — DELETE ───────────────────────────────────────────
        -- Car payment tracked by loan_1776832499286 (Bob). Expense entry is duplicate.
        -- NULL return causes jsonb_agg to drop this row from the array.
        WHEN item->>'id' = 'exp_1776582411500' THEN NULL

        -- ─── GAS ──────────────────────────────────────────────────────────────
        -- Starts April (Q2 start). Q1 lookup → effectiveFrom 2026-04-01 > Q1 date → $0.
        -- No monthlyOverride needed — effectiveFrom boundary handles the Q1 absence.
        -- Q2 onward: $100/wk ($400/mo), flat all remaining quarters.
        WHEN item->>'id' = 'exp_1776582325174' THEN
          '{"id":"exp_1776582325174","note":["","","",""],"label":"Gas","history":[{"weekly":[100,100,100,100],"effectiveFrom":"2026-04-01"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":400,"effectiveFrom":"2026-04-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── PHONE ────────────────────────────────────────────────────────────
        -- Q1: $45/mo plan → $11.25/wk. Changed to $55/mo plan at April (Q2+) → $13.75/wk.
        -- Clean quarter boundary → encoded directly in weekly[4]; no monthlyOverrides needed.
        --   weekly[0]=Q1=11.25 · weekly[1]=Q2=13.75 · weekly[2]=Q3=13.75 · weekly[3]=Q4=13.75
        WHEN item->>'id' = 'exp_1776582310679' THEN
          '{"id":"exp_1776582310679","note":["","","",""],"label":"Phone","history":[{"weekly":[11.25,13.75,13.75,13.75],"effectiveFrom":"2026-01-05"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":55,"effectiveFrom":"2026-01-05"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ══════════════════════════════════════════════════════════════════════
        --  LIFESTYLE
        -- ══════════════════════════════════════════════════════════════════════

        -- ─── NICOTINE ────────────────────────────────────────────────────────
        -- Starts February (mid-Q1). Q1 rep date is 2026-02-15 — entry matches → shows in Q1 view.
        -- Jan monthly view: effectiveFrom 2026-02-01 > 2026-01-15 → $0. ✓
        -- Flat $30/wk all year. No mid-quarter changes → no monthlyOverrides needed.
        WHEN item->>'id' = 'exp_1776832233689' THEN
          '{"id":"exp_1776832233689","note":["","","",""],"label":"Nicotine","history":[{"weekly":[30,30,30,30],"effectiveFrom":"2026-02-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":120,"effectiveFrom":"2026-02-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── FIREBLOOD ────────────────────────────────────────────────────────
        -- OFF Jan–Feb. Starts March (last month of Q1).
        -- Q1 quarterly view uses rep date 2026-02-15 → effectiveFrom 2026-03-01 > Feb 15 → $0.
        -- March monthly view: effectiveFrom 2026-03-01 ≤ 2026-03-15 → $17.50 ✓ (history fallback).
        -- No monthlyOverride needed for March — history fallback resolves correctly.
        -- Flat $17.50/wk ($70/mo) Q2 onward; quarterly values all equal so no further overrides.
        WHEN item->>'id' = 'exp_1776582544720' THEN
          '{"id":"exp_1776582544720","note":["","","",""],"label":"Fireblood","history":[{"weekly":[17.5,17.5,17.5,17.5],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":70,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── DISNEY ───────────────────────────────────────────────────────────
        -- Same pattern as Fireblood: OFF Jan–Feb, starts March.
        -- March monthly view resolves correctly via history fallback; no monthlyOverride needed.
        WHEN item->>'id' = 'exp_1776582663406' THEN
          '{"id":"exp_1776582663406","note":["","","",""],"label":"Disney","history":[{"weekly":[5,5,5,5],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":20,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── CLAUDE ───────────────────────────────────────────────────────────
        -- Same pattern as Fireblood: OFF Jan–Feb, starts March.
        WHEN item->>'id' = 'exp_1776582675587' THEN
          '{"id":"exp_1776582675587","note":["","","",""],"label":"Claude","history":[{"weekly":[5,5,5,5],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":20,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── GYM ──────────────────────────────────────────────────────────────
        -- Same pattern as Fireblood: OFF Jan–Feb, starts March.
        WHEN item->>'id' = 'exp_1777039536857' THEN
          '{"id":"exp_1777039536857","note":["","","",""],"label":"Gym","history":[{"weekly":[10,10,10,10],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":40,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── ALL OTHER EXPENSES ───────────────────────────────────────────────
        -- Loans, Jesse, Food, Walmart — handled in 009 or untouched.
        ELSE item

      END AS updated_item
    FROM jsonb_array_elements(expenses) WITH ORDINALITY AS t(item, ordinality)
  ) AS subq
)
WHERE user_id = '57318ced-60a0-4fdf-9a58-a6409ba8c9db';
