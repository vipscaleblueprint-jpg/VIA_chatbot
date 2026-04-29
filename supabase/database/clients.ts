import { createClient, createInternalClient } from "@/supabase/server";

export type Client = {
  id: string;
  created_at: string;
  name: string | null;
  tracker: string | null;
  isActive: boolean | null;
  clickup_id: string | null;
  star: number | null;
  kyc_link: string | null;
  clockify_id: string | null;
  vps: string | null;
};

export async function getClients() {
  const supabase = await createClient();
  let { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("isActive", true)
    .order("name", { ascending: true });

  if (error) {
    console.warn("Retrying getClients with internal client due to error:", error.message);
    const internalSupabase = createInternalClient();
    const { data: internalData, error: internalError } = await internalSupabase
      .from("clients")
      .select("*")
      .eq("isActive", true)
      .order("name", { ascending: true });
    
    if (internalError) {
        console.error("Error fetching clients even with internal client:", {
          message: internalError.message,
          details: internalError.details,
          code: internalError.code
        });
        throw internalError;
    }
    data = internalData;
  }

  console.log(`[getClients] Fetched ${data?.length || 0} clients.`);
  return data as Client[];
}

export async function getClientsWithVps() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, vps")
    .eq("isActive", true)
    .not("vps", "is", null)
    .not("name", "is", null)
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching clients with vps:", error);
    throw error;
  }

  return data as Pick<Client, "id" | "name" | "vps">[];
}

export async function getClientById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(`Error fetching client ${id}:`, error);
    throw error;
  }

  return data as Client;
}

export async function createClientRecord(client: Partial<Client>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert([client])
    .select()
    .single();

  if (error) {
    console.error("Error creating client:", error);
    throw error;
  }

  return data as Client;
}

export async function updateClient(id: string, client: Partial<Client>) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(client)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error(`Error updating client ${id}:`, error);
    throw error;
  }

  return data as Client;
}

export async function deleteClient(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(`Error deleting client ${id}:`, error);
    throw error;
  }

  return { success: true };
}
