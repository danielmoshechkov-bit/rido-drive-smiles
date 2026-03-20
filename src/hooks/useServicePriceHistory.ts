import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function useServiceAutocomplete(providerId: string | null, query: string) {
  return useQuery({
    queryKey: ['service-autocomplete', providerId, query],
    enabled: !!providerId && query.length >= 2,
    queryFn: async () => {
      const norm = normalize(query);

      // 1. User's own history (priority)
      const { data: own } = await (supabase as any)
        .from('service_price_history')
        .select('service_name, last_price_net, last_price_gross')
        .eq('provider_id', providerId)
        .ilike('service_name_normalized', `%${norm}%`)
        .order('last_used_at', { ascending: false })
        .limit(3);

      if (own && own.length > 0) return own;

      // 2. Community anonymous prices
      const { data: community } = await (supabase as any)
        .from('anonymous_service_prices')
        .select('service_name_normalized, price_net, price_gross')
        .ilike('service_name_normalized', `%${norm}%`)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!community || community.length === 0) return [];

      // Deduplicate and take latest per name
      const map = new Map<string, { service_name: string; last_price_net: number; last_price_gross: number }>();
      for (const c of community) {
        if (!map.has(c.service_name_normalized)) {
          map.set(c.service_name_normalized, {
            service_name: c.service_name_normalized,
            last_price_net: c.price_net,
            last_price_gross: c.price_gross,
          });
        }
      }
      return Array.from(map.values()).slice(0, 3);
    },
    staleTime: 5000,
  });
}

export function useSaveServicePrice(providerId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { name: string; priceNet: number; priceGross: number }) => {
      if (!providerId) return;
      const norm = normalize(params.name);

      // Upsert to price history
      const { data: existing } = await (supabase as any)
        .from('service_price_history')
        .select('id, last_price_net, last_price_gross, usage_count')
        .eq('provider_id', providerId)
        .eq('service_name_normalized', norm)
        .maybeSingle();

      if (existing) {
        await (supabase as any)
          .from('service_price_history')
          .update({
            service_name: params.name,
            last_price_net: params.priceNet,
            last_price_gross: params.priceGross,
            usage_count: existing.usage_count + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await (supabase as any)
          .from('service_price_history')
          .insert({
            provider_id: providerId,
            service_name: params.name,
            service_name_normalized: norm,
            last_price_net: params.priceNet,
            last_price_gross: params.priceGross,
          });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-autocomplete'] });
    },
  });
}

export function useSaveAnonymousPrice() {
  return useMutation({
    mutationFn: async (params: {
      name: string;
      priceNet: number;
      priceGross: number;
      brand?: string;
      model?: string;
      engineCapacity?: number;
      city?: string;
      voivodeship?: string;
      industry?: string;
    }) => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      await (supabase as any)
        .from('anonymous_service_prices')
        .insert({
          service_name_normalized: normalize(params.name),
          vehicle_brand: params.brand || null,
          vehicle_model: params.model || null,
          engine_capacity: params.engineCapacity || null,
          city: params.city || null,
          voivodeship: params.voivodeship || null,
          industry: params.industry || 'warsztat',
          price_net: params.priceNet,
          price_gross: params.priceGross,
          created_month: month,
        });
    },
  });
}
