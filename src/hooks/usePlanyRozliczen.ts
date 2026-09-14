import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { wykonajZapis } from '@/lib/zapisRozliczen';

/**
 * Plany rozliczeń floty i przypisanie planu do kierowcy.
 *
 * Plan wybiera się w DWÓCH miejscach — w popoverze „i" przy kierowcy w tabeli
 * rozliczeń i na karcie kierowcy na liście kierowców. Oba czytają TĘ SAMĄ
 * pamięć podręczną TanStack Query, a zapis unieważnia ją w całości, więc
 * zmiana w jednym miejscu jest natychmiast widoczna w drugim.
 *
 * Kolumny `settlement_plans.fleet_id`, `settlement_plans.tax_enabled`
 * i `drivers.settlement_plan_id` wchodzą migracjami 20260914090000 i
 * 20260914090100. Do czasu ich wykonania hooki zwracają pustkę i mówią
 * o tym w konsoli — zamiast wywracać cały ekran.
 */

export interface PlanRozliczenWiersz {
  id: string;
  name: string;
  fleet_id: string | null;
  tax_enabled: boolean;
  tax_percentage: number | null;
  base_fee: number | null;
  settlement_mode: string | null;
  is_default: boolean;
  is_active: boolean;
  description: string | null;
}

export const KLUCZ_PLANY = 'plany-rozliczen';
export const KLUCZ_PLAN_KIEROWCY = 'plan-kierowcy';

/** Krótki opis planu do listy: „8% · 50 zł" albo „bez podatku · 159 zł". */
export function opisPlanu(plan: PlanRozliczenWiersz): string {
  const czesci: string[] = [];
  czesci.push(plan.tax_enabled
    ? (plan.tax_percentage === null || plan.tax_percentage === undefined
      ? 'podatek wg miasta'
      : `podatek ${plan.tax_percentage}%`)
    : 'bez podatku');
  czesci.push(plan.base_fee === null || plan.base_fee === undefined
    ? 'opłata wg miasta'
    : `opłata ${plan.base_fee} zł`);
  if (plan.settlement_mode === 'dual_tax') czesci.push('dwa podatki');
  return czesci.join(' · ');
}

export function usePlanyRozliczen(fleetId?: string | null) {
  return useQuery({
    queryKey: [KLUCZ_PLANY, fleetId ?? 'brak'],
    enabled: true,
    queryFn: async (): Promise<PlanRozliczenWiersz[]> => {
      const { data, error } = await supabase.from('settlement_plans').select('*');
      if (error) {
        console.error('Nie udało się wczytać planów rozliczeń:', error.message);
        throw error;
      }
      const wiersze = ((data as any[]) || []).map((p) => ({
        id: p.id,
        name: p.name,
        fleet_id: p.fleet_id ?? null,
        // Przed migracją kolumny `tax_enabled` nie ma. Stare znaczenie było
        // takie samo: brak stawki = plan bez podatku.
        tax_enabled: p.tax_enabled ?? (p.tax_percentage !== null && p.tax_percentage !== undefined),
        tax_percentage: p.tax_percentage ?? null,
        base_fee: p.base_fee ?? null,
        settlement_mode: p.settlement_mode ?? null,
        is_default: p.is_default ?? false,
        is_active: p.is_active ?? true,
        description: p.description ?? null,
      })) as PlanRozliczenWiersz[];

      return wiersze
        .filter((p) => p.is_active && (!p.fleet_id || !fleetId || p.fleet_id === fleetId))
        .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, 'pl'));
    },
  });
}

/** Plan przypisany kierowcy. `null` = brak przypisania (liczymy po mieście). */
export function usePlanKierowcy(driverId?: string | null) {
  return useQuery({
    queryKey: [KLUCZ_PLAN_KIEROWCY, driverId ?? 'brak'],
    enabled: !!driverId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from('drivers')
        .select('settlement_plan_id')
        .eq('id', driverId)
        .maybeSingle();
      if (error) {
        console.warn('drivers.settlement_plan_id niedostępne (migracja planów niewykonana?):', error.message);
        return null;
      }
      return (data as any)?.settlement_plan_id ?? null;
    },
  });
}

export function useUstawPlanKierowcy() {
  const klient = useQueryClient();
  return useMutation({
    mutationFn: async ({ driverId, planId }: { driverId: string; planId: string | null }) => {
      // Zapis z potwierdzeniem liczby wierszy: UPDATE odrzucony przez RLS
      // wraca bez błędu i bez wierszy, a użytkownik zobaczyłby „zapisano".
      await wykonajZapis(
        (supabase as any)
          .from('drivers')
          .update({ settlement_plan_id: planId })
          .eq('id', driverId)
          .select('id'),
        'Zmiana planu rozliczeń',
      );
      return { driverId, planId };
    },
    onSuccess: ({ driverId }) => {
      klient.invalidateQueries({ queryKey: [KLUCZ_PLAN_KIEROWCY, driverId] });
      klient.invalidateQueries({ queryKey: [KLUCZ_PLANY] });
    },
  });
}
