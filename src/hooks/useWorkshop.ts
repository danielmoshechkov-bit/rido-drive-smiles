import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { pretranslateContent, type ContentItem } from '@/lib/contentTranslation';
import { computeOrderTotals } from '@/utils/workshopOrderTotals';
import { consumeStock, returnStock, adjustStock } from '@/utils/workshopStock';

// B: keep workshop_orders.total_gross/total_net authoritative at write time, so
// every consumer (orders list, estimate preview, SMS) sees the correct amount even
// when the order card was never opened to run its client-side totals effect.
// Best-effort: on a read/write hiccup we silently bail and the card-side effect
// stays as a backstop — we never block the item mutation on this.
async function recomputeOrderTotals(orderId?: string | null) {
  if (!orderId) return;
  const { data: items, error } = await (supabase as any)
    .from('workshop_order_items')
    .select('total_gross, total_net, quantity, unit_price_gross, unit_price_net, discount_percent')
    .eq('order_id', orderId);
  if (error) return;
  const { total_gross, total_net } = computeOrderTotals(items || []);
  await (supabase as any)
    .from('workshop_orders')
    .update({ total_gross, total_net })
    .eq('id', orderId);
}

// Translate-on-write: pola tekstowe zlecenia, które warto pre-tłumaczyć na języki
// bazowe od razu przy zapisie (admin/klient widzą je potem natychmiast z cache).
const ORDER_TEXT_FIELDS = ['description', 'damage_description', 'mechanic_notes', 'post_completion_notes', 'internal_notes'] as const;

function pretranslateOrderFields(orderId: string, src: Record<string, any>) {
  if (!orderId) return;
  const items: ContentItem[] = [];
  for (const f of ORDER_TEXT_FIELDS) {
    const text = src?.[f];
    if (typeof text === 'string' && text.trim().length > 1) {
      items.push({ entity_type: 'order', entity_id: String(orderId), field: f, text, source_lang: 'auto' });
    }
  }
  if (items.length) void pretranslateContent(items);
}

function pretranslateItem(item: any) {
  if (!item?.id) return;
  const items: ContentItem[] = [];
  if (typeof item.name === 'string' && item.name.trim().length > 1) {
    items.push({ entity_type: 'item', entity_id: String(item.id), field: 'name', text: item.name, source_lang: 'auto' });
  }
  if (typeof item.description === 'string' && item.description.trim().length > 1) {
    items.push({ entity_type: 'item', entity_id: String(item.id), field: 'description', text: item.description, source_lang: 'auto' });
  }
  if (items.length) void pretranslateContent(items);
}

const sortWorkshopOrderItems = (items: any[] | null | undefined) => {
  if (!Array.isArray(items)) return [];

  return [...items].sort((a, b) => {
    const aSortOrder = typeof a?.sort_order === 'number' ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const bSortOrder = typeof b?.sort_order === 'number' ? b.sort_order : Number.MAX_SAFE_INTEGER;

    if (aSortOrder !== bSortOrder) return aSortOrder - bSortOrder;

    const aCreatedAt = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const bCreatedAt = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return aCreatedAt - bCreatedAt;
  });
};

