"use server";
import { createInternalClient } from "@/supabase/server";
import { createClient as createDocployClient } from "@supabase/supabase-js";
import { getEmbedding, chunkText } from "./rag";

/**
 * Handle direct text ingestion into the SOP table (after client-side PDF parsing).
 */
export async function ingestText(text: string, filename: string) {
  try {
    if (!text) throw new Error("No text provided");

    const chunks = chunkText(text, 1000);
    const INGEST_WEBHOOK_URL = process.env.INGEST_WEBHOOK_URL || "https://n8n.heysnaply.com/webhook/ingest-knowledge";
    let uploadedCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // Fast, 0-cost title extraction for n8n base value
      const baseTitle = chunk.split('\n')[0].slice(0, 60).replace(/[#*•○[\]]/g, "").trim() || filename;
      
      console.log(`[Ingest] Streaming Section ${i + 1}/${chunks.length} to n8n...`);

      const res = await fetch(INGEST_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: chunk,
          prompt: chunk, // Your llama3.1:8b node requirement
          filename: filename,
          source_name: filename,
          ai_title: baseTitle,
          date: new Date().toISOString()
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        throw new Error(`n8n failed (${res.status}): ${errorBody || res.statusText}`);
      }
      uploadedCount++;
    }

    return { success: true, chunks: uploadedCount };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("INGESTION ERROR:", err);
    return { error: errorMsg || "Failed to process content" };
  }
}

/**
 * Update an existing SOP document and its embedding.
 */
export async function updateSOP(id: number, content: string, title?: string) {
  try {
    let supabase = createInternalClient();
    const docployUrl = process.env.NEXT_PUBLIC_DOCPLOY_SUPABASE_URL || process.env.DOCPLOY_SUPABASE_URL;
    const docployKey = process.env.NEXT_PUBLIC_DOCPLOY_ANON_KEY || process.env.DOCPLOY_SERVICE_ROLE_KEY;
    if (docployUrl && docployKey) {
       supabase = createDocployClient(docployUrl, docployKey);
    }

    const { error } = await supabase
      .from("SOP_VIA")
      .update({ 
        content, 
        ai_title: title,
        metadata: { 
          updated_at: new Date().toISOString(),
          is_edited: true
        }
      })
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("UPDATE SOP ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Delete an SOP document by source name.
 */
export async function deleteSOP(source_name: string) {
  try {
    if (!source_name) throw new Error("No source name provided");
    
    let supabase = createInternalClient();
    const docployUrl = process.env.NEXT_PUBLIC_DOCPLOY_SUPABASE_URL || process.env.DOCPLOY_SUPABASE_URL;
    const docployKey = process.env.NEXT_PUBLIC_DOCPLOY_ANON_KEY || process.env.DOCPLOY_SERVICE_ROLE_KEY;
    if (docployUrl && docployKey) {
       supabase = createDocployClient(docployUrl, docployKey);
    }

    const { error } = await supabase.from("SOP_VIA").delete().eq("source_name", source_name);
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("DELETE SOP ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Update an Assistant/Team Member.
 */
export async function updateAssistant(id: string, data: Partial<{ name: string; email: string; is_active: boolean; employment_type: string }>) {
  try {
    const supabase = createInternalClient();
    const { error } = await supabase
      .from("assistant")
      .update(data)
      .eq("id", id);

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("UPDATE ASSISTANT ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Delete a Team Member.
 */
export async function deleteAssistant(id: string) {
  try {
    const supabase = createInternalClient();
    const { error } = await supabase.from("assistant").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("DELETE ASSISTANT ERROR:", err);
    return { error: errorMsg };
  }
}

/**
 * Create a new team member.
 */
export async function createAssistant(data: { name: string; email: string; is_active: boolean; employment_type: string }) {
  try {
    const supabase = createInternalClient();
    const { error } = await supabase.from("assistant").insert(data);
    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("CREATE ASSISTANT ERROR:", err);
    return { error: errorMsg };
  }
}
