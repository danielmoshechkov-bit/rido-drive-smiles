import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SalesLead {
  id: string;
  category_id: string | null;
  company_name: string;
  phone: string;
  email: string | null;
  city: string | null;
  address: string | null;
  website: string | null;
  nip: string | null;
  notes: string | null;
  source: string;
  status: string;
  assigned_to: string | null;
  created_by: string;
  registered_user_id: string | null;
  registered_at: string | null;
  created_at: string;
  updated_at: string;
  category?: SalesLeadCategory;
}

export interface SalesLeadCategory {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

export interface SalesLeadContact {
  id: string;
  lead_id: string;
  full_name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

export interface SalesCallLog {
  id: string;
  lead_id: string;
  contact_id: string | null;
  user_id: string;
  call_status: string;
  call_date: string;
  callback_date: string | null;
  duration_seconds: number | null;
  notes: string | null;
  outcome: string | null;
  created_at: string;
}

export function useSalesCategories() {
  return useQuery({
    queryKey: ["sales-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_lead_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      
      if (error) throw error;
      return data as SalesLeadCategory[];
    },
  });
}

export function useSalesLeads(categorySlug?: string, status?: string) {
  return useQuery({
    queryKey: ["sales-leads", categorySlug, status],
    queryFn: async () => {
      let query = supabase
        .from("sales_leads")
        .select(`
          *,
          category:sales_lead_categories(id, name, slug, icon)
        `)
        .order("created_at", { ascending: false });
      
      if (categorySlug) {
        const { data: cat } = await supabase
          .from("sales_lead_categories")
          .select("id")
          .eq("slug", categorySlug)
          .single();
        if (cat) {
          query = query.eq("category_id", cat.id);
        }
      }
      
      if (status && status !== "all") {
        query = query.eq("status", status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as SalesLead[];
    },
  });
}

export function useCreateSalesLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (lead: Omit<SalesLead, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'assigned_to' | 'category'>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");
      
      // Check for duplicate phone
      const { data: existing } = await supabase
        .from("sales_leads")
        .select("id, company_name, created_by")
        .eq("phone", lead.phone)
        .maybeSingle();
      
      if (existing) {
        throw new Error(`Ten numer telefonu jest już w systemie! Firma: ${existing.company_name}`);
      }
      
      const { data, error } = await supabase
        .from("sales_leads")
        .insert({
          category_id: lead.category_id,
          company_name: lead.company_name,
          phone: lead.phone,
          email: lead.email,
          city: lead.city,
          address: lead.address,
          website: lead.website,
          nip: lead.nip,
          notes: lead.notes,
          source: lead.source,
          status: lead.status,
          created_by: user.id,
          assigned_to: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-leads"] });
      toast.success("Lead został dodany");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateSalesLead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesLead> & { id: string }) => {
      const { data, error } = await supabase
        .from("sales_leads")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-leads"] });
      toast.success("Lead zaktualizowany");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSalesLeadContacts(leadId: string) {
  return useQuery({
    queryKey: ["sales-lead-contacts", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_lead_contacts")
        .select("*")
        .eq("lead_id", leadId)
        .order("is_primary", { ascending: false });
      
      if (error) throw error;
      return data as SalesLeadContact[];
    },
    enabled: !!leadId,
  });
}

export function useCreateSalesContact() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (contact: { lead_id: string; full_name: string; position?: string; phone?: string; email?: string; is_primary?: boolean; notes?: string }) => {
      const { data, error } = await supabase
        .from("sales_lead_contacts")
        .insert({
          lead_id: contact.lead_id,
          full_name: contact.full_name,
          position: contact.position || null,
          phone: contact.phone || null,
          email: contact.email || null,
          is_primary: contact.is_primary || false,
          notes: contact.notes || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sales-lead-contacts", variables.lead_id] });
      toast.success("Kontakt dodany");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useSalesCallLogs(leadId: string) {
  return useQuery({
    queryKey: ["sales-call-logs", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_call_logs")
        .select("*")
        .eq("lead_id", leadId)
        .order("call_date", { ascending: false });
      
      if (error) throw error;
      return data as SalesCallLog[];
    },
    enabled: !!leadId,
  });
}

export function useCreateSalesCallLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (log: { lead_id: string; call_status: string; contact_id?: string; callback_date?: string | null; notes?: string | null; outcome?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");
      
      const { data, error } = await supabase
        .from("sales_call_logs")
        .insert({
          lead_id: log.lead_id,
          call_status: log.call_status,
          contact_id: log.contact_id || null,
          callback_date: log.callback_date || null,
          notes: log.notes || null,
          outcome: log.outcome || null,
          user_id: user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["sales-call-logs", variables.lead_id] });
      queryClient.invalidateQueries({ queryKey: ["sales-leads"] });
      toast.success("Połączenie zapisane");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useMyCallbacks() {
  return useQuery({
    queryKey: ["my-callbacks"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from("sales_call_logs")
        .select(`
          *,
          lead:sales_leads(id, company_name, phone, category:sales_lead_categories(name))
        `)
        .eq("user_id", user.id)
        .not("callback_date", "is", null)
        .gte("callback_date", new Date().toISOString().split("T")[0])
        .order("callback_date");
      
      if (error) throw error;
      return data;
    },
  });
}

export function useSalesUserSettings() {
  return useQuery({
    queryKey: ["sales-user-settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from("sales_user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateSalesUserSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: { work_email?: string; phone_extension?: string; daily_call_target?: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");
      
      const { data, error } = await supabase
        .from("sales_user_settings")
        .upsert({
          user_id: user.id,
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-user-settings"] });
      toast.success("Ustawienia zapisane");
    },
  });
}
