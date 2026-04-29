const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseEnvVars() {
  return Boolean(supabaseUrl && supabaseKey);
}

export function getSupabaseEnv() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY), then restart the Next.js dev server.",
    );
  }

  return {
    supabaseUrl,
    supabaseKey,
  };
}
