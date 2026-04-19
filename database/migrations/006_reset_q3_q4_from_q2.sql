-- Migration 006: Roll Q2 expense values forward to Q3 and Q4
--
-- Context: expenses are edited per-quarter in the app. When a user edits
-- an expense in Q2, the intended behavior is that Q3 and Q4 inherit those
-- values going forward. This migration hard-resets Q3/Q4 to match the
-- current Q2 state so the DB is clean before testing the roll-forward logic.
--
-- What this touches per expense:
--   history[last].weekly[2]  ← weekly[1]  (Q3 = Q2)
--   history[last].weekly[3]  ← weekly[1]  (Q4 = Q2)
--   billingMeta.byPhase["2"] ← byPhase["1"]  (if present)
--   billingMeta.byPhase["3"] ← byPhase["1"]  (if present)
--
-- Loans (type = "loan") have no billingMeta so the byPhase step is a no-op.
-- Payoff entries (all zeros) are the last history entry on paid-off loans —
-- weekly[1] = 0 so copying to [2] and [3] is safe.

UPDATE public.user_data
SET
  expenses = (
    SELECT jsonb_agg(fixed_expense ORDER BY ord)
    FROM (
      SELECT
        ord,
        CASE
          -- No history array or empty: pass through unchanged
          WHEN NOT (expense ? 'history')
            OR jsonb_array_length(expense -> 'history') = 0
          THEN expense

          ELSE (
            -- Step 2: sync billingMeta.byPhase "2" and "3" to phase "1" (if present)
            SELECT
              CASE
                WHEN (w_fixed -> 'billingMeta') IS NOT NULL
                  AND (w_fixed -> 'billingMeta' -> 'byPhase') IS NOT NULL
                  AND (w_fixed -> 'billingMeta' -> 'byPhase' -> '1') IS NOT NULL
                THEN
                  jsonb_set(
                    jsonb_set(
                      w_fixed,
                      ARRAY['billingMeta', 'byPhase', '2'],
                      w_fixed -> 'billingMeta' -> 'byPhase' -> '1'
                    ),
                    ARRAY['billingMeta', 'byPhase', '3'],
                    w_fixed -> 'billingMeta' -> 'byPhase' -> '1'
                  )
                ELSE w_fixed
              END
            FROM (
              -- Step 1: copy weekly[1] (Q2) → weekly[2] (Q3) and weekly[3] (Q4)
              --         in the most recent history entry
              SELECT jsonb_set(
                jsonb_set(
                  expense,
                  ARRAY[
                    'history',
                    (jsonb_array_length(expense -> 'history') - 1)::text,
                    'weekly', '2'
                  ],
                  expense
                    -> 'history'
                    -> (jsonb_array_length(expense -> 'history') - 1)
                    -> 'weekly'
                    -> 1
                ),
                ARRAY[
                  'history',
                  (jsonb_array_length(expense -> 'history') - 1)::text,
                  'weekly', '3'
                ],
                expense
                  -> 'history'
                  -> (jsonb_array_length(expense -> 'history') - 1)
                  -> 'weekly'
                  -> 1
              ) AS w_fixed
            ) step1
          )
        END AS fixed_expense
      FROM jsonb_array_elements(
        (
          SELECT expenses
          FROM public.user_data
          WHERE user_id = '57318ced-60a0-4fdf-9a58-a6409ba8c9db'
        )
      ) WITH ORDINALITY AS t(expense, ord)
    ) sub
  ),
  updated_at = now()
WHERE user_id = '57318ced-60a0-4fdf-9a58-a6409ba8c9db';