// ---- Provider ID helper ----
export function useWorkshopProviderId() {
  return useQuery({
    queryKey: ['workshop-provider-id'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      console.log('[useWorkshopProviderId] User ID:', user.id);
      const { data, error } = await supabase
        .from('service_providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        console.error('[useWorkshopProviderId] Error:', error);
        throw error;
      }
      console.log('[useWorkshopProviderId] Provider ID:', data?.id);
      if (!data) return null;
      return data.id as string;
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
      return (data || []).map((order: any) => ({
        ...order,
        items: sortWorkshopOrderItems(order.items),
      }));
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
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
      if (data?.id) pretranslateOrderFields(data.id, data);
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
    onSuccess: (_data, variables: any) => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
      // translate-on-write: jeśli aktualizacja zawierała pola tekstowe, pre-tłumacz
      if (variables?.id) pretranslateOrderFields(variables.id, variables);
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

// ---- Status Settings (auto/manual mode) ----
export function useWorkshopStatusSettings(providerId: string | undefined) {
  return useQuery({
    queryKey: ['workshop-status-settings', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_status_settings')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();
      if (error) throw error;
      return data || { status_mode: 'auto' };
    },
  });
}

export function useUpdateWorkshopStatusSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ providerId, ...fields }: { providerId: string; status_mode?: string; color_mode?: string }) => {
      const { error } = await (supabase as any)
        .from('workshop_status_settings')
        .upsert({ provider_id: providerId, ...fields }, { onConflict: 'provider_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workshop-status-settings'] });
      toast.success('Tryb statusów zapisany');
    },
    onError: (e: any) => toast.error(e.message),
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
    refetchOnMount: 'always',
    staleTime: 0,
    gcTime: 30000,
    queryFn: async () => {
      console.log('[useWorkshopVehicles] Fetching vehicles for provider:', providerId);
      const { data, error } = await (supabase as any)
        .from('workshop_vehicles')
        .select('*, owner:workshop_clients!workshop_vehicles_owner_client_id_fkey(id, first_name, last_name, company_name)')
        .eq('provider_id', providerId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('[useWorkshopVehicles] Error:', error);
        throw error;
      }
      console.log('[useWorkshopVehicles] Got', data?.length, 'vehicles');
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
        // Idempotent insert: the caller supplies a stable client-generated `id`
        // (the draft row's draftKey). If the same draft gets committed twice — an
        // auto-save race, or a tab remount restoring the localStorage draft — the
        // duplicate hits ON CONFLICT DO NOTHING instead of creating a second
        // identical line. On a duplicate, `data` comes back null (nothing inserted).
        .upsert(item, { onConflict: 'id', ignoreDuplicates: true })
        .select()
        .maybeSingle();
      if (error) throw error;
      // Mark estimate as changed if it was already sent to client
      if (item.order_id) {
        await (supabase as any).from('workshop_orders')
          .update({ estimate_changed_after_send: true })
          .eq('id', item.order_id)
          .eq('estimate_sent_to_client', true);
      }
      await recomputeOrderTotals(item.order_id);
      // Magazyn: zejście FIFO tylko dla realnie wstawionej pozycji powiązanej z produktem
      // (data == null przy idempotentnym duplikacie → brak podwójnego zejścia).
      if (data?.inventory_product_id && Number(data.quantity) > 0) {
        const { shortfall } = await consumeStock(data.inventory_product_id, Number(data.quantity), data.id);
        if (shortfall > 0) toast.warning(`Magazyn: brakło ${shortfall} szt — zeszło tyle, ile było na stanie.`);
      }
      return data;
    },
    // Optimistic insert: drop the new line into every cached orders query right away,
    // so the list total recomputes instantly (like the live counter on the order card)
    // instead of waiting for the DB write + refetch. The caller supplies a stable `id`
    // (draftKey), so the refetch reconciles onto the same row without duplicating.
    onMutate: async (item: any) => {
      await qc.cancelQueries({ queryKey: ['workshop-orders'] });
      const snapshots: { key: any; data: any }[] = [];
      qc.getQueriesData({ queryKey: ['workshop-orders'] }).forEach(([key, data]: any) => {
        snapshots.push({ key, data });
        if (!Array.isArray(data)) return;
        const next = data.map((order: any) => {
          if (order?.id !== item.order_id) return order;
          const items = Array.isArray(order.items) ? order.items : [];
          if (items.some((i: any) => i.id === item.id)) return order; // already there — no double
          return { ...order, items: [...items, item] };
        });
        qc.setQueryData(key, next);
      });
      return { snapshots };
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.snapshots) ctx.snapshots.forEach(({ key, data }: any) => qc.setQueryData(key, data));
      toast.error(e.message);
    },
    onSuccess: (data: any) => {
      pretranslateItem(data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
  });
}

