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
      isDHL:              false,
      isAdmin:            false,
    };
  }

  // Select core fields first — week_confirmations is fetched separately so a missing
  // column (migration not yet run) doesn't blow up the entire load.
  const { data, error } = await supabase
    .from("user_data")
    .select("config, expenses, goals, logs, show_extra, is_dhl, is_admin, pto_goal, is_investor")
    .eq("user_id", userId)
    .single();

  // Fetch week_confirmations independently; gracefully returns {} if column missing.
  const { data: wcData } = await supabase
    .from("user_data")
    .select("week_confirmations")
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
      isDHL:              false,
      isAdmin:            false,
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

  // ── Pre-wizard migration for DHL users ───────────────────────────────────────
  // Fires once for any DHL user whose row pre-dates the setup wizard (setupComplete absent).
  // Sets the DHL employer preset, marks setupComplete, and promotes legacy rate field names.
  // Scoped to is_dhl === true so it never runs for standard or future multi-user accounts.
  //
  // startingWeekIsLong: false — verified against INITIAL_LOGS week 10 = "6-Day":
  //   offset = ((10 - firstActiveIdx) % 2 + 2) % 2 = 1 → isHighWeek = !startingWeekIsLong
  //   so !startingWeekIsLong must be true → startingWeekIsLong must be false.
  if (data.is_dhl && !mergedConfig.setupComplete) {
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
  // Trigger condition: is_dhl + dhlTeam still null (pre-wizard, never corrected).
  // Sets all three fields needed for Anthony's custom schedule correctly.
  if (data.is_dhl && mergedConfig.dhlTeam === null) {
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

  // ── One-time baseRate correction (night diff separation) ─────────────────────
  // Prior to 2026-03-25 the night shift differential (+$1.50) was baked into
  // baseRate (19.65 + 1.50 = 21.15) rather than tracked as nightDiffRate.
  // Correct stored value so night diff isn't double-counted now that buildYear()
  // computes it separately via nightDiffRate.
  if (data.is_dhl && mergedConfig.baseRate === 21.15) {
    mergedConfig.baseRate = 19.65;
  }

  // ── One-time diffRate correction (weekend differential corrected to $1.75) ───
  // Prior to 2026-04 the weekend diff was assumed to be $3.00/hr. The actual rate
  // is $1.75/hr (weekend) and $1.50/hr (night, tracked separately via nightDiffRate).
  // Any stored value of exactly 3.00 is the old incorrect assumption.
  if (data.is_dhl && mergedConfig.diffRate === 3) {
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
    isDHL:                data.is_dhl      ?? false,
    isAdmin:              data.is_admin    ?? false,
    ptoGoal:              data.pto_goal    ?? null,
    isInvestor:           data.is_investor ?? false,
    investorProfile:      investorRow,
    activeInvestorAccount: investorRow?.active_account ?? 1,
  };
}

/**
 * Upsert all state blobs atomically.
 * Called from a debounced useEffect in App.jsx on any state change.
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
        is_dhl:              config.employerPreset === "DHL",
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

  // Step 3 — user_data row seeded with investor config
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
      is_investor: true,
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

/**
 * Called on every SIGNED_IN auth event. Does two things:
 *   1. Seeds a user_data row for OAuth users (email sign-up does this explicitly;
 *      OAuth sign-in does not — this closes that gap).
 *   2. Syncs Google profile metadata (full_name, avatar_url) into the row so the
 *      ProfilePanel can surface them without a separate API call.
 * Safe to call for email/password users — no-op if no metadata present.
 */
export async function syncUserProfile(user) {
  if (!user?.id) return;
  const meta = user.user_metadata ?? {};
  const patch = { user_id: user.id };
  if (meta.full_name)  patch.display_name = meta.full_name;
  if (meta.avatar_url) patch.avatar_url   = meta.avatar_url;
  const { error } = await supabase.from("user_data").upsert(patch, { onConflict: "user_id" });
  if (error) console.warn("syncUserProfile failed:", error.message);
}
