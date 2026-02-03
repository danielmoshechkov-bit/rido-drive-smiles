import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Types
export interface AICallCompanyWhitelist {
  id: string;
  nip: string;
  company_name: string | null;
  status: 'pending' | 'active' | 'disabled';
  valid_from: string | null;
  valid_to: string | null;
  added_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AICallUserWhitelist {
  id: string;
  email: string;
  status: 'active' | 'disabled';
  valid_from: string | null;
  valid_to: string | null;
  added_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Company Whitelist Hooks
export function useAICallCompanyWhitelist() {
  return useQuery({
    queryKey: ["ai-call-company-whitelist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_call_company_whitelist")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AICallCompanyWhitelist[];
    },
  });
}

export function useAddCompanyToWhitelist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { 
      nip: string; 
      company_name?: string; 
      status?: 'pending' | 'active' | 'disabled';
      notes?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("ai_call_company_whitelist")
        .insert({
          nip: params.nip.replace(/\D/g, ''), // Remove non-digits
          company_name: params.company_name || null,
          status: params.status || 'active',
          notes: params.notes || null,
          added_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log to audit
      await supabase.from("ai_call_audit_log").insert({
        action: "company_added",
        actor_user_id: userData.user?.id,
        target_type: "company_whitelist",
        target_id: data.id,
        details: { nip: params.nip, company_name: params.company_name },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-company-whitelist"] });
      toast.success("Firma dodana do whitelist");
    },
    onError: (error: any) => {
      if (error.message?.includes("duplicate")) {
        toast.error("Firma o tym NIP już istnieje w whitelist");
      } else {
        toast.error("Błąd dodawania firmy");
      }
    },
  });
}

export function useRemoveCompanyFromWhitelist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("ai_call_company_whitelist")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Log to audit
      await supabase.from("ai_call_audit_log").insert({
        action: "company_removed",
        actor_user_id: userData.user?.id,
        target_type: "company_whitelist",
        target_id: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-company-whitelist"] });
      toast.success("Firma usunięta z whitelist");
    },
    onError: () => {
      toast.error("Błąd usuwania firmy");
    },
  });
}

export function useUpdateCompanyWhitelistStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; status: 'pending' | 'active' | 'disabled' }) => {
      const { error } = await supabase
        .from("ai_call_company_whitelist")
        .update({ status: params.status })
        .eq("id", params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-company-whitelist"] });
      toast.success("Status zaktualizowany");
    },
    onError: () => {
      toast.error("Błąd aktualizacji statusu");
    },
  });
}

// User Whitelist Hooks
export function useAICallUserWhitelist() {
  return useQuery({
    queryKey: ["ai-call-user-whitelist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_call_user_whitelist")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AICallUserWhitelist[];
    },
  });
}

export function useAddUserToWhitelist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { 
      email: string; 
      status?: 'active' | 'disabled';
      notes?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("ai_call_user_whitelist")
        .insert({
          email: params.email.toLowerCase().trim(),
          status: params.status || 'active',
          notes: params.notes || null,
          added_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Log to audit
      await supabase.from("ai_call_audit_log").insert({
        action: "user_added",
        actor_user_id: userData.user?.id,
        target_type: "user_whitelist",
        target_id: data.id,
        details: { email: params.email },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-user-whitelist"] });
      toast.success("Użytkownik dodany do whitelist");
    },
    onError: (error: any) => {
      if (error.message?.includes("duplicate")) {
        toast.error("Użytkownik o tym emailu już istnieje w whitelist");
      } else {
        toast.error("Błąd dodawania użytkownika");
      }
    },
  });
}

export function useRemoveUserFromWhitelist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("ai_call_user_whitelist")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Log to audit
      await supabase.from("ai_call_audit_log").insert({
        action: "user_removed",
        actor_user_id: userData.user?.id,
        target_type: "user_whitelist",
        target_id: id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-user-whitelist"] });
      toast.success("Użytkownik usunięty z whitelist");
    },
    onError: () => {
      toast.error("Błąd usuwania użytkownika");
    },
  });
}

export function useUpdateUserWhitelistStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; status: 'active' | 'disabled' }) => {
      const { error } = await supabase
        .from("ai_call_user_whitelist")
        .update({ status: params.status })
        .eq("id", params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-user-whitelist"] });
      toast.success("Status zaktualizowany");
    },
    onError: () => {
      toast.error("Błąd aktualizacji statusu");
    },
  });
}

// Bulk add helpers
export function useAddMultipleCompaniesToWhitelist() {
  const addCompany = useAddCompanyToWhitelist();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (nips: string[]) => {
      const results = [];
      for (const nip of nips) {
        try {
          const result = await addCompany.mutateAsync({ nip: nip.trim() });
          results.push({ nip, success: true, data: result });
        } catch (error) {
          results.push({ nip, success: false, error });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-company-whitelist"] });
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      if (successCount > 0) {
        toast.success(`Dodano ${successCount} firm do whitelist`);
      }
      if (failCount > 0) {
        toast.error(`Nie udało się dodać ${failCount} firm (możliwe duplikaty)`);
      }
    },
  });
}

export function useAddMultipleUsersToWhitelist() {
  const addUser = useAddUserToWhitelist();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (emails: string[]) => {
      const results = [];
      for (const email of emails) {
        try {
          const result = await addUser.mutateAsync({ email: email.trim() });
          results.push({ email, success: true, data: result });
        } catch (error) {
          results.push({ email, success: false, error });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-user-whitelist"] });
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      if (successCount > 0) {
        toast.success(`Dodano ${successCount} użytkowników do whitelist`);
      }
      if (failCount > 0) {
        toast.error(`Nie udało się dodać ${failCount} użytkowników (możliwe duplikaty)`);
      }
    },
  });
}

// AI Call Global Flag Hook
export function useAICallGlobalFlag() {
  return useQuery({
    queryKey: ["ai-call-global-flag"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_toggles")
        .select("is_enabled")
        .eq("feature_key", "ai_call_enabled_global")
        .single();

      if (error) return false;
      return data?.is_enabled ?? false;
    },
  });
}

export function useToggleAICallGlobalFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("feature_toggles")
        .update({ is_enabled: enabled })
        .eq("feature_key", "ai_call_enabled_global");

      if (error) throw error;

      // Log to audit
      await supabase.from("ai_call_audit_log").insert({
        action: enabled ? "module_enabled" : "module_disabled",
        actor_user_id: userData.user?.id,
        target_type: "feature_toggle",
        details: { feature_key: "ai_call_enabled_global" },
      });
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-global-flag"] });
      queryClient.invalidateQueries({ queryKey: ["ai-agent-access"] });
      toast.success(enabled ? "Moduł AI Call włączony globalnie" : "Moduł AI Call wyłączony");
    },
    onError: () => {
      toast.error("Błąd zmiany statusu modułu");
    },
  });
}
