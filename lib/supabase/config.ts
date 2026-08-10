// NEXT_PUBLIC_* vars are inlined at build time, so this is safe to check from
// both server and client components.
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/** Server-only. The machine-to-machine routes n8n calls need the service-role
 *  key on top of the public config - checked separately so those routes can
 *  answer "not configured yet" explicitly instead of throwing a 500 that
 *  looks like a bug on n8n's side. */
export const isServiceRoleConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
