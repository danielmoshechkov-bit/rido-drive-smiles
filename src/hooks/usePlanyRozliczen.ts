import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { wykonajZapis } from '@/lib/zapisRozliczen';
import type { UstawieniaRozliczen } from '@/lib/rozliczenia';

/**
 * Plany rozliczeń floty i przypisania planów do kierowców.
 *
 * MODEL: plan (`fleet_settlement_plans`) ma nazwę, opcjonalne miasto
 * i przełącznik „domyślny". Ustawienia Bolt/Uber leżą tam, gdzie leżały —
 * w `fleet_city_settings`, tylko z `plan_id` wskazującym rodzica.
 *
 * PRZYPISANIE MA DATĘ. `driver_plan_assignments` trzyma historię: plan
 * obowiązujący w tygodniu W to wiersz o największym `effective_from <= W`.
 * Nie ma pola „plan kierowcy" — jedno pole obok historii to dwa źródła prawdy.
 *
 * Tabele wchodzą migracjami 20260914120000 i 20260914120100. Do czasu ich
 * wykonania hooki zwracają pustkę i mówią o tym w konsoli, zamiast wywracać
 * ekran — panel liczy wtedy po ustawieniach miasta, czyli jak dotąd.
 */

export interface UstawieniaPlatformy extends UstawieniaRozliczen {
  id: string;
  platform: 'bolt' | 'uber';
  invoice_email: string | null;
}

export interface PlanFloty {
  id: string;
  fleet_id: string;
  name: string;
  city_name: string | null;
  is_default: boolean;
  is_active: boolean;
  bolt: UstawieniaPlatformy | null;
  uber: UstawieniaPlatformy | null;
}

export interface PrzypisaniePlanu {
  driver_id: string;
  plan_id: string | null;
  effective_from: string; // YYYY-MM-DD, poniedziałek
}

export const KLUCZ_PLANY = 'plany-floty';
export const KLUCZ_PRZYPISANIA = 'przypisania-planow';

/** Poniedziałek tygodnia, w którym wypada podana data (albo dziś). */
export function poniedzialekTygodnia(data?: Date | string | null): string {
  const d = data ? new Date(data) : new Date();
  const dzien = d.getDay(); // 0 = niedziela
  const doPoniedzialku = dzien === 0 ? -6 : 1 - dzien;
  const poniedzialek = new Date(d);
  poniedzialek.setDate(d.getDate() + doPoniedzialku);
  return poniedzialek.toISOString().split('T')[0];
}

/**
 * Plan obowiązujący w danym tygodniu: wiersz o największym `effective_from`
 * nie późniejszym niż początek tygodnia. Brak wiersza = brak planu, czyli
 * liczenie po ustawieniach miasta (tak samo jak przed wprowadzeniem planów).
 */
export function planNaTydzien(
  przypisania: PrzypisaniePlanu[] | undefined,
  driverId: string,
  poczatekTygodnia: string,
): string | null {
  if (!przypisania || !poczatekTygodnia) return null;
  let wybrany: PrzypisaniePlanu | null = null;
  for (const p of przypisania) {
    if (p.driver_id !== driverId) continue;
    if (p.effective_from > poczatekTygodnia) continue;
    if (!wybrany || p.effective_from > wybrany.effective_from) wybrany = p;
  }
  return wybrany?.plan_id ?? null;
}

/** Krótki opis planu do listy: „8% · 50 zł · Bolt+Uber". */
export function opisPlanu(plan: PlanFloty): string {
  const zrodlo = plan.bolt ?? plan.uber;
  if (!zrodlo) return 'brak ustawień';
  const czesci = [
    zrodlo.vat_rate === 0 ? 'bez podatku' : `podatek ${zrodlo.vat_rate}%`,
    `opłata ${zrodlo.base_fee} zł`,
  ];
  if (zrodlo.settlement_mode === 'dual_tax') czesci.push('dwa podatki');
  if (plan.city_name) czesci.push(plan.city_name);
  return czesci.join(' · ');
}

