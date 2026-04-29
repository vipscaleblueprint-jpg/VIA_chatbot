"use server";
import { createClient } from "@supabase/supabase-js";

export async function fetchDocploySOPs() {
  try {
    const docployUrl = process.env.NEXT_PUBLIC_DOCPLOY_SUPABASE_URL;
    const docployKey = process.env.NEXT_PUBLIC_DOCPLOY_ANON_KEY;
    
    // If not defined, return empty array to fall back safely
    if (!docployUrl || !docployKey) return [];

    const client = createClient(docployUrl, docployKey);
    const { data, error } = await client.from("SOP_VIA").select("*").order("created_at", { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (err: unknown) {
    console.error("Server Action SOP Fetch Error:", err);
    throw new Error(err instanceof Error ? err.message : "Failed to fetch SOP from Docploy server");
  }
}
