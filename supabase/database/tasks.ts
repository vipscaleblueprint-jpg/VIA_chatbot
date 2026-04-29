import { createClient } from "@/supabase/server";

export interface Task {
  clickup_task_link: string;
  start_date: string;
  client_name: string;
  task_name: string;
  star: number | null;
  priority: string | null;
  assigned: string | null;
  complexity: string | null;
  status: string | null;
  notes: string | null;
  deliverables_links: string | null;
}

export async function getTasks(): Promise<Task[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Error fetching tasks:", error);
    return [];
  }

  return data || [];
}
