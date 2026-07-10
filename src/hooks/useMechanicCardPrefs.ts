import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Preferencje "Karty mechanika" per warsztat/użytkownik (workshop_settings.mechanic_card_prefs,
// kolumna jsonb z migracji M1 20260710120000). Działa między urządzeniami (DB, nie localStorage).
// Fallback przy braku wpisu / przed migracją: wszystkie pola widoczne, język wydruku = język UI.

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

type PrefsRow = { id: string; mechanic_card_prefs: any } | null;

export function useMechanicCardPrefs() {
  const qc = useQueryClient();

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

  const raw = (query.data?.mechanic_card_prefs || {}) as {
    visible_fields?: Partial<MechanicCardVisibleFields>;
    print_lang?: string;
  };
  const visibleFields: MechanicCardVisibleFields = { ...DEFAULT_VISIBLE_FIELDS, ...(raw.visible_fields || {}) };
  const printLang: string | null = raw.print_lang || null;

  const saveMut = useMutation({
    mutationFn: async (patch: { visible_fields?: MechanicCardVisibleFields; print_lang?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const merged = {
        visible_fields: patch.visible_fields ?? visibleFields,
        print_lang: patch.print_lang ?? printLang ?? undefined,
      };
      const existing = query.data;
      if (existing?.id) {
        const { error } = await (supabase as any)
          .from('workshop_settings')
          .update({ mechanic_card_prefs: merged })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('workshop_settings')
          .insert({ user_id: user.id, mechanic_card_prefs: merged });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mechanic-card-prefs'] }),
    onError: (e: any) => console.warn('[mechanic-card-prefs] save failed', e?.message),
  });

  return {
    visibleFields,
    printLang,
    loading: query.isLoading,
    setVisibleField: (field: keyof MechanicCardVisibleFields, value: boolean) =>
      saveMut.mutate({ visible_fields: { ...visibleFields, [field]: value } }),
    setPrintLang: (lang: string) => saveMut.mutate({ print_lang: lang }),
  };
}
