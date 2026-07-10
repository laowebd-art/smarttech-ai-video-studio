import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // We don't throw here so the app can still render a helpful setup screen
  // instead of a blank white page when .env.local hasn't been configured yet.
  console.warn(
    "[SmartTech AI Video Studio] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env.local and fill in your Supabase project credentials."
  );
}

// IMPORTANT: only ever use the public "anon" key in frontend code.
// The service_role key must never be shipped to the browser — it belongs
// exclusively in server-side Edge Functions / API routes (Phase 2+).
//
// NOTE: the client is intentionally untyped (no Database generic) in Phase 1.
// src/types/database.types.ts documents the schema and is used directly by
// application code (services, components) via explicit casts. Once you run
// `npx supabase gen types typescript` against your real project, you can
// re-introduce `createClient<Database>()` for full end-to-end type safety.
export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
