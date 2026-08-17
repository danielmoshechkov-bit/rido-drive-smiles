import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuotaGuard } from '@/components/quota/QuotaGuardProvider';
import { odczytajBladFunkcji } from '@/utils/bladFunkcji';
import { dostepneSprawdzeniaVin } from '@/lib/dostepneJednostki';

interface VehicleLookupCredits {
  /** Ile sprawdzeń klient realnie może wykonać: pula planu plus paczki. */
  remaining_credits: number;
  /** Plan bez limitu — interfejs pokazuje wtedy znak nieskończoności. */
  bez_limitu?: boolean;
}

interface VehicleData {
  registration_number?: string;
  vin?: string;
  make?: string;
  model?: string;
  body_style?: string;
  color?: string;
  registration_year?: number;
  fuel_type?: string;
  engine_size?: string;
  engine_power_kw?: string;
  mileage?: string;
  transmission?: string;
  number_of_doors?: string;
  number_of_seats?: string;
  description?: string;
}

/**
 * Prośba o zgodę na użycie własnych kredytów pracownika.
 *
 * `null` = funkcja o zgodę nie prosiła.
 */
type Akcja = 'check-registration' | 'check-vin';

export interface ProsbaOZgode {
  wlasnePozostalo: number;
  /** Warsztat, którego pula się wyczerpała — do prośby o doładowanie. */
  providerId: string | null;
  /** Powtórzenie tego samego sprawdzenia, już ze zgodą. */
  potwierdz: () => Promise<VehicleData | null>;
}

/**
 * Wywołanie `vehicle-check` z rozpoznaniem odmowy.
 *
 * ⚠️ Przy 402 `functions.invoke` NIE wypełnia `data` — ustawia `error`, a treść
 * odpowiedzi zostawia w `error.context` jako `Response`. Kod, który sprawdzał
 * `data?.error === 'NO_CREDITS'`, nigdy się nie wykonywał; działało wyłącznie
 * łapanie tekstu „402" z komunikatu biblioteki. Dlatego czytamy `surowe`.
 */
async function wolajVehicleCheck(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('vehicle-check', { body });
  if (!error) return { dane: data as any, odmowa: null as any };

  const blad = await odczytajBladFunkcji(error);
  const surowe = (blad.surowe ?? {}) as Record<string, any>;
  if (surowe.error === 'ZGODA_WLASNE_KREDYTY' || surowe.error === 'NO_CREDITS') {
    return { dane: null, odmowa: { ...surowe, komunikat: blad.komunikat } };
  }
  throw error;
}

