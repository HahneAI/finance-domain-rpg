// Shared setup-wizard completion normalizer — the single commit point both SetupWizard.jsx
// (F5, drift-app-warden §7) and SetupWizardAdlib.jsx must call before handing a finished
// formData off to App.jsx's handleWizardComplete(). Extracted so the DHL/Freedom-Allowance/
// tips-stamp/taxedWeeks/accountCreatedIdx normalization logic is never hand-transcribed twice.
//
// See docs/drift-app-warden.md §7 F5/F13 before changing anything in here — every ordered
// effect below has a downstream consumer documented there.
import { buildYear } from "./finance.js";
import { dateToWeekIdx } from "./fiscalWeek.js";

export const FREEDOM_ALLOWANCE_MAX = 200;

/**
 * Normalize a completed wizard formData into the final config object to hand to
 * App.jsx's handleWizardComplete(). Pure function — no side effects, no save.
 *
 * @param {object} formData - the wizard's in-progress form state, fully answered.
 * @param {object|null} priorConfig - the account's config BEFORE this wizard run (used only
 *   to detect the tipsOrCommissionEnabled false→true / true→false transition). Pass null/undefined
 *   for a real first-run account (no prior config exists yet) — the transition check then
 *   degenerates to "wasTipsEnabled === false", which is correct for first-run.
 * @returns {object} the final config, including taxedWeeks/accountCreatedIdx/setupComplete.
 */
export function finalizeWizardConfig(formData, priorConfig = null) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // (1) DHL enforced overrides
  const finalData = formData.employerPreset === "DHL"
    ? { ...formData, payPeriodEndDay: 0, otThreshold: 40, otMultiplier: 1.5 }
    : { ...formData };

  // (2) Freedom Allowance normalize — display default is ?? 50 in the UI but formData can
  // still hold null if the field was cleared or never touched. Normalize here so the saved
  // config always carries the real value the user saw. Capped at FREEDOM_ALLOWANCE_MAX.
  if (finalData.freedomAllowanceEnabled !== false) {
    finalData.freedomAllowance = Math.min(finalData.freedomAllowance ?? 50, FREEDOM_ALLOWANCE_MAX);
  }

  // Stamp/clear tipsOrCommissionEnabledAt on the false→true / true→false transitions only —
  // bounds the daily check-in backlog to dates on/after opt-in (constants/config.js) without
  // disturbing the stamp while staying enabled across wizard re-entries.
  const wasTipsEnabled = priorConfig?.tipsOrCommissionEnabled === true;
  if (finalData.tipsOrCommissionEnabled && !wasTipsEnabled) {
    finalData.tipsOrCommissionEnabledAt = todayIso;
  } else if (!finalData.tipsOrCommissionEnabled) {
    finalData.tipsOrCommissionEnabledAt = null;
  }

  // (3) taxedWeeks derivation — [] if the user filed exempt, else every buildYear() week
  // from firstActiveIdx onward.
  const allWeeks = buildYear(finalData);
  const taxedWeeks = finalData.taxExemptOptIn
    ? []
    : allWeeks.filter(w => w.idx >= (finalData.firstActiveIdx ?? 0)).map(w => w.idx);

  // (4) accountCreatedIdx stamp — preserved if already set, else today's week.
  const accountCreatedIdx = finalData.accountCreatedIdx ?? dateToWeekIdx(todayIso);

  // (5) setupComplete: true
  return { ...finalData, taxedWeeks, accountCreatedIdx, setupComplete: true };
}
