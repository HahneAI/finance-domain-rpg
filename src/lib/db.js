import { supabase, getCurrentUserId, getCachedAuthSnapshot } from "./supabase.js";
import {
  DEFAULT_CONFIG,
  INITIAL_EXPENSES,
  INITIAL_GOALS,
  INITIAL_LOGS,
  FISCAL_YEAR_START,
} from "../constants/config.js";
import { buildLoanHistory } from "./finance.js";
import { isTrackedBetaTester } from "./entitlements.js";

const FOOD_DEFAULT_MONTHLY = 400;
const FOOD_DEFAULT_WEEKLY = FOOD_DEFAULT_MONTHLY / 4;

// Maps raw account_history rows (TODO §19) down to the { effectiveFrom, baseRate }
// shape finance.js's resolveBaseRateForWeek expects — narrow §15.D read-path slice,
// baseRate only. Filters to rows that actually changed baseRate and have a real
// numeric value in their snapshot (schema drift tolerance: an old/malformed
// snapshot missing baseRate is silently skipped rather than injecting a bad entry).
function extractBaseRateHistory(rows) {
  return (rows ?? [])
    .filter(row => Array.isArray(row.changed_fields) && row.changed_fields.includes("baseRate"))
    .map(row => ({ effectiveFrom: row.effective_from, baseRate: row.snapshot?.baseRate }))
    .filter(row => typeof row.baseRate === "number" && !Number.isNaN(row.baseRate));
}

// Stripe/trial lifecycle fields (docs/TODO.md §17.A) — kept OUT of the config JSON
// blob since they're authoritative billing columns, not user prefs. Never written
// by saveUserData(); only the service-role webhook/checkout/portal routes touch them.
const DEFAULT_SUBSCRIPTION = {
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  status: null,
  trialStartedAt: null,
  trialEndsAt: null,
  accessEndsAt: null,
  cardOnFile: false,
  lastDunningEmailAt: null,
  dunningEmailCount: 0,
  currentPeriodEnd: null,
  plan: null,
};

const mapSubscription = (row) => row ? ({
  stripeCustomerId: row.stripe_customer_id ?? null,
  stripeSubscriptionId: row.stripe_subscription_id ?? null,
  status: row.subscription_status ?? null,
  trialStartedAt: row.trial_started_at ?? null,
  trialEndsAt: row.trial_ends_at ?? null,
  accessEndsAt: row.access_ends_at ?? null,
  cardOnFile: row.card_on_file ?? false,
  lastDunningEmailAt: row.last_dunning_email_at ?? null,
  dunningEmailCount: row.dunning_email_count ?? 0,
  currentPeriodEnd: row.current_period_end ?? null,
  plan: row.plan ?? null,
}) : DEFAULT_SUBSCRIPTION;

const isFoodPrimaryExpense = (expense) => {
  if (!expense || expense.type === "loan") return false;
  if (expense.isFoodPrimary === true) return true;
  const label = typeof expense.label === "string" ? expense.label.trim().toLowerCase() : "";
  return expense.category === "Needs" && label === "food";
};

const normalizeExpenseFoodFlags = (expense) => {
  if (!expense || expense.type === "loan") return expense;
  const isFoodPrimary = isFoodPrimaryExpense(expense);
  return {
    ...expense,
    ...(isFoodPrimary ? { category: "Needs" } : {}),
    isFoodPrimary,
    // UI: Food card should receive visual emphasis (icon, highlight, separation)
    isFoodHighlighted: isFoodPrimary,
  };
};

const createDefaultFoodExpense = () => ({
  id: "exp_default_food",
  category: "Needs",
  label: "Food",
  isFoodPrimary: true,
  // UI: Food card should receive visual emphasis (icon, highlight, separation)
  isFoodHighlighted: true,
  note: ["", "", "", ""],
  billingMeta: { amount: FOOD_DEFAULT_MONTHLY, cycle: "every30days", effectiveFrom: FISCAL_YEAR_START },
  history: [{ effectiveFrom: FISCAL_YEAR_START, weekly: [FOOD_DEFAULT_WEEKLY, FOOD_DEFAULT_WEEKLY, FOOD_DEFAULT_WEEKLY, FOOD_DEFAULT_WEEKLY] }],
});

export const ensureInitialFoodExpense = (expenses) => {
  const normalized = (Array.isArray(expenses) ? expenses : []).map(normalizeExpenseFoodFlags);
  if (normalized.some(isFoodPrimaryExpense)) return normalized;
  return [...normalized, createDefaultFoodExpense()];
};

/**
 * Load the single user row from Supabase.
 * Falls back to app defaults if the row is empty or missing.
 */
