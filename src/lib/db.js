import { supabase, USER_ID } from "./supabase.js";
import {
  DEFAULT_CONFIG,
  INITIAL_EXPENSES,
  INITIAL_GOALS,
  INITIAL_LOGS,
  FISCAL_YEAR_START,
} from "../constants/config.js";
import { buildLoanHistory } from "./finance.js";

/**
 * Load the single user row from Supabase.
 * Falls back to app defaults if the row is empty or missing.
 */
export async function loadUserData() {
  // Select core fields first — week_confirmations is fetched separately so a missing
  // column (migration not yet run) doesn't blow up the entire load.
  const { data, error } = await supabase
    .from("user_data")
    .select("config, expenses, goals, logs, show_extra")
    .eq("user_id", USER_ID)
    .single();

  // Fetch week_confirmations independently; gracefully returns {} if column missing.
  const { data: wcData } = await supabase
    .from("user_data")
    .select("week_confirmations")
    .eq("user_id", USER_ID)
    .single();

  if (error || !data) {
    console.warn("No user_data row found, using defaults.", error?.message);
    return {
      config:             DEFAULT_CONFIG,
      expenses:           INITIAL_EXPENSES,
      goals:              INITIAL_GOALS,
      logs:               INITIAL_LOGS,
      showExtra:          true,
      weekConfirmations:  {},
    };
  }

  // Migrate and normalize all expenses on load
  const PROJECT_START = FISCAL_YEAR_START;
  const rawExpenses = data.expenses.length ? data.expenses : INITIAL_EXPENSES;
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
    return { ...base, history: migratedHistory, note: migratedNote };
  });

  return {
    config:    Object.keys(data.config).length   ? data.config   : DEFAULT_CONFIG,
    expenses:  migratedExpenses,
    goals:     data.goals.length                 ? data.goals     : INITIAL_GOALS,
    logs:      data.logs.length                  ? data.logs      : INITIAL_LOGS,
    showExtra:          data.show_extra,
    weekConfirmations:  wcData?.week_confirmations ?? {},
  };
}

/**
 * Upsert all state blobs atomically.
 * Called from a debounced useEffect in App.jsx on any state change.
 */
export async function saveUserData({ config, expenses, goals, logs, showExtra, weekConfirmations }) {
  const { error } = await supabase
    .from("user_data")
    .upsert(
      {
        user_id:             USER_ID,
        config,
        expenses,
        goals,
        logs,
        show_extra:          showExtra,
        week_confirmations:  weekConfirmations,
        updated_at:          new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Failed to save user data:", error.message);
  }
}