export function useVehicleLookup(userId?: string) {
  const [credits, setCredits] = useState<VehicleLookupCredits | null>(null);
  const [loading, setLoading] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const { runWithQuota, poprosOZgode } = useQuotaGuard();

  const fetchCredits = useCallback(async () => {
    if (!userId) return;
    setCreditsLoading(true);
    try {
      // 🔴 NAPRAWIONE 17.08.2026. Czytało `vehicle_lookup_credits`, czyli STARE
      // SALDO OSOBISTE — a migracja 4.12 przeniosła kredyty właścicieli do puli
      // warsztatu. Skutek: jedno konto pokazywało 58 w bazie, 39 w tym modalu
      // i 0 na górnym pasku. Trzy liczby tego samego salda.
      //
      // Teraz wszystkie liczniki idą przez `dostepneSprawdzeniaVin`, czyli przez
      // `check_usage` — tę samą funkcję, którą przy wydawaniu jednostki pyta
      // `billing_consume`. Licznik i wysyłka nie mogą się już rozjechać.
      const dostepne = await dostepneSprawdzeniaVin(userId);

      setCredits({
        // `null` znaczy „bez limitu w planie". Interfejs sprawdza `< 1`, więc
        // podajemy liczbę, przy której nigdy nie zablokuje.
        remaining_credits: dostepne === null ? Number.MAX_SAFE_INTEGER : dostepne,
        bez_limitu: dostepne === null,
      });
    } catch (err) {
      console.error(err);
      setCredits({ remaining_credits: 0, bez_limitu: false });
    } finally {
      setCreditsLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchCredits(); }, [fetchCredits]);



  // USUNIĘTE 16.08.2026 — `purchaseCredits` dopisywał kredyty wprost do
  // `vehicle_lookup_credits` z przeglądarki, z komentarzem „For now, simulate
  // purchase (payment gateway integration later)". Płatności nikt nie pobierał.
  //
  // Był wpięty w SZEŚĆ komponentów. Dziś martwy (modal doładowania prowadzi do
  // PayU i ignoruje ten handler) i zablokowany politykami z 05.08, ale dopóki
  // istniał, wystarczyło podpiąć go z powrotem albo poluzować RLS, żeby wrócił
  // darmowy dystrybutor kredytów. Doładowania idą przez `billing-payu-order`.



  // Funkcja woła samą siebie po uzyskaniu zgody, a `useCallback` nie widzi
  // jeszcze własnej referencji w chwili tworzenia — stąd ref.
  const wykonajRef = useRef<
    (a: Akcja, p: Record<string, unknown>, e: string, z?: boolean) => Promise<VehicleData | null>
  >();

  const wykonajSprawdzenie = useCallback(async (
    action: Akcja,
    payload: Record<string, unknown>,
    etykieta: string,
    uzyjWlasnych = false,
  ): Promise<VehicleData | null> => {
    if (!userId) { toast.error('Musisz być zalogowany'); return null; }
    setLoading(true);
    try {
      const wynik = await runWithQuota('vehicle_lookup', async () => {
        const { dane, odmowa } = await wolajVehicleCheck({ action, ...payload, uzyjWlasnych });
        // Brak środków w ogóle — to obsługuje bramka limitów (proponuje doładowanie).
        if (odmowa?.error === 'NO_CREDITS') throw new Error('NO_CREDITS');
        // Pula firmy pusta, ale pracownik ma swoje — o tym decyduje człowiek, nie bramka.
        if (odmowa) return { odmowa };
        return dane;
      }, { retryLabel: etykieta });

      if (!wynik) return null;
      const data: any = wynik;

      if (data.odmowa) {
        poprosOZgode({
          wlasnePozostalo: Number(data.odmowa.wlasnePozostalo ?? 0),
          providerId: data.odmowa.providerId ?? null,
          potwierdz: async () => (await wykonajRef.current?.(action, payload, etykieta, true)) ?? null,
        });
        return null;
      }

      if (data?.error === 'INTEGRATION_DISABLED') {
        toast.error('Integracja pojazdów nie jest aktywna');
        return null;
      }
      if (data?.error === 'NOT_FOUND' || data?.error === 'NO_DATA') {
        toast.error(action === 'check-vin'
          ? 'Nie znaleziono pojazdu po numerze VIN'
          : 'Nie znaleziono danych dla podanego numeru rejestracyjnego');
        return null;
      }
      if (data?.error) {
        toast.error(data.message || 'Błąd');
        return null;
      }
      if (data?.data) {
        toast.success('Dane pojazdu zostały pobrane');
        await fetchCredits();
        return data.data as VehicleData;
      }
      return null;
    } catch (e: any) {
      if (e?.message === 'NO_CREDITS') throw e;
      toast.error('Błąd połączenia');
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId, fetchCredits, runWithQuota, poprosOZgode]);

  wykonajRef.current = wykonajSprawdzenie;

  /**
   * `wprowadzenie` przekazujemy dalej do serwera — TAM zapada decyzja, czy to
   * sprawdzenie jest darmowe. Przeglądarka może wysłać tę flagę w kółko; baza
   * odhacza jedyne darmowe sprawdzenie w jednej transakcji.
   */
  const checkRegistration = useCallback((regNumber: string, wprowadzenie = false) => wykonajSprawdzenie(
    'check-registration', { registrationNumber: regNumber, onboarding: wprowadzenie },
    `sprawdzenie rejestracji ${regNumber}`,
  ), [wykonajSprawdzenie]);

  const checkVin = useCallback((vinNumber: string, wprowadzenie = false) => wykonajSprawdzenie(
    'check-vin', { vin: vinNumber, onboarding: wprowadzenie },
    `sprawdzenie VIN ${vinNumber}`,
  ), [wykonajSprawdzenie]);

  return {
    credits,
    creditsLoading,
    loading,
    checkRegistration,
    checkVin,
    refreshCredits: fetchCredits,
  };
}
