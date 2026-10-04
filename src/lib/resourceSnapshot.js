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
 * @param {object|null} nextClaim   computeClaimDates()'s `nextClaim`
 *   ({ goal, info }) — the soonest active goal with a real date
 * @returns the jsonb `payload`; fields are null when this app has no value,
 *   never a placeholder number
 */
export function buildResourceSnapshotPayload({ cashOnHand, nextClaim }) {
  const finishDate = nextClaim?.info?.finishDate;
  return {
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
          anchorAsOf: cashOnHand.asOf,
          atRiskBill: cashOnHand.atRiskBill
            ? { label: cashOnHand.atRiskBill.label, dueIso: cashOnHand.atRiskBill.dueIso, amount: cents(cashOnHand.atRiskBill.amount) }
            : null,
        }
      : null,
    nextPaycheck: cashOnHand?.nextPaydayIso
      ? { dateIso: cashOnHand.nextPaydayIso, amount: cents(cashOnHand.nextPaycheckEstimate) }
      : null,
    nextClaim: finishDate instanceof Date && !Number.isNaN(finishDate.getTime())
      ? { label: nextClaim.goal?.label ?? null, dateIso: toLocalIso(finishDate) }
      : null,
  };
}
