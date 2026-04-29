"use client";

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )?.trim();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      `Missing Supabase client env vars. URL set: ${Boolean(
        supabaseUrl,
      )}, key set: ${Boolean(
        supabaseKey,
      )}. Expected NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).`,
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
