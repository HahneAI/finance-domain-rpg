import { supabase, USER_ID } from "./supabase.js";
import {
  DEFAULT_CONFIG,
  INITIAL_EXPENSES,
  INITIAL_GOALS,
  INITIAL_LOGS,
} from "../constants/config.js";

/**
 * Load the single user row from Supabase.
 * Falls back to app defaults if the row is empty or missing.
 */
export async function loadUserData() {
  const { data, error } = await supabase
    .from("user_data")
    .select("config, expenses, goals, logs, show_extra")
    .eq("user_id", USER_ID)
    .single();

  if (error || !data) {
    console.warn("No user_data row found, using defaults.", error?.message);
    return {
      config:    DEFAULT_CONFIG,
      expenses:  INITIAL_EXPENSES,
      goals:     INITIAL_GOALS,
      logs:      INITIAL_LOGS,
      showExtra: true,
    };
  }

  return {
    config:    Object.keys(data.config).length   ? data.config   : DEFAULT_CONFIG,
    expenses:  data.expenses.length              ? data.expenses  : INITIAL_EXPENSES,
    goals:     data.goals.length                 ? data.goals     : INITIAL_GOALS,
    logs:      data.logs.length                  ? data.logs      : INITIAL_LOGS,
    showExtra: data.show_extra,
  };
}

/**
 * Upsert all 5 state blobs atomically.
 * Called from a debounced useEffect in App.jsx on any state change.
 */
export async function saveUserData({ config, expenses, goals, logs, showExtra }) {
  const { error } = await supabase
    .from("user_data")
    .upsert(
      {
        user_id:    USER_ID,
        config,
        expenses,
        goals,
        logs,
        show_extra: showExtra,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Failed to save user data:", error.message);
  }
}