function zlozPlany(plany: any[], ustawienia: any[]): PlanFloty[] {
  const poPlanie = new Map<string, any[]>();
  for (const u of ustawienia) {
    if (!u.plan_id) continue;
    const lista = poPlanie.get(u.plan_id) || [];
    lista.push(u);
    poPlanie.set(u.plan_id, lista);
  }
  return plany
    .map((p) => {
      const dzieci = poPlanie.get(p.id) || [];
      return {
        id: p.id,
        fleet_id: p.fleet_id,
        name: p.name,
        city_name: p.city_name ?? null,
        is_default: !!p.is_default,
        is_active: p.is_active !== false,
        bolt: (dzieci.find((d) => d.platform === 'bolt') as UstawieniaPlatformy) ?? null,
        uber: (dzieci.find((d) => d.platform === 'uber') as UstawieniaPlatformy) ?? null,
      };
    })
    .sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, 'pl'));
}

export function usePlanyFloty(fleetId?: string | null) {
  return useQuery({
    queryKey: [KLUCZ_PLANY, fleetId ?? 'brak'],
    enabled: !!fleetId,
    queryFn: async (): Promise<PlanFloty[]> => {
      const { data: plany, error: bladPlanow } = await (supabase as any)
        .from('fleet_settlement_plans')
        .select('*')
        .eq('fleet_id', fleetId)
        .eq('is_active', true);

      if (bladPlanow) {
        // Tabela wchodzi migracją — brak tabeli to nie awaria panelu.
        console.warn('fleet_settlement_plans niedostępna (migracja planów niewykonana?):', bladPlanow.message);
        return [];
      }

      const { data: ustawienia, error: bladUstawien } = await (supabase as any)
        .from('fleet_city_settings')
        .select('*')
        .eq('fleet_id', fleetId)
        .eq('is_active', true);

      if (bladUstawien) {
        console.error('Nie udało się wczytać ustawień planów:', bladUstawien.message);
        throw bladUstawien;
      }

      return zlozPlany((plany as any[]) || [], (ustawienia as any[]) || []);
    },
  });
}

export function usePrzypisaniaPlanow(fleetId?: string | null) {
  return useQuery({
    queryKey: [KLUCZ_PRZYPISANIA, fleetId ?? 'brak'],
    enabled: !!fleetId,
    queryFn: async (): Promise<PrzypisaniePlanu[]> => {
      const { data: kierowcy, error: bladKierowcow } = await supabase
        .from('drivers')
        .select('id')
        .eq('fleet_id', fleetId);
      if (bladKierowcow) throw bladKierowcow;

      const idKierowcow = ((kierowcy as any[]) || []).map((d) => d.id);
      if (idKierowcow.length === 0) return [];

      const { data, error } = await (supabase as any)
        .from('driver_plan_assignments')
        .select('driver_id, plan_id, effective_from')
        .in('driver_id', idKierowcow);

      if (error) {
        console.warn('driver_plan_assignments niedostępne (migracja planów niewykonana?):', error.message);
        return [];
      }
      return (data as PrzypisaniePlanu[]) || [];
    },
  });
}

/**
 * Przypisuje plan od wskazanego tygodnia w przód.
 *
 * Wcześniejsze tygodnie zostają nietknięte — mają własne wiersze albo nie mają
 * żadnego i liczą się po mieście. Ponowne przypisanie w tym samym tygodniu
 * nadpisuje wiersz tego tygodnia, nie zakłada drugiego.
 */
export function useUstawPlanKierowcy() {
  const klient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      driverId,
      planId,
      odTygodnia,
    }: {
      driverId: string;
      planId: string | null;
      odTygodnia: string;
    }) => {
      const { data: uzytkownik } = await supabase.auth.getUser();
      await wykonajZapis(
        (supabase as any)
          .from('driver_plan_assignments')
          .upsert(
            {
              driver_id: driverId,
              plan_id: planId,
              effective_from: odTygodnia,
              created_by: uzytkownik?.user?.id ?? null,
            },
            { onConflict: 'driver_id,effective_from' },
          )
          .select('id'),
        `Przypisanie planu od ${odTygodnia}`,
      );
      return { driverId, planId, odTygodnia };
    },
    onSuccess: () => {
      klient.invalidateQueries({ queryKey: [KLUCZ_PRZYPISANIA] });
      klient.invalidateQueries({ queryKey: [KLUCZ_PLANY] });
    },
  });
}
