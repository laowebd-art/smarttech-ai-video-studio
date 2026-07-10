import { createClient } from "@supabase/supabase-js";

// ============================================================================
// Server-side Supabase client using the SERVICE ROLE key.
//
// This client bypasses Row Level Security, so it must NEVER be imported into
// any frontend (src/) code and the service_role key must never be exposed to
// the browser. It is only safe to use here, inside the Express server, which
// runs entirely server-side.
// ============================================================================

const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "[server] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
      "Auth verification and usage logging will fail until these are set in your server environment."
  );
}

export const supabaseAdmin = createClient(supabaseUrl ?? "", serviceRoleKey ?? "", {
  auth: { autoRefreshToken: false, persistSession: false },
});
