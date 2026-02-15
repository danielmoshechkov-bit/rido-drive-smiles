import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ---- Provider ID helper ----
export function useWorkshopProviderId() {
  return useQuery({
    queryKey: ['workshop-provider-id'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('No service provider found');
      return data?.id as string;
    },
    retry: 3,
    retryDelay: 1000,
  });
}

// ---- Orders ----
export function useWorkshopOrders(providerId: string | undefined, filters?: {
  status?: string;
  search?: string;
  completedOnly?: boolean;
}) {
  return useQuery({
    queryKey: ['workshop-orders', providerId, filters],
    enabled: !!providerId,
    queryFn: async () => {
      let query = (supabase as any)
        .from('workshop_orders')
        .select('*, client:workshop_clients(*), vehicle:workshop_vehicles(*), items:workshop_order_items(*)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status_name', filters.status);
      }
      if (filters?.completedOnly) {
        query = query.eq('status_name', 'Zakończone');
      }
      if (filters?.search) {
        query = query.or(`order_number.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkshopOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_orders')
        .insert(order)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
      toast.success('Zlecenie utworzone');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateWorkshopOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      const { error } = await (supabase as any)
        .from('workshop_orders')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Order Statuses ----
export function useWorkshopStatuses(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-statuses', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_order_statuses')
        .select('*')
        .eq('provider_id', providerId)
        .order('sort_order');
      if (error) throw error;
      // If no statuses, initialize defaults
      if (!data || data.length === 0) {
        await supabase.rpc('init_workshop_default_statuses', { p_provider_id: providerId });
        const { data: d2 } = await (supabase as any)
          .from('workshop_order_statuses')
          .select('*')
          .eq('provider_id', providerId)
          .order('sort_order');
        return d2 || [];
      }
      return data;
    },
  });
}

// ---- Clients ----
export function useWorkshopClients(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-clients', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_clients')
        .select('*')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkshopClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_clients')
        .insert(client)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-clients'] });
      toast.success('Klient dodany');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Vehicles ----
export function useWorkshopVehicles(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-vehicles', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_vehicles')
        .select('*, owner:workshop_clients(id, first_name, last_name, company_name)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateWorkshopVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vehicle: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_vehicles')
        .insert(vehicle)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-vehicles'] });
      toast.success('Pojazd dodany');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

// ---- Order Items ----
export function useCreateWorkshopOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: any) => {
      const { data, error } = await (supabase as any)
        .from('workshop_order_items')
        .insert(item)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}
