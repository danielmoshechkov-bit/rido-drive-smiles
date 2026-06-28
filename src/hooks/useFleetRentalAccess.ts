import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Most flota -> firma + gate modułu Wynajem dla panelu flotowego.
 * Z fleetId ustala company_id (fleets.company_id) i sprawdza entitlement
 * company_module_enabled(company_id,'rental').
 *
 * BEZPIECZEŃSTWO PRODUKCJI: fail-safe. Dla flot bez company_id albo bez
 * włączonego modułu (czyli 18 istniejących firm) -> canUse=false -> zakładka
 * Wynajem się NIE pokazuje, zachowanie panelu bez zmian.
 */
export interface FleetRentalAccess {
  loading: boolean;
  companyId?: string;
  canUse: boolean;
}

export function useFleetRentalAccess(fleetId?: string | null): FleetRentalAccess {
  const [state, setState] = useState<FleetRentalAccess>({ loading: true, canUse: false });

  useEffect(() => {
    let cancelled = false;
    if (!fleetId) { setState({ loading: false, canUse: false }); return; }
    (async () => {
      const sb = supabase as any;
      try {
        const { data: fleet } = await sb
          .from('fleets')
          .select('company_id')
          .eq('id', fleetId)
          .maybeSingle();
        const companyId = fleet?.company_id as string | undefined;
        if (!companyId) { if (!cancelled) setState({ loading: false, canUse: false }); return; }
        const { data: enabled } = await sb.rpc('company_module_enabled', {
          p_company_id: companyId,
          p_module_key: 'rental',
        });
        if (!cancelled) setState({ loading: false, companyId, canUse: !!enabled });
      } catch {
        if (!cancelled) setState({ loading: false, canUse: false });
      }
    })();
    return () => { cancelled = true; };
  }, [fleetId]);

  return state;
}
