-- Authority Finance — Expense History Reset (Phase 3)
-- Scope: Jesse, Food
-- Date: 2026-04-27
-- Depends on: 007_fix_expenses_phase1.sql, 008_fix_expenses_phase2.sql
-- Target: Anthony — 57318ced-60a0-4fdf-9a58-a6409ba8c9db

-- ── System reference ─────────────────────────────────────────────────────────
-- history[].weekly[4]   Quarterly amounts: [Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec]
-- monthlyOverrides      { "YYYY-MM": { perPaycheck, amount, cycle } }
--                       Checked first; use for mid-quarter rate changes.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.user_data
SET expenses = (
  SELECT jsonb_agg(updated_item ORDER BY item_idx)
  FROM (
    SELECT
      ordinality AS item_idx,
      CASE

        -- ─── JESSE ────────────────────────────────────────────────────────────
        -- Starts March. $100/wk Q1 (Mar only). $60/wk Apr–Aug. $20/wk Sep onward.
        -- Q3 splits: July/August = $60 (history base), September = $20 (mid-Q3 change).
        -- Resolution path:
        --   Mar      → history weekly[0] = 100
        --   Apr–Jun  → history weekly[1] = 60
        --   Jul–Aug  → no override → history weekly[2] = 60
        --   Sep      → monthlyOverrides["2026-09"].perPaycheck = 20  (mid-Q3)
        --   Oct–Dec  → no override → history weekly[3] = 20
        -- Note: "Card plus loan" — weekly billing cycle.
        WHEN item->>'id' = 'exp_1776832259078' THEN
          '{"id":"exp_1776832259078","note":["Card plus loan","Card plus loan","Card plus loan","Card plus loan"],"label":"Jesse","history":[{"weekly":[100,60,60,20],"effectiveFrom":"2026-03-01"}],"monthlyOverrides":{"2026-09":{"perPaycheck":20,"amount":20,"cycle":"weekly"}},"category":"Needs","billingMeta":{"cycle":"weekly","amount":60,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── FOOD ─────────────────────────────────────────────────────────────
        -- Food is a standard expense with isFoodPrimary/isFoodHighlighted flags.
        -- No separate mandatory type exists in the codebase — flags drive UI pinning
        -- and auto-creation only. No cross-threading with loans or other types.
        --
        -- Q1 (historical): $65/wk ($260/mo). From April (Q2+): $100/wk ($400/mo).
        -- Single history entry encodes the quarter shift in weekly[4].
        --
        -- Note: id is "food" (legacy) — kept as-is. isFoodPrimaryExpense() in db.js
        -- resolves by isFoodPrimary flag, not by id string, so "food" vs
        -- "exp_default_food" makes no behavioral difference.
        WHEN item->>'id' = 'food' THEN
          '{"id":"food","note":["","","",""],"label":"Food","history":[{"weekly":[65,100,100,100],"effectiveFrom":"2026-01-27"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":400,"effectiveFrom":"2026-01-27"},"isFoodPrimary":true,"isFoodHighlighted":true}'::jsonb

        ELSE item

      END AS updated_item
    FROM jsonb_array_elements(expenses) WITH ORDINALITY AS t(item, ordinality)
  ) AS subq
)
WHERE user_id = '57318ced-60a0-4fdf-9a58-a6409ba8c9db';