export function useUpdateWorkshopOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: any) => {
      // Magazyn: przy zmianie ilości pobierz starą wartość, by zrobić deltę (dobiór/zwrot).
      let prev: any = null;
      if (updates.quantity !== undefined) {
        const { data: p } = await (supabase as any).from('workshop_order_items').select('quantity, inventory_product_id').eq('id', id).maybeSingle();
        prev = p;
      }
      const { data, error } = await (supabase as any)
        .from('workshop_order_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      // Mark estimate as changed if it was already sent to client
      if (data?.order_id) {
        await (supabase as any).from('workshop_orders')
          .update({ estimate_changed_after_send: true })
          .eq('id', data.order_id)
          .eq('estimate_sent_to_client', true);
      }
      if (prev?.inventory_product_id && updates.quantity !== undefined) {
        const { shortfall } = await adjustStock(prev.inventory_product_id, id, Number(prev.quantity), Number(updates.quantity));
        if (shortfall > 0) toast.warning(`Magazyn: brakło ${shortfall} szt — zeszło tyle, ile było.`);
      }
      await recomputeOrderTotals(data?.order_id);
      return data;
    },
    // Optimistic update: patch the item inside every cached orders query so the new
    // price/quantity/discount appears instantly (avoids the "ciągle pokazuje 0" lag).
    onMutate: async ({ id, ...updates }: any) => {
      await qc.cancelQueries({ queryKey: ['workshop-orders'] });
      const snapshots: { key: any; data: any }[] = [];
      qc.getQueriesData({ queryKey: ['workshop-orders'] }).forEach(([key, data]: any) => {
        snapshots.push({ key, data });
        if (!Array.isArray(data)) return;
        const next = data.map((order: any) => {
          if (!order?.items?.some((i: any) => i.id === id)) return order;
          return {
            ...order,
            items: order.items.map((i: any) => i.id === id ? { ...i, ...updates } : i),
          };
        });
        qc.setQueryData(key, next);
      });
      return { snapshots };
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.snapshots) ctx.snapshots.forEach(({ key, data }: any) => qc.setQueryData(key, data));
      toast.error(e.message);
    },
    onSuccess: (data: any) => {
      // translate-on-write: nazwa pozycji mogła się zmienić → pre-tłumacz
      pretranslateItem(data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
  });
}

export function useDeleteWorkshopOrderItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Grab order_id + inventory link before deleting (recompute totals + zwrot magazynu).
      const { data: existing } = await (supabase as any)
        .from('workshop_order_items')
        .select('order_id, inventory_product_id')
        .eq('id', id)
        .maybeSingle();
      // Magazyn: zwrot części na stan, ale TYLKO gdy zlecenie nie jest zakończone
      // (po „Zakończone" zejście jest ostateczne — część zużyta).
      if (existing?.inventory_product_id && existing?.order_id) {
        const { data: ord } = await (supabase as any).from('workshop_orders').select('status_name').eq('id', existing.order_id).maybeSingle();
        if (ord?.status_name !== 'Zakończone') await returnStock(id);
      }
      const { error } = await (supabase as any)
        .from('workshop_order_items')
        .delete()
        .eq('id', id);
      if (error) throw error;
      await recomputeOrderTotals(existing?.order_id);
    },
    // Optimistic remove: drop the line from every cached orders query right away so the
    // list total falls instantly; onError restores the snapshot, onSettled reconciles.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['workshop-orders'] });
      const snapshots: { key: any; data: any }[] = [];
      qc.getQueriesData({ queryKey: ['workshop-orders'] }).forEach(([key, data]: any) => {
        snapshots.push({ key, data });
        if (!Array.isArray(data)) return;
        const next = data.map((order: any) => {
          if (!order?.items?.some((i: any) => i.id === id)) return order;
          return { ...order, items: order.items.filter((i: any) => i.id !== id) };
        });
        qc.setQueryData(key, next);
      });
      return { snapshots };
    },
    onError: (e: any, _vars, ctx: any) => {
      if (ctx?.snapshots) ctx.snapshots.forEach(({ key, data }: any) => qc.setQueryData(key, data));
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workshop-orders'] });
    },
  });
}
