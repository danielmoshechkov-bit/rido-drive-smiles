import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Okres = 'miesiac' | 'rok';

export interface CenaOkresu {
  planId: string;
  nazwa: string;
  okres: Okres;
  miesiecy: number;
  netto: number;
  vat: number;
  brutto: number;
  /** Ile kosztowałoby dwanaście miesięcy po kolei — do przekreślenia. */
  bezRabatuNetto: number;
  bezRabatuBrutto: number;
  poGwarancji: boolean;
}

/**
 * Cena planu w wybranym okresie — LICZONA W BAZIE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO NIE W PRZEGLĄDARCE
 * ═══════════════════════════════════════════════════════════════════════════
 * Front mógłby pomnożyć `price_net × 10` sam i byłoby to szybsze. Ale wtedy
 * rabat roczny istniałby w dwóch miejscach — w bazie i tutaj — a przy pierwszej
 * zmianie rozjechałby się cicho: okno pokazywałoby jedną kwotę, a operator
 * pobierałby inną.
 *
 * Ważniejsze: cena zależy od GWARANCJI CENY tego konkretnego warsztatu, której
 * przeglądarka nie zna i nie powinna. Ten sam plan kosztuje inaczej klienta
 * z pierwszego roku i z drugiego.
 *
 * To jest wyłącznie POKAZANIE kwoty. Zakup liczy ją ponownie po stronie
 * serwera — inaczej dałoby się kupić rok za kwotę z żądania.
 */
export function useCenaOkresu(
  planCode: string | null | undefined,
  providerId: string | null | undefined,
  okres: Okres,
) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cena-okresu', planCode, providerId, okres],
    enabled: !!planCode,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CenaOkresu | null> => {
      const { data: w, error: blad } = await (supabase as any)
        .rpc('billing_cena_okresu', {
          p_plan_code: planCode,
          p_provider: providerId ?? null,
          p_okres: okres,
        })
        .maybeSingle();

      // Plan darmowy i indywidualny ODMAWIAJĄ wyceny — to nie jest awaria,
      // tylko poprawna odpowiedź „tego nie da się kupić". Zwracamy `null`,
      // a okno pokazuje przy nich co innego niż przycisk płatności.
      if (blad || !w) return null;

      return {
        planId: w.plan_id,
        nazwa: w.nazwa,
        okres: w.okres as Okres,
        miesiecy: Number(w.miesiecy),
        netto: Number(w.cena_netto),
        vat: Number(w.vat_rate),
        brutto: Number(w.cena_brutto),
        bezRabatuNetto: Number(w.bez_rabatu_netto),
        bezRabatuBrutto: Number(w.bez_rabatu_brutto),
        poGwarancji: !!w.po_gwarancji,
      };
    },
  });

  return { cena: data ?? null, ladowanie: isLoading, blad: error as Error | null };
}

/** „990,00 zł" — jedno miejsce na formatowanie, żeby okno i podsumowanie zgadzały się co do grosza. */
export const zl = (kwota: number) =>
  kwota.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
