import { createClient } from "@/supabase/server";

export type Assistant = {
  id: string;
  created_at: string;
  name: string | null;
  email: string;
  star: number | null;
  salary_sheet: string | null;
  daily_schedule_sheet: string | null;
  clickup_id: string | null;
  is_active: boolean | null;
  employment_type: "full-time" | "part-time" | "intern" | "regular" | null;
};

export async function getAssistants() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching assistant:", error.message, error.details, error.hint);
    throw error;
  }

  return data as Assistant[];
}

/**
 * Fetches only active assistants, ordered by name.
 */
export async function getActiveAssistants() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching active assistants:", error.message, error.details, error.hint);
    throw error;
  }

  return data as Assistant[];
}

export async function getAssistantById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Error fetching assistant ${id}:`, error);
    throw error;
  }

  return data as Assistant;
}

export async function createAssistant(assistant: Partial<Assistant>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant")
    .insert([assistant])
    .select()
    .single();

  if (error) {
    console.error("Error creating assistant:", error);
    throw error;
  }

  return data as Assistant;
}

export async function updateAssistant(id: string, assistant: Partial<Assistant>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assistant")
    .update(assistant)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(`Error updating assistant ${id}:`, error);
    throw error;
  }

  return data as Assistant;
}

export async function deleteAssistant(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("assistant")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`Error deleting assistant ${id}:`, error);
    throw error;
  }

  return { success: true };
}
