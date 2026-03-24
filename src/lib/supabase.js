import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Hardcoded single-user ID — replace with your chosen UUID.
// When adding auth later, replace with: (await supabase.auth.getUser()).data.user.id
export const USER_ID = import.meta.env.VITE_USER_ID;
