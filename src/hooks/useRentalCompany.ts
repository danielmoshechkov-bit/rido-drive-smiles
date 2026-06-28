import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Ustala firmę bieżącego użytkownika dla modułu Wynajem oraz czy moduł
 * jest dla niej dostępny (can_use_module — 3 warstwy: platforma + firma + rola).
 *
 * Nowe tabele (company_members, company_modules) nie są w generowanym
 * types.ts, więc używamy wzorca `supabase as any` (jak w RentalPhotoProtocol).
 */
export interface RentalCompanyState {
  loading: boolean;
  userId?: string;
  companyId?: string;
  canUse: boolean;
  error?: 'not_authenticated' | 'no_company' | string;
}

export function useRentalCompany(): RentalCompanyState {
  const [state, setState] = useState<RentalCompanyState>({ loading: true, canUse: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setState({ loading: false, canUse: false, error: 'not_authenticated' });
        return;
      }
      // Firma, w której użytkownik jest aktywnym członkiem (RLS przepuszcza własne członkostwo).
      const { data: members, error } = await sb
        .from('company_members')
        .select('company_id, is_owner')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1);
      if (error) {
        if (!cancelled) setState({ loading: false, canUse: false, userId: user.id, error: error.message });
        return;
      }
      const companyId = members?.[0]?.company_id as string | undefined;
      if (!companyId) {
        if (!cancelled) setState({ loading: false, canUse: false, userId: user.id, error: 'no_company' });
        return;
      }
      const { data: canUse } = await sb.rpc('can_use_module', {
        p_company_id: companyId,
        p_module_key: 'rental',
      });
      if (!cancelled) setState({ loading: false, canUse: !!canUse, userId: user.id, companyId });
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