export async function loadUserData() {
  const userId = await getCurrentUserId();

  // Not signed in — return blank defaults so the app never crashes on unauthenticated load.
  // App.jsx auth gate will redirect to LoginScreen before this matters for real users.
  if (!userId) {
    return {
      config:             DEFAULT_CONFIG,
      expenses:           INITIAL_EXPENSES,
      goals:              INITIAL_GOALS,
      logs:               INITIAL_LOGS,
      showExtra:          true,
      weekConfirmations:  {},
      baseRateHistory:    [],
      isEmployerDHL:              false,
      isAdmin:            false,
      isTester:           false,
      betaCodeUsed:       null,
      betaStartedAt:      null,
      taxProjectionsEnabled: false,
      subscription:       DEFAULT_SUBSCRIPTION,
    };
  }

  // Select core fields first — week_confirmations is fetched separately so a missing
  // column (migration not yet run) doesn't blow up the entire load.
  const { data, error } = await supabase
    .from("user_data")
    .select("config, expenses, goals, logs, show_extra, is_employer_dhl, is_admin, is_tester, beta_code_used, beta_started_at, pto_goal, is_investor, tax_projections_enabled")
    .eq("user_id", userId)
    .single();

  // Fetch week_confirmations independently; gracefully returns {} if column missing.
  const { data: wcData } = await supabase
    .from("user_data")
    .select("week_confirmations")
    .eq("user_id", userId)
    .single();

  // Fetch subscription/trial columns independently (migration 017) — same isolation
  // pattern as week_confirmations, so a not-yet-migrated DB falls back to
  // DEFAULT_SUBSCRIPTION instead of blowing up the whole load.
  const { data: subData } = await supabase
    .from("user_data")
    .select(
      "stripe_customer_id, stripe_subscription_id, subscription_status, trial_started_at, trial_ends_at, " +
      "access_ends_at, card_on_file, last_dunning_email_at, dunning_email_count, current_period_end, plan"
    )
    .eq("user_id", userId)
    .single();

  // Fetch baseRate history independently (account_history, migration 020) — same
  // isolation pattern as week_confirmations: a not-yet-migrated DB or a fetch error
  // falls back to [] (buildYear's resolver then behaves exactly as it did before
  // this existed) instead of blowing up the whole load. TODO §15.D / §19 narrow
  // read-path slice — baseRate only, see resolveBaseRateForWeek in finance.js.
  const { data: historyRows } = await supabase
    .from("account_history")
    .select("effective_from, changed_fields, snapshot")
    .eq("user_id", userId)
    .order("effective_from", { ascending: true });
  const baseRateHistory = extractBaseRateHistory(historyRows);

  // Fetch investor profile when this is an investor account — needed to restore active_account.
  let investorRow = null;
  if (data?.is_investor) {
    const { data: invData } = await supabase
      .from("investor_users")
      .select("investor_name, email, company_name, city, code_used, active_account")
      .eq("auth_user_id", userId)
      .maybeSingle();
    investorRow = invData ?? null;
  }

  // PGRST116 = .single() genuinely matched zero rows — the only case that means
  // "this account has no user_data row yet," which is the sole legitimate trigger
  // for falling back to DEFAULT_CONFIG (setupComplete:false) and re-showing the
  // wizard. Any other error (network blip, timeout, RLS hiccup) must NOT be treated
  // the same way: on a PWA, resuming from background is exactly when a transient
  // fetch failure is likely, and conflating it with "brand-new account" was
  // silently re-opening the setup wizard for existing users mid-session — and
  // overwriting their real saved data if they completed it. Propagate instead so
  // the caller's error handling kicks in without touching config/wizard state.
  if (error && error.code !== "PGRST116") {
    throw new Error(`loadUserData query failed: ${error.message}`);
  }

  if (error || !data) {
    console.warn("No user_data row found, using defaults.", error?.message);
    return {
      config:             DEFAULT_CONFIG,
      expenses:           INITIAL_EXPENSES,
      goals:              INITIAL_GOALS,
      logs:               INITIAL_LOGS,
      showExtra:          true,
      weekConfirmations:  {},
      baseRateHistory:    [],
      isEmployerDHL:              false,
      isAdmin:            false,
      isTester:           false,
      betaCodeUsed:       null,
      betaStartedAt:      null,
      taxProjectionsEnabled: false,
      subscription:       DEFAULT_SUBSCRIPTION,
    };
  }

  // Migrate and normalize all expenses on load
  const PROJECT_START = FISCAL_YEAR_START;
  const rawExpenses = Array.isArray(data.expenses) ? data.expenses : [];
  const migratedExpenses = rawExpenses.map(exp => {
    // Loans: always regenerate history from loanMeta so runway/payoff math stays fresh
    if (exp.type === "loan" && exp.loanMeta) {
      return { ...exp, history: buildLoanHistory(exp.loanMeta) };
    }
    // Legacy regular expenses: promote weekly → history
    let base = exp;
    if (!exp.history?.length && exp.weekly) {
      const { weekly, ...rest } = exp;
      base = { ...rest, history: [{ effectiveFrom: PROJECT_START, weekly }] };
    }
    // Q4 migration: any history entry with 3-value weekly gets Q3 value copied into Q4
    const migratedHistory = (base.history ?? []).map(entry => ({
      ...entry,
      weekly: entry.weekly?.length === 3 ? [...entry.weekly, entry.weekly[2]] : entry.weekly,
    }));
    // Q4 migration: note arrays of length 3 get Q3 value copied into Q4
    const migratedNote = Array.isArray(base.note) && base.note.length === 3
      ? [...base.note, base.note[2]]
      : base.note;
    return normalizeExpenseFoodFlags({ ...base, history: migratedHistory, note: migratedNote });
  });

  // Merge: new DEFAULT_CONFIG fields fill in for existing rows (safe for any user).
  // Before this fix, the entire DEFAULT_CONFIG was discarded if any config row existed —
  // new fields added to DEFAULT_CONFIG would never reach existing users.
  const mergedConfig = Object.keys(data.config).length
    ? { ...DEFAULT_CONFIG, ...data.config }
    : DEFAULT_CONFIG;

  // ── otherDeductions: weeklyAmount → perCheckAmount rename ────────────────────
  if (Array.isArray(mergedConfig.otherDeductions)) {
    mergedConfig.otherDeductions = mergedConfig.otherDeductions.map(row => {
      if (row && "weeklyAmount" in row && !("perCheckAmount" in row)) {
        const { weeklyAmount, ...rest } = row;
        return { ...rest, perCheckAmount: weeklyAmount };
      }
      return row;
    });
  }

  // ── Pre-wizard migration for DHL users ───────────────────────────────────────
  // Fires once for any DHL user whose row pre-dates the setup wizard (setupComplete absent).
  // Sets the DHL employer preset, marks setupComplete, and promotes legacy rate field names.
  // Scoped to is_employer_dhl === true so it never runs for standard or future multi-user accounts.
  //
  // startingWeekIsLong: false — verified against INITIAL_LOGS week 10 = "6-Day":
  //   offset = ((10 - firstActiveIdx) % 2 + 2) % 2 = 1 → isHighWeek = !startingWeekIsLong
  //   so !startingWeekIsLong must be true → startingWeekIsLong must be false.
  if (data.is_employer_dhl && !mergedConfig.setupComplete) {
    mergedConfig.employerPreset = "DHL";
    mergedConfig.startingWeekIsLong = false;    // corrected: false = odd-offset weeks are long
    mergedConfig.scheduleIsVariable = true;
    mergedConfig.dhlTeam = "B";
    mergedConfig.customWeeklyHours = 60;   // Phase 4 migration: replaces dhlCustomSchedule:true
    mergedConfig.dhlCustomSchedule = false;
    // Promote legacy w1/w2 rate field names to the generalized names used by the wizard
    if (mergedConfig.fedRateLow === DEFAULT_CONFIG.fedRateLow) {
      mergedConfig.fedRateLow    = mergedConfig.w1FedRate   ?? DEFAULT_CONFIG.w1FedRate;
      mergedConfig.fedRateHigh   = mergedConfig.w2FedRate   ?? DEFAULT_CONFIG.w2FedRate;
      mergedConfig.stateRateLow  = mergedConfig.w1StateRate ?? DEFAULT_CONFIG.w1StateRate;
      mergedConfig.stateRateHigh = mergedConfig.w2StateRate ?? DEFAULT_CONFIG.w2StateRate;
    }
    mergedConfig.setupComplete = true;
  }

  // ── One-time startingWeekIsHeavy → startingWeekIsLong rename ────────────────
  // Config key renamed 2026-03-25. Must run BEFORE rotation correction so the
  // corrected value isn't overwritten by the old stored key.
  // Safe to run every load — old key won't exist after first save with new name.
  if ("startingWeekIsHeavy" in mergedConfig) {
    mergedConfig.startingWeekIsLong = mergedConfig.startingWeekIsHeavy;
    delete mergedConfig.startingWeekIsHeavy;
  }

  // ── One-time rotation correction ─────────────────────────────────────────────
  // The initial migration set startingWeekIsLong: true. The intended follow-up
  // correction (checking dhlTeam === "B") never fired because dhlTeam was still
  // null in Supabase — the B-team migration ran before setupComplete was set.
  // Trigger condition: is_employer_dhl + dhlTeam still null (pre-wizard, never corrected).
  // Sets all three fields needed for Anthony's custom schedule correctly.
  if (data.is_employer_dhl && mergedConfig.dhlTeam === null) {
    mergedConfig.dhlTeam = "B";
    mergedConfig.customWeeklyHours = 60;   // Phase 4 migration: replaces dhlCustomSchedule:true
    mergedConfig.dhlCustomSchedule = false;
    mergedConfig.startingWeekIsLong = false;   // odd-offset weeks from firstActiveIdx are long
  }

  // ── dhlCustomSchedule → customWeeklyHours auto-migration ─────────────────────
  // If any prior migration or saved Supabase data still carries dhlCustomSchedule:true,
  // convert it to customWeeklyHours:60 and clear the flag. This is the Phase 4 migration
  // window guard — safe to remove after Anthony's live Supabase row is cleaned (Phase 7).
  if (mergedConfig.dhlCustomSchedule === true) {
    // eslint-disable-next-line no-console
    console.warn("[db] dhlCustomSchedule migration: setting customWeeklyHours=60, dhlCustomSchedule=false");
    mergedConfig.customWeeklyHours = 60;
    mergedConfig.dhlCustomSchedule = false;
  }

  // ── startDate → firstActiveIdx sync ─────────────────────────────────────────
  // startDate is the "Job Start Date" the user explicitly enters in wizard Step 2,
  // and DEFAULT_CONFIG documents it as "used to derive firstActiveIdx". When the
  // stored firstActiveIdx is later than what startDate implies — which happens when
  // the pre-wizard DHL migration stamped the default (7) and a wizard re-entry didn't
  // trigger onChange for an unchanged date field — correct firstActiveIdx so income
  // projections start from the actual job start week, not the legacy default.
  // Direction guard: only move the boundary earlier (adding active weeks). Moving it
  // later would remove previously-modeled income and is left to user action.
  if (mergedConfig.startDate) {
    const _weekZeroEnd = new Date(FISCAL_YEAR_START + "T00:00:00");
    const _startTarget = new Date(mergedConfig.startDate + "T00:00:00");
    const _diffDays = (_startTarget - _weekZeroEnd) / 86400000;
    const _derivedIdx = Math.max(0, Math.min(Math.ceil(_diffDays / 7), 51));
    if (_derivedIdx < (mergedConfig.firstActiveIdx ?? 0)) {
      mergedConfig.firstActiveIdx = _derivedIdx;
    }
  }

  // ── taxExemptOptIn → clear taxedWeeks ─────────────────────────────────────────
  // When the user opted into tax-exempt status in the wizard WrapUp step, the engine
  // should not withhold federal/state income tax — only FICA applies. The wizard
  // previously set all active weeks as taxed regardless of this flag. Clear the array
  // so computeNet() uses the untaxed path (grossPay − fica − deductions) for every week.
  // Safe to run every load: no-op when array is already empty.
  if (mergedConfig.taxExemptOptIn === true && (mergedConfig.taxedWeeks ?? []).length > 0) {
    mergedConfig.taxedWeeks = [];
  }

  // ── One-time baseRate correction (night diff separation) ─────────────────────
  // Prior to 2026-03-25 the night shift differential (+$1.50) was baked into
  // baseRate (19.65 + 1.50 = 21.15) rather than tracked as nightDiffRate.
  // Correct stored value so night diff isn't double-counted now that buildYear()
  // computes it separately via nightDiffRate.
  if (data.is_employer_dhl && mergedConfig.baseRate === 21.15) {
    mergedConfig.baseRate = 19.65;
  }

  // ── One-time diffRate correction (weekend differential corrected to $1.75) ───
  // Prior to 2026-04 the weekend diff was assumed to be $3.00/hr. The actual rate
  // is $1.75/hr (weekend) and $1.50/hr (night, tracked separately via nightDiffRate).
  // Any stored value of exactly 3.00 is the old incorrect assumption.
  if (data.is_employer_dhl && mergedConfig.diffRate === 3) {
    mergedConfig.diffRate = 1.75;
  }

  const rawGoals = Array.isArray(data.goals) ? data.goals : [];
  const migratedGoals = rawGoals.map(goal => {
    if (goal && typeof goal === "object") {
      const { category: _legacyCategory, ...rest } = goal;
      return rest;
    }
    return goal;
  });

  const normalizedExpenses = mergedConfig.setupComplete
    ? migratedExpenses.map(normalizeExpenseFoodFlags)
    : ensureInitialFoodExpense(migratedExpenses);

  return {
    config:               mergedConfig,
    expenses:             normalizedExpenses,
    goals:                migratedGoals,
    logs:                 Array.isArray(data.logs)  ? data.logs  : [],
    showExtra:            data.show_extra,
    weekConfirmations:    wcData?.week_confirmations ?? {},
    baseRateHistory,
    isEmployerDHL:                data.is_employer_dhl      ?? false,
    isAdmin:              data.is_admin    ?? false,
    isTester:             data.is_tester   ?? false,
    betaCodeUsed:         data.beta_code_used ?? null,
    betaStartedAt:        data.beta_started_at ?? null,
    taxProjectionsEnabled: data.tax_projections_enabled ?? false,
    ptoGoal:              data.pto_goal    ?? null,
    isInvestor:           data.is_investor ?? false,
    investorProfile:      investorRow,
    activeInvestorAccount: investorRow?.active_account ?? 1,
    subscription:         mapSubscription(subData),
  };
}

