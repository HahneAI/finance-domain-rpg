-- Authority Finance — Expense History Reset (Phase 1)
-- Scope: Lifestyle (Nicotine, Fireblood, Disney, Claude, Gym)
--        Needs (Housing, Angel)
-- Remaining needs (Car Insurance, Car, Gas, Phone, Jesse, Food) handled in Phase 2.
-- Date: 2026-04-27
-- Target: Anthony — 57318ced-60a0-4fdf-9a58-a6409ba8c9db

UPDATE public.user_data
SET expenses = (
  SELECT jsonb_agg(updated_item ORDER BY item_idx)
  FROM (
    SELECT
      ordinality AS item_idx,
      CASE

        -- ─── NICOTINE ────────────────────────────────────────────────────────────
        -- Starts Feb 2026. Flat $30/wk all year.
        WHEN item->>'id' = 'exp_1776832233689' THEN
          '{"id":"exp_1776832233689","note":["","","",""],"label":"Nicotine","history":[{"weekly":[30,30,30,30],"effectiveFrom":"2026-02-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":120,"effectiveFrom":"2026-02-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── FIREBLOOD ───────────────────────────────────────────────────────────
        -- OFF in February. Starts March. $17.50/wk ($70/mo) flat remainder of year.
        WHEN item->>'id' = 'exp_1776582544720' THEN
          '{"id":"exp_1776582544720","note":["","","",""],"label":"Fireblood","history":[{"weekly":[17.5,17.5,17.5,17.5],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":70,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── DISNEY ──────────────────────────────────────────────────────────────
        -- OFF in February. Starts March. $5/wk ($20/mo) flat remainder of year.
        WHEN item->>'id' = 'exp_1776582663406' THEN
          '{"id":"exp_1776582663406","note":["","","",""],"label":"Disney","history":[{"weekly":[5,5,5,5],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":20,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── CLAUDE ──────────────────────────────────────────────────────────────
        -- OFF in February. Starts March. $5/wk ($20/mo) flat remainder of year.
        WHEN item->>'id' = 'exp_1776582675587' THEN
          '{"id":"exp_1776582675587","note":["","","",""],"label":"Claude","history":[{"weekly":[5,5,5,5],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":20,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── GYM ─────────────────────────────────────────────────────────────────
        -- OFF in February. Starts March. $10/wk ($40/mo) flat remainder of year.
        WHEN item->>'id' = 'exp_1777039536857' THEN
          '{"id":"exp_1777039536857","note":["","","",""],"label":"Gym","history":[{"weekly":[10,10,10,10],"effectiveFrom":"2026-03-01"}],"category":"Lifestyle","billingMeta":{"cycle":"every30days","amount":40,"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── HOUSING ─────────────────────────────────────────────────────────────
        -- Starts March. $50/wk ($200/mo) Mar–Jun. $150/wk ($600/mo) July onward.
        WHEN item->>'id' = 'exp_1776580334361' THEN
          '{"id":"exp_1776580334361","note":["","","",""],"label":"Housing","history":[{"weekly":[50,50,50,50],"effectiveFrom":"2026-03-01"},{"weekly":[150,150,150,150],"effectiveFrom":"2026-07-01"}],"category":"Needs","billingMeta":{"cycle":"every30days","amount":200,"byPhase":{"2":{"cycle":"every30days","amount":600,"effectiveFrom":"2026-07-01"}},"effectiveFrom":"2026-03-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── ANGEL ───────────────────────────────────────────────────────────────
        -- Weekly billing. $450/wk Feb–Mar → $525/wk Apr → $500/wk May → $400/wk Jun+
        WHEN item->>'id' = 'exp_1776582476985' THEN
          '{"id":"exp_1776582476985","note":["","","",""],"label":"Angel","history":[{"weekly":[450,450,450,450],"effectiveFrom":"2026-02-01"},{"weekly":[525,525,525,525],"effectiveFrom":"2026-04-01"},{"weekly":[500,500,500,500],"effectiveFrom":"2026-05-01"},{"weekly":[400,400,400,400],"effectiveFrom":"2026-06-01"}],"category":"Needs","billingMeta":{"cycle":"weekly","amount":400,"effectiveFrom":"2026-02-01"},"isFoodPrimary":false,"isFoodHighlighted":false}'::jsonb

        -- ─── ALL OTHER EXPENSES ───────────────────────────────────────────────────
        -- Loans, Car Insurance, Car, Gas, Phone, Jesse, Food — untouched this phase.
        ELSE item

      END AS updated_item
    FROM jsonb_array_elements(expenses) WITH ORDINALITY AS t(item, ordinality)
  ) AS subq
)
WHERE user_id = '57318ced-60a0-4fdf-9a58-a6409ba8c9db';
