import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIAgentScript {
  id: string;
  config_id: string;
  name: string;
  script_type: 'greeting' | 'qualification' | 'booking' | 'objection' | 'closing' | 'voicemail' | 'callback';
  content: string;
  variables: Record<string, unknown>;
  conditions: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const SCRIPT_TYPE_LABELS: Record<string, string> = {
  greeting: "Powitanie",
  qualification: "Kwalifikacja",
  booking: "Rezerwacja",
  objection: "Obiekcje",
  closing: "Zamknięcie",
  voicemail: "Poczta głosowa",
  callback: "Oddzwonienie"
};

export function useAIAgentScripts(configId?: string) {
  return useQuery({
    queryKey: ["ai-agent-scripts", configId],
    queryFn: async () => {
      if (!configId) return [];

      const { data, error } = await supabase
        .from("ai_agent_scripts" as any)
        .select("*")
        .eq("config_id", configId)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as AIAgentScript[];
    },
    enabled: !!configId,
  });
}

export function useCreateAIAgentScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (script: Omit<AIAgentScript, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from("ai_agent_scripts" as any)
        .insert([script])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-scripts"] });
      toast.success("Skrypt utworzony");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateAIAgentScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AIAgentScript> & { id: string }) => {
      const { data, error } = await supabase
        .from("ai_agent_scripts" as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-scripts"] });
      toast.success("Skrypt zaktualizowany");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteAIAgentScript() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scriptId: string) => {
      const { error } = await supabase
        .from("ai_agent_scripts" as any)
        .delete()
        .eq("id", scriptId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-scripts"] });
      toast.success("Skrypt usunięty");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export const DEFAULT_SCRIPTS: Omit<AIAgentScript, 'id' | 'config_id' | 'created_at' | 'updated_at'>[] = [
  {
    name: "Powitanie standardowe",
    script_type: "greeting",
    content: `Dzień dobry, nazywam się {{agent_name}} i dzwonię z {{company_name}}. 
Czy rozmawiam z {{contact_name}}? 
Dzwonię w sprawie {{service_type}} - czy ma Pan/Pani chwilę na krótką rozmowę?`,
    variables: { agent_name: "", company_name: "", contact_name: "", service_type: "" },
    conditions: {},
    is_active: true,
    sort_order: 1
  },
  {
    name: "Kwalifikacja potrzeb",
    script_type: "qualification", 
    content: `Świetnie! Chciałbym zadać kilka pytań, żeby lepiej zrozumieć Pana/Pani potrzeby.
{{qualification_questions}}
Dziękuję za odpowiedzi. Na podstawie tego, co Pan/Pani powiedział/a, mogę zaproponować...`,
    variables: { qualification_questions: "" },
    conditions: {},
    is_active: true,
    sort_order: 2
  },
  {
    name: "Propozycja spotkania",
    script_type: "booking",
    content: `Czy mogę umówić Pana/Panią na bezpłatną konsultację z naszym specjalistą?
Mamy dostępne terminy: {{available_slots}}.
Który termin byłby dla Pana/Pani najwygodniejszy?`,
    variables: { available_slots: "" },
    conditions: {},
    is_active: true,
    sort_order: 3
  },
  {
    name: "Poczta głosowa",
    script_type: "voicemail",
    content: `Dzień dobry, tu {{agent_name}} z {{company_name}}. 
Dzwonię w sprawie {{service_type}}. 
Proszę o kontakt pod numer {{callback_number}}. 
Dziękuję i do usłyszenia.`,
    variables: { agent_name: "", company_name: "", service_type: "", callback_number: "" },
    conditions: {},
    is_active: true,
    sort_order: 4
  }
];