/**
 * Upsert all state blobs atomically.
 * Called from a debounced useEffect in App.jsx on any state change, and from
 * App.jsx's eager-save helper (savePersistedStateNow) for actions that need
 * guaranteed persistence before the debounce would otherwise fire.
 * Intentionally destructures only these fields — subscription/trial columns
 * (migration 017) are never accepted here; only the service-role webhook/
 * checkout/portal routes may write them.
 * Returns { ok, message } rather than a plain boolean — savePersistedStateNow
 * surfaces `message` verbatim in the SaveFailedBanner so a real failure (RLS
 * rejection, malformed payload, expired session) is distinguishable from a
 * generic "offline" guess instead of only ever reaching the console. The
 * plain debounced path ignores the return value entirely, same as before.
 */
export async function saveUserData({ config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal }) {
  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, message: "Not signed in" }; // unauthenticated — never write

  const { error } = await supabase
    .from("user_data")
    .upsert(
      {
        user_id:             userId,
        config,
        expenses,
        goals,
        logs,
        show_extra:          showExtra,
        week_confirmations:  weekConfirmations,
        is_employer_dhl:              config.employerPreset === "DHL",
        pto_goal:            ptoGoal ?? null,
        updated_at:          new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Failed to save user data:", error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true, message: null };
}

/**
 * Best-effort save for page unload / backgrounding (App.jsx's beforeunload/
 * pagehide/visibilitychange flush). A normal fetch — what saveUserData()
 * issues via supabase-js — is liable to be aborted by the browser mid-flight
 * the instant the page actually unloads or the OS reclaims a backgrounded
 * mobile tab, silently dropping whatever hadn't saved yet (a just-completed
 * weekly check-in, in-progress goal edits). keepalive:true is the browser's
 * documented mechanism for letting a request finish after the page is gone,
 * but it isn't available through the supabase-js query builder, so this
 * bypasses it and calls the PostgREST upsert endpoint directly — same
 * onConflict:user_id upsert saveUserData() performs.
 *
 * Deliberately synchronous up to the fetch() call (no top-level await):
 * getCachedAuthSnapshot() reads a value kept current by an onAuthStateChange
 * listener rather than awaiting supabase.auth.getSession(), because unload
 * handlers get no guaranteed time to wait on a promise before the page tears
 * down — the fetch has to be dispatched immediately for keepalive to help.
 */
export function flushUserDataKeepalive({ config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal }) {
  const { accessToken, userId } = getCachedAuthSnapshot();
  if (!accessToken || !userId) return; // unauthenticated / snapshot not yet populated — never write

  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_data?on_conflict=user_id`;
  const body = JSON.stringify({
    user_id:             userId,
    config,
    expenses,
    goals,
    logs,
    show_extra:          showExtra,
    week_confirmations:  weekConfirmations,
    is_employer_dhl:     config.employerPreset === "DHL",
    pto_goal:            ptoGoal ?? null,
    updated_at:          new Date().toISOString(),
  });

  try {
    fetch(url, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body,
    }).catch((err) => {
      console.warn("[db] keepalive flush request failed:", err.message);
    });
  } catch (err) {
    // Synchronous throw — most likely the browser's ~64KB keepalive body-size
    // limit. Fall back to the normal (non-keepalive) upsert; same best-effort
    // risk profile the app already had before this hardening, not a regression.
    console.warn("[db] keepalive flush could not be dispatched, falling back:", err.message);
    saveUserData({ config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal });
  }
}

/**
 * Append one config snapshot to account_history (TODO §19 phase 1 write path).
 * New-value snapshot per §19.D2: `config` is the full NEW config taking effect.
 * Fire-and-forget: a failure (e.g. migration 020 not yet run in Supabase) is
 * logged and never blocks the main save path — same tolerance pattern as
 * loadUserData's isolated week_confirmations fetch.
 */
export async function saveConfigSnapshot({ config, changedFields, source, effectiveFrom }) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = await supabase.from("account_history").insert({
    user_id:        userId,
    snapshot:       config,
    changed_fields: changedFields,
    effective_from: effectiveFrom,
    source,
  });

  if (error) {
    console.error("Failed to save config snapshot:", error.message);
  }
}

/**
 * Count + latest row for the admin DB Row Viewer's config-history line
 * (§19.F verification surface). Returns { count, latest } on success,
 * { error } when the table is missing/unreachable — the caller renders
 * whichever it gets.
 */
export async function fetchConfigHistoryMeta() {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error, count } = await supabase
    .from("account_history")
    .select("effective_from, changed_fields, source, created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return { error: error.message };
  return { count: count ?? 0, latest: data?.[0] ?? null };
}

/**
 * §18.H2 — Coach chat & Job Scout search history (migration 023). Fetches the
 * N most recent coach_chats rows for the signed-in user; maps snake_case
 * columns to the camelCase shape the rest of the app uses. Returns [] on no
 * session, no rows, or a missing-table error (migration not yet run) — same
 * tolerance pattern as loadUserData's isolated queries.
 */
export async function loadCoachChats(limit = 20) {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("coach_chats")
    .select("id, chat_type, title, messages, summary, insights, search_params, search_results, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("Failed to load coach chats:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    chatType: row.chat_type,
    title: row.title,
    messages: row.messages ?? [],
    summary: row.summary,
    insights: row.insights,
    searchParams: row.search_params,
    searchResults: row.search_results,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Upserts one coach_chats row (§18.H2). `chat.id` is optional — omit it for a
 * brand-new chat and the DB generates one (returned so the caller can keep
 * upserting into the same row on later messages); pass an existing row's id
 * to update it. `user_id` always comes from the current session, never from
 * the caller, so a chat can never be silently reassigned to another account.
 * Returns the row's id on success, null on failure or no session.
 */
export async function saveCoachChat(chat) {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const row = {
    ...(chat.id ? { id: chat.id } : {}),
    user_id: userId,
    chat_type: chat.chatType,
    title: chat.title ?? null,
    messages: chat.messages ?? [],
    summary: chat.summary ?? null,
    insights: chat.insights ?? null,
    search_params: chat.searchParams ?? null,
    search_results: chat.searchResults ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("coach_chats")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save coach chat:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Hard-deletes a single coach_chats row by id (§18.H2 — swipe-to-delete /
 * long-press in the future history list). The extra `user_id` filter is
 * defense-in-depth on top of RLS's own-row policy — same double-check pattern
 * already used for the investor_users delete below.
 */
export async function deleteCoachChat(id) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("coach_chats")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to delete coach chat:", error.message);
  }
}

/**
 * §18.E1 — Résumé Review v1 storage (migration 036). One row per user
 * (`user_id` is the table's primary key, not a surrogate `id`), so this is a
 * load-one/upsert-one shape rather than coach_chats' list shape. Returns null
 * on no session, no saved profile yet, or a missing-table error — same
 * tolerance pattern as loadCoachChats.
 */
export async function loadResumeProfile() {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("resume_profile")
    .select("resume_text, target_role, last_reviewed_at, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Failed to load resume profile:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    resumeText: data.resume_text ?? "",
    targetRole: data.target_role ?? "",
    lastReviewedAt: data.last_reviewed_at,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Upserts the signed-in user's resume_profile row by `user_id` (the table's
 * primary key), so this never creates a second row for the same account.
 * `user_id` always comes from the session, never the caller. Returns true on
 * success, false on failure or no session.
 */
export async function saveResumeProfile(profile) {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const row = {
    user_id: userId,
    resume_text: profile.resumeText ?? null,
    target_role: profile.targetRole ?? null,
    last_reviewed_at: profile.lastReviewedAt ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("resume_profile")
    .upsert(row, { onConflict: "user_id" });

  if (error) {
    console.error("Failed to save resume profile:", error.message);
    return false;
  }
  return true;
}

/**
 * Creates a full investor account in three atomic steps:
 *   1. Supabase auth user (email + password)
 *   2. investor_users profile row
 *   3. user_data row seeded with investor config
 *
 * Returns { session, error, needsConfirmation }.
 *   session           — Supabase session (null if email confirmation required)
 *   error             — string on failure, null on success
 *   needsConfirmation — true when Supabase sends a confirmation email before
 *                       granting a session (project email-confirm setting is on)
 *
 * On investor_users insert failure the auth user already exists — the investor
 * can re-attempt; signUp is idempotent for unconfirmed users. On user_data
 * failure we delete the investor_users row and surface the error.
 */
export async function createInvestorAccount({ name, email, password, company, city, codeUsed }) {
  // Step 1 — auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  });
  if (authError) return { session: null, error: authError.message, needsConfirmation: false };

  const user = authData.user;
  if (!user) return { session: null, error: "Account creation failed — no user returned.", needsConfirmation: false };

  const needsConfirmation = !authData.session;

  // Step 2 — investor_users profile
  const { error: profileError } = await supabase.from("investor_users").insert({
    auth_user_id:   user.id,
    investor_name:  name,
    email,
    company_name:   company ?? null,
    city:           city ?? null,
    code_used:      codeUsed ?? null,
    code_used_at:   codeUsed ? new Date().toISOString() : null,
    active_account: 1,
  });
  if (profileError) {
    return { session: null, error: profileError.message, needsConfirmation: false };
  }

  // Step 3 — user_data row seeded with investor config. is_investor itself is
  // NOT written here — it's a privileged column (migration
  // 019_enable_user_data_rls.sql) the client can no longer set directly; it's
  // granted below via the service-role api/seed.js route instead (type: "investor" —
  // consolidated from the former api/seed-investor.js to stay under Vercel's
  // Hobby-plan 12-function-per-deployment cap).
  const investorConfig = {
    ...DEFAULT_CONFIG,
    isInvestor:      true,
    investorName:    name,
    investorCompany: company ?? null,
    investorCity:    city ?? null,
    setupComplete:   false,
  };
  const { error: dataError } = await supabase.from("user_data").upsert(
    {
      user_id:    user.id,
      config:     investorConfig,
      expenses:   [],
      goals:      [],
      logs:       [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (dataError) {
    // Rollback investor_users so a re-attempt can cleanly re-insert
    await supabase.from("investor_users").delete().eq("auth_user_id", user.id);
    return { session: null, error: dataError.message, needsConfirmation: false };
  }

  // Step 4 — grant is_investor. Requires a session, so this only runs when
  // email confirmation isn't pending; if it is, there's no access token yet
  // to authenticate the call, and is_investor stays unset until a follow-up
  // sign-in flow seeds it (a pre-existing gap for unauthenticated writes to
  // this table that migration 019 introduces regardless of this function).
  if (authData.session?.access_token) {
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.session.access_token}`,
        },
        body: JSON.stringify({ type: "investor", code: codeUsed }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        return { session: authData.session, error: payload?.error || "Failed to grant investor access", needsConfirmation };
      }
    } catch {
      return { session: authData.session, error: "Failed to grant investor access", needsConfirmation };
    }
  }

  return { session: authData.session, error: null, needsConfirmation };
}

