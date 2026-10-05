// Cyborg Resource snapshot payload (TODO §22.F, migration 047).
//
// Cyborg's Resource track shows a few figures only this app computes. This
// builds the row it reads — every value copied from the function the UI itself
// already uses (computeCashOnHand, computeClaimDates), never re-derived here.
// Pure: no React, no Supabase. App.jsx builds it and db.js saves it.
import { toLocalIso } from "./finance.js";

export const RESOURCE_SNAPSHOT_SCHEMA_VERSION = 1;

const cents = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

/**
 * @param {object|null} cashOnHand  computeCashOnHand()'s result (null until a
 *   starting balance is set, and in New Job Season mode)
 * @param {object|null} njsDash     computeNewJobSeasonRunway()'s result — non-null
 *   only in New Job Season mode, where it stands in for `cashOnHand` (Finance's
 *   employed cash engine deliberately returns null there)
 * @param {object|null} nextClaim   computeClaimDates()'s `nextClaim`
 *   ({ goal, info }) — the soonest active goal with a real date
 * @param {string} today            effectiveToday (YYYY-MM-DD)
 * @returns the jsonb `payload`; fields are null when this app has no value,
 *   never a placeholder number
 */
export function buildResourceSnapshotPayload({ cashOnHand, njsDash = null, nextClaim, today }) {
  const njs = !cashOnHand && njsDash ? njsDash : null;
  const finishDate = nextClaim?.info?.finishDate;
  const claimIso = finishDate instanceof Date && !Number.isNaN(finishDate.getTime()) ? toLocalIso(finishDate) : null;
  const pending = njs?.pendingCheck;

  return {
    // 'employed' = Cash on Hand engine; 'new_job_season' = the NJS runway engine
    // (the user marked "Quit My Job"). Lets Cyborg say why a figure is missing.
    mode: cashOnHand ? 'employed' : njs ? 'new_job_season' : null,
    cash: cashOnHand
      ? {
          cashOnHand: cents(cashOnHand.cashOnHand),
          // Modeled, self-reported — "estimated" while any paycheck credit is
          // still waiting on its check-in.
          pendingCount: cashOnHand.pendingCount,
          status: cashOnHand.status,
          gap: cents(cashOnHand.gap),
          setAside: cents(cashOnHand.setAside),
          weeklyNeeds: cents(cashOnHand.weeklyNeeds),
          // Upkeep's Lifestyle total — with weeklyNeeds, the whole weekly spend
          // Cyborg's "never worked again" runway divides by. Additive field: no
          // schema_version bump (a reader without it just lacks that runway).
          weeklyLifestyle: cents(cashOnHand.weeklyLifestyle),
          anchorAsOf: cashOnHand.asOf,
          atRiskBill: cashOnHand.atRiskBill
            ? { label: cashOnHand.atRiskBill.label, dueIso: cashOnHand.atRiskBill.dueIso, amount: cents(cashOnHand.atRiskBill.amount) }
            : null,
        }
      : njs
        ? {
            // New Job Season: the figures its own Home card shows. No status
            // light, set-aside or at-risk bill — NJS has none of those; its
            // headline is the runway (`weeklyNeeds` = its essential weekly burn).
            cashOnHand: cents(njs.effectiveCashOnHand),
            pendingCount: null,
            status: null,
            gap: null,
            setAside: null,
            weeklyNeeds: cents(njs.weeklyBurn),
            weeklyLifestyle: cents(njs.lifestyleWeeklySpend),
            anchorAsOf: njs.cashAsOf,
            atRiskBill: null,
          }
        : null,
    nextPaycheck: cashOnHand?.nextPaydayIso
      ? { dateIso: cashOnHand.nextPaydayIso, amount: cents(cashOnHand.nextPaycheckEstimate) }
      // NJS's pending check, only while it's still ahead (its date can lapse).
      : pending && pending.date && pending.date >= today
        ? { dateIso: pending.date, amount: cents(pending.amount) }
        : null,
    // No Claim Date while in New Job Season (Home shows no Claim Date surface
    // there, and the goal timeline isn't meaningful), and never a date already
    // in the past — a Claim Date is a future thing.
    nextClaim: !njs && claimIso && claimIso >= today
      ? { label: nextClaim.goal?.label ?? null, dateIso: claimIso }
      : null,
  };
}
