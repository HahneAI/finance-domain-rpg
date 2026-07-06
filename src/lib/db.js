import { supabase, getCurrentUserId } from "./supabase.js";
import {
  DEFAULT_CONFIG,
  INITIAL_EXPENSES,
  INITIAL_GOALS,
  INITIAL_LOGS,
  FISCAL_YEAR_START,
} from "../constants/config.js";
import { buildLoanHistory } from "./finance.js";

const FOOD_DEFAULT_MONTHLY = 400;
const FOOD_DEFAULT_WEEKLY = FOOD_DEFAULT_MONTHLY / 4;

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

const ensureInitialFoodExpense = (expenses) => {
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
      isEmployerDHL:              false,
      isAdmin:            false,
      taxProjectionsEnabled: false,
      subscription:       DEFAULT_SUBSCRIPTION,
    };
  }

  // Select core fields first — week_confirmations is fetched separately so a missing
  // column (migration not yet run) doesn't blow up the entire load.
  const { data, error } = await supabase
    .from("user_data")
    .select("config, expenses, goals, logs, show_extra, is_employer_dhl, is_admin, pto_goal, is_investor, tax_projections_enabled")
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

  if (error || !data) {
    console.warn("No user_data row found, using defaults.", error?.message);
    return {
      config:             DEFAULT_CONFIG,
      expenses:           INITIAL_EXPENSES,
      goals:              INITIAL_GOALS,
      logs:               INITIAL_LOGS,
      showExtra:          true,
      weekConfirmations:  {},
      isEmployerDHL:              false,
      isAdmin:            false,
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
    isEmployerDHL:                data.is_employer_dhl      ?? false,
    isAdmin:              data.is_admin    ?? false,
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
 * Called from a debounced useEffect in App.jsx on any state change.
 * Intentionally destructures only these fields — subscription/trial columns
 * (migration 017) are never accepted here; only the service-role webhook/
 * checkout/portal routes may write them.
 */
export async function saveUserData({ config, expenses, goals, logs, showExtra, weekConfirmations, ptoGoal }) {
  const userId = await getCurrentUserId();
  if (!userId) return; // unauthenticated — never write

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
  // granted below via the service-role api/seed-investor route instead.
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
      const res = await fetch("/api/seed-investor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.session.access_token}`,
        },
        body: JSON.stringify({ code: codeUsed }),
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
 *      subscription_status="trialing") via the service-role api/seed-trial
 *      route — those columns are privileged (migration
 *      019_enable_user_data_rls.sql revokes client write access to them), so
 *      the client can no longer set them directly. The route itself decides
 *      whether this is a brand-new user (keyed off trial_started_at IS NULL)
 *      and no-ops for returning users.
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
    const res = await fetch("/api/seed-trial", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) console.warn("syncUserProfile trial seed failed:", res.status);
  } catch (err) {
    console.warn("syncUserProfile trial seed failed:", err.message);
  }
}