/**
 * Persists the investor's active account tab selection (1 | 2 | 3) to
 * investor_users.active_account. Fire-and-forget from the accounts pill.
 */
export async function saveInvestorActiveAccount(accountNum) {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase
    .from("investor_users")
    .update({ active_account: accountNum })
    .eq("auth_user_id", userId);
  if (error) console.error("saveInvestorActiveAccount failed:", error.message);
}

// ── Admin: Investor Code Management ──────────────────────────────────────────
// All functions below require is_admin = true in user_data (enforced by RLS
// via migration 013_investor_admin_policies.sql).

/**
 * Fetches ALL investor_codes rows — including inactive ones — for the admin UI.
 * Regular users (and anon) can only SELECT is_active = true via the existing policy.
 */
export async function fetchAllInvestorCodes() {
  const { data, error } = await supabase
    .from("investor_codes")
    .select("id, code, label, is_active, notes, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Fetches ALL investor_users rows for the admin usage log.
 * Returns name, company, city, code used, and registration date.
 */
export async function fetchAllInvestorUsers() {
  const { data, error } = await supabase
    .from("investor_users")
    .select("id, investor_name, company_name, city, code_used, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Toggles is_active on a single investor_codes row.
 */
export async function setInvestorCodeActive(id, isActive) {
  const { error } = await supabase
    .from("investor_codes")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Inserts a new investor_codes row. Code is stored lowercase.
 * Returns the inserted row.
 */
export async function createInvestorCode({ code, label, notes }) {
  const { data, error } = await supabase
    .from("investor_codes")
    .insert({
      code:  code.trim().toLowerCase(),
      label: label.trim() || null,
      notes: notes.trim() || null,
    })
    .select("id, code, label, is_active, notes, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Demo Account Load / Save (migration 015_add_demo_accounts.sql) ──────────
// SELECT: any authenticated user — investors see admin-edited demo data.
// INSERT/UPDATE: enforced by RLS to is_admin = true only.

/**
 * Fetches a demo account row from Supabase.
 * Returns null if no custom row exists (caller falls back to fixture).
 */
export async function loadDemoAccount(accountNumber) {
  const { data, error } = await supabase
    .from("demo_accounts")
    .select("config, expenses, goals, logs, meta")
    .eq("account_number", accountNumber)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/**
 * Upserts a demo account row. Only succeeds when the caller has is_admin = true
 * (enforced by RLS in migration 015_add_demo_accounts.sql).
 * Throws on error so the caller can surface feedback to the admin.
 */
export async function saveDemoAccount(accountNumber, { config, expenses, goals, logs, meta }) {
  const { error } = await supabase
    .from("demo_accounts")
    .upsert(
      {
        account_number: accountNumber,
        config:    config   ?? {},
        expenses:  expenses ?? [],
        goals:     goals    ?? [],
        logs:      logs     ?? [],
        meta:      meta     ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_number" }
    );
  if (error) throw new Error(error.message);
}

/**
 * Called on every SIGNED_IN auth event. Does two things:
 *   1. Syncs Google profile metadata (full_name, avatar_url) into the row so the
 *      ProfilePanel can surface them without a separate API call. display_name/
 *      avatar_url are client-writable, so this stays a direct upsert.
 *   2. Seeds the trial window (trial_started_at/trial_ends_at/access_ends_at,
 *      subscription_status="trialing") via the service-role api/seed.js
 *      route (type: "trial" — consolidated from the former api/seed-trial.js
 *      to stay under Vercel's Hobby-plan 12-function-per-deployment cap) —
 *      those columns are privileged (migration 019_enable_user_data_rls.sql
 *      revokes client write access to them), so the client can no longer set
 *      them directly. The route itself decides whether this is a brand-new
 *      user (keyed off trial_started_at IS NULL) and no-ops for returning
 *      users.
 * Safe to call for email/password users — no-op if no metadata present.
 */
export async function syncUserProfile(user) {
  if (!user?.id) return;
  const meta = user.user_metadata ?? {};
  const patch = {};
  if (meta.full_name)  patch.display_name = meta.full_name;
  if (meta.avatar_url) patch.avatar_url   = meta.avatar_url;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
    if (error) console.warn("syncUserProfile profile metadata failed:", error.message);
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return;
    const res = await fetch("/api/seed", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "trial" }),
    });
    if (!res.ok) console.warn("syncUserProfile trial seed failed:", res.status);
  } catch (err) {
    console.warn("syncUserProfile trial seed failed:", err.message);
  }
}

/**
 * §17.I — does the signed-in user's email match an open (un-revived)
 * deleted_accounts tombstone? Called by App.jsx on SIGNED_IN BEFORE
 * syncUserProfile, because an OAuth sign-in with a previously-deleted email
 * silently creates a brand-new auth user — without this check that new user
 * would be seeded a fresh free trial, which a non-payment-deleted account
 * must never get. Returns the revival info object ({ revivable, email,
 * oauthProvider, displayName, avatarUrl, plan }) or null; any lookup failure
 * resolves null so a transient error can't lock a normal user out of login.
 */
export async function checkRevival() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return null;
    const res = await fetch("/api/revival-lookup", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const payload = await res.json().catch(() => null);
    return payload?.revivable ? payload : null;
  } catch (err) {
    console.warn("checkRevival failed:", err.message);
    return null;
  }
}

/**
 * Redeems a beta program access code on the CALLER's own already-existing
 * account (docs/TODO.md §32) — unlike investor codes, this doesn't create a
 * new account, it upgrades one that's already signed in. POSTs to api/seed.js
 * (type: "beta" — consolidated from the former api/seed-beta.js, api/seed-investor.js,
 * and api/seed-trial.js into one route to stay under Vercel's Hobby-plan
 * 12-function-per-deployment cap). Returns { ok: true } on success,
 * { ok: false, error, retryable } otherwise — the caller (ProfilePanel) is
 * responsible for reloading state after success, since is_tester/beta_code_used
 * are read-only fields loadUserData maps in.
 *
 * `retryable` tells a caller that auto-retries (App.jsx's signup-link handoff)
 * whether trying the same code again later could plausibly succeed: true for
 * a missing session or a network/server (5xx) failure — neither says anything
 * about the code itself — false for a 4xx rejection (missing code, invalid/
 * inactive/already-claimed code, seat cap full), which will fail identically
 * on every retry since it's the request itself that's wrong.
 */
export async function redeemBetaCode(code) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return { ok: false, error: "Not signed in", retryable: true };

  try {
    const res = await fetch("/api/seed", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "beta", code }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: payload?.error || "Invalid or inactive beta code", retryable: res.status >= 500 };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message, retryable: true };
  }
}

/**
 * Beta usage-tracking event log (docs/TODO.md — beta usage scoring;
 * database/migrations/026_add_beta_activity_events.sql).
 *
 * Gate lives here, once, rather than at each of the three call sites (App.jsx
 * login, HomePanel goal actions, BudgetPanel expense actions) — every caller
 * passes the same isTester/betaCodeUsed pair through isTrackedBetaTester()
 * instead of re-deriving the check inline, so the friends/family exclusion
 * can't drift call-site by call-site. A no-op (not an error) for any account
 * that isn't a tracked beta tester — this is expected to be called
 * unconditionally from UI event handlers, not pre-guarded by callers.
 */
export async function logBetaEvent({ isTester, betaCodeUsed, eventType }) {
  if (!isTrackedBetaTester({ isTester, betaCodeUsed })) return;
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = await supabase
    .from("beta_activity_events")
    .insert({ user_id: userId, event_type: eventType });

  if (error) console.warn("logBetaEvent failed:", error.message);
}

/**
 * Beta feedback submission (docs/TODO.md §33, migration
 * 030_add_beta_feedback.sql) — a 'feedback' event carrying the actual text in
 * `note`, so it's both countable (rubric's "frequency") and readable (rubric's
 * "specificity"), unlike the mailto link this replaces.
 *
 * Unlike logBetaEvent (fire-and-forget background logging from UI actions
 * that already succeeded), this is a user-initiated submit the caller needs
 * to confirm — returns { ok, error } the same shape as redeemBetaCode, so
 * ProfilePanel can show a real success/error state.
 */
export async function logBetaFeedback({ isTester, betaCodeUsed, note }) {
  if (!isTrackedBetaTester({ isTester, betaCodeUsed })) {
    return { ok: false, error: "Not part of the tracked beta cohort" };
  }
  const trimmed = (note ?? "").trim();
  if (!trimmed) return { ok: false, error: "Feedback can't be empty" };

  const userId = await getCurrentUserId();
  if (!userId) return { ok: false, error: "Not signed in" };

  const { error } = await supabase
    .from("beta_activity_events")
    .insert({ user_id: userId, event_type: "feedback", note: trimmed });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Admin-managed "What's New" changelog (database/migrations/032_add_changelog_entries.sql).
 * Paired with UpdateAvailableBanner — see App.jsx's changelog-fetch effect.
 *
 * Reads the single most recent PUBLISHED entry directly via the client (RLS
 * policy on changelog_entries restricts this to published_at IS NOT NULL —
 * no draft ever leaks through this path). Returns null on any error so a
 * transient failure here degrades to "no changelog," never a crash — this is
 * a nice-to-have banner enhancement, not core functionality.
 */
export async function fetchLatestPublishedChangelog() {
  const { data, error } = await supabase
    .from("changelog_entries")
    .select("id, version_label, title, body, published_at")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function changelogAuthHeaders() {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return null;
  return { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
}

/**
 * Admin authoring list — every entry (drafts included), via api/admin-changelog.js's
 * service-role GET. Never call this for the ordinary "is there something new"
 * check; use fetchLatestPublishedChangelog for that (draft rows must never
 * reach a non-admin surface).
 */
export async function fetchAllChangelogEntries() {
  const headers = await changelogAuthHeaders();
  if (!headers) return { ok: false, error: "Not signed in", entries: [] };
  try {
    const res = await fetch("/api/admin-changelog", { method: "GET", headers });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: payload?.error || "Failed to load entries", entries: [] };
    return { ok: true, entries: payload.entries ?? [] };
  } catch (err) {
    return { ok: false, error: err.message, entries: [] };
  }
}

/**
 * Create (no id) or update (id present) a changelog entry. `published` toggles
 * draft<->published — api/admin-changelog.js owns the published_at timestamp
 * logic (preserves the original publish time on a stays-published re-save).
 */
export async function saveChangelogEntry({ id, versionLabel, title, body, published }) {
  const headers = await changelogAuthHeaders();
  if (!headers) return { ok: false, error: "Not signed in" };
  try {
    const res = await fetch("/api/admin-changelog", {
      method: "POST",
      headers,
      body: JSON.stringify({ id, versionLabel, title, body, published }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: payload?.error || "Failed to save entry" };
    return { ok: true, entry: payload.entry };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function deleteChangelogEntry(id) {
  const headers = await changelogAuthHeaders();
  if (!headers) return { ok: false, error: "Not signed in" };
  try {
    const res = await fetch(`/api/admin-changelog?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: payload?.error || "Failed to delete entry" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Terms of Service / Privacy Policy consent (database/migrations/033_add_consent_records.sql).
 * Direct client insert (not routed through an API route like the changelog
 * admin writes) — RLS restricts this to the caller's own user_id, and the
 * DB-side trigger forces consented_at, so a raw client insert is safe here:
 * a malicious client can only ever write a truthful "I agreed" row for
 * itself, never spoof another user or a fabricated timestamp. Append-only —
 * no update/delete path exists for this table, by design.
 */
export async function recordConsent(userId, policyVersion) {
  if (!userId || !policyVersion) return { ok: false, error: "Missing userId or policyVersion" };
  const { error } = await supabase
    .from("consent_records")
    .insert({ user_id: userId, policy_version: policyVersion });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Most recent consent record for the CALLER's own account (RLS-scoped, same
 * as recordConsent). Used by App.jsx's re-consent check — currently only
 * acted on when constants/legalDocuments.js's ENFORCE_EXISTING_USER_RECONSENT
 * is true. Returns null (never throws) on any error or missing row, same
 * "degrade quietly" posture as fetchLatestPublishedChangelog.
 */
export async function fetchLatestConsent(userId) {
  const { data, error } = await supabase
    .from("consent_records")
    .select("policy_version, consented_at")
    .eq("user_id", userId)
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}
