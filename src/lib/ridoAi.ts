import { supabase } from '@/integrations/supabase/client';

/**
 * Rozliczenie pytań do Rido AI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NAJPIERW SPRAWDŹ, POTEM PYTAJ — I DOPIERO WTEDY POBIERZ
 * ═══════════════════════════════════════════════════════════════════════════
 * Ta sama kolejność co przy SMS-ach, z tego samego powodu: pytanie do modelu
 * kosztuje w chwili wysłania, więc limit trzeba sprawdzić PRZED nim. Pobranie
 * idzie dopiero po udanej odpowiedzi — gdyby model nie odpowiedział, warsztat
 * nie ma za co płacić.
 *
 * FAIL-CLOSED: gdy nie wiadomo, czy jest pokrycie (brak warsztatu, błąd
 * zapytania), odmawiamy. Brak odpowiedzi nie może znaczyć „przepuść".
 *
 * JEDNA PULA na wyceny i pomoc przy naprawie — patrz migracja
 * `20260821090000_rido_ai_jedna_pula`.
 */
export const CECHA_RIDO_AI = 'rido_ai';

export interface StanRidoAi {
  /** Czy wolno zadać pytanie. */
  wolno: boolean;
  /** Ile zostało; `null` = plan bez limitu. */
  zostalo: number | null;
}

export async function sprawdzRidoAi(providerId: string | null | undefined): Promise<StanRidoAi> {
  if (!providerId) return { wolno: false, zostalo: 0 };

  const { data, error } = await (supabase as any).rpc('check_usage', {
    p_subscriber_type: 'service_provider',
    p_subscriber_id: providerId,
    p_feature_key: CECHA_RIDO_AI,
    p_amount: 1,
  });

  if (error) {
    console.error('[ridoAi] check_usage:', error);
    return { wolno: false, zostalo: 0 };
  }

  const bezLimitu = data?.unlimited === true || data?.remaining === null;
  return {
    wolno: data?.allowed === true,
    zostalo: bezLimitu ? null : Number(data?.remaining ?? 0),
  };
}

/**
 * Pobranie jednego pytania. Zwraca `false`, gdy pobranie się nie udało —
 * wołający ma wtedy powiedzieć o tym wprost, a nie udawać, że nic się nie stało.
 */
export async function pobierzRidoAi(providerId: string | null | undefined): Promise<boolean> {
  if (!providerId) return false;

  const { data, error } = await (supabase as any).rpc('billing_consume', {
    p_subscriber_type: 'service_provider',
    p_subscriber_id: providerId,
    p_feature_key: CECHA_RIDO_AI,
    p_amount: 1,
  });

  if (error) {
    console.error('[ridoAi] billing_consume:', error);
    return false;
  }
  return data?.ok === true;
}
