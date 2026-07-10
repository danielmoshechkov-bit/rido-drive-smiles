import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Preferencje "Karty mechanika" per warsztat/użytkownik (workshop_settings.mechanic_card_prefs,
// kolumna jsonb z migracji M1 20260710120000). Działa między urządzeniami (DB, nie localStorage).
//
// UI-first: kliknięcie checkboxa / zmiana języka aktualizuje stan LOKALNY natychmiast,
// a zapis do DB leci w tle (optymistycznie). Błąd zapisu (np. brak kolumny przed M1)
// NIE cofa wyboru w UI — najwyżej preferencja nie przeżyje odświeżenia strony.

export type MechanicCardVisibleFields = {
  client: boolean;
  phone: boolean;
  vin: boolean;
  plate: boolean;
  year: boolean;
  vehicle: boolean;
  mileage: boolean;
  fuel: boolean;
  tasks: boolean;
  parts: boolean;
  notes: boolean;
};

export const MECHANIC_CARD_FIELDS: Array<keyof MechanicCardVisibleFields> = [
  'client', 'phone', 'vin', 'plate', 'year', 'vehicle', 'mileage', 'fuel', 'tasks', 'parts', 'notes',
];

export const DEFAULT_VISIBLE_FIELDS: MechanicCardVisibleFields = {
  client: true, phone: true, vin: true, plate: true, year: true,
  vehicle: true, mileage: true, fuel: true, tasks: true, parts: true, notes: true,
};

type Prefs = { visible_fields: MechanicCardVisibleFields; print_lang: string | null };
type PrefsRow = { id: string; mechanic_card_prefs: any } | null;

export function useMechanicCardPrefs() {
  // Lokalna kopia po pierwszej interakcji użytkownika — od tego momentu źródło prawdy dla UI.
  const [local, setLocal] = useState<Prefs | null>(null);

  const query = useQuery({
    queryKey: ['mechanic-card-prefs'],
    queryFn: async (): Promise<PrefsRow> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await (supabase as any)
        .from('workshop_settings')
        .select('id, mechanic_card_prefs')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) {
        // Np. kolumna jeszcze nie istnieje (migracja M1 nieodpalona) — karta ma działać dalej.
        console.warn('[mechanic-card-prefs] load failed', error.message);
        return null;
      }
      return data;
    },
  });

  const saved = (query.data?.mechanic_card_prefs || {}) as {
    visible_fields?: Partial<MechanicCardVisibleFields>;
    print_lang?: string;
  };
  const visibleFields: MechanicCardVisibleFields =
    local?.visible_fields ?? { ...DEFAULT_VISIBLE_FIELDS, ...(saved.visible_fields || {}) };
  const printLang: string | null = local ? local.print_lang : (saved.print_lang || null);

  // Zapis w tle (fire-and-forget). Select-then-update/insert jak w SettingsPanel —
  // workshop_settings nie ma gwarantowanego unique na user_id, więc bez upsert.
  const persist = async (prefs: Prefs) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = { visible_fields: prefs.visible_fields, print_lang: prefs.print_lang || undefined };
      const { data: row } = await (supabase as any)
        .from('workshop_settings')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (row?.id) {
        const { error } = await (supabase as any)
          .from('workshop_settings')
          .update({ mechanic_card_prefs: payload })
          .eq('id', row.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('workshop_settings')
          .insert({ user_id: user.id, mechanic_card_prefs: payload });
        if (error) throw error;
      }
    } catch (e: any) {
      console.warn('[mechanic-card-prefs] save failed (UI zachowuje wybór)', e?.message);
    }
  };

  const apply = (next: Prefs) => {
    setLocal(next);        // UI natychmiast
    void persist(next);    // DB w tle
  };

  return {
    visibleFields,
    printLang,
    loading: query.isLoading,
    setVisibleField: (field: keyof MechanicCardVisibleFields, value: boolean) =>
      apply({ visible_fields: { ...visibleFields, [field]: value }, print_lang: printLang }),
    setPrintLang: (lang: string) =>
      apply({ visible_fields: visibleFields, print_lang: lang }),
  };
}
