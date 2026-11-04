export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * `apps/api`'s base URL, read at request time. Server-only on purpose (no
 * `NEXT_PUBLIC_`): only Server Components call the Public API, and the
 * browser never needs the URL. Unset: the dashboard shows its error state.
 */
export const publicApiUrl = () => process.env.PUBLIC_API_URL ?? "";
