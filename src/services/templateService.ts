import { supabase } from "@/lib/supabase";
import type { Template } from "@/types";

export const templateService = {
  async list(): Promise<Template[]> {
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .order("is_system", { ascending: false })
      .order("name");
    if (error) throw error;
    return (data as Template[]) ?? [];
  },

  async get(templateId: string): Promise<Template | null> {
    const { data, error } = await supabase.from("templates").select("*").eq("id", templateId).single();
    if (error) throw error;
    return data as Template;
  },
};
