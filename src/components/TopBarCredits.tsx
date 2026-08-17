import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Car, MessageSquare } from 'lucide-react';
import { VehicleLookupCreditsModal } from './vehicle/VehicleLookupCreditsModal';
import { SmsPurchaseModal } from './SmsPurchaseModal';
import { dostepneSprawdzeniaVin, dostepneSms } from '@/lib/dostepneJednostki';

export function TopBarCredits() {
  const qc = useQueryClient();

  /**
   * Powrót z bramki płatności — odświeżenie liczników.
   *
   * 🔴 NAPRAWIONE 18.08.2026: po zakupie kredyty pojawiały się dopiero po
   * wylogowaniu. `billing-payu-order` odsyła klienta na `?platnosc=payu`, ale
   * NIKT tego parametru nie czytał, więc pamięć podręczna liczników zostawała
   * z liczbą sprzed zakupu.
   *
   * Unieważniamy oba klucze naraz, bo jedna wizyta w bramce mogła dotyczyć
   * SMS-ów albo sprawdzeń — nie wiemy których, a odświeżenie obu nic nie kosztuje.
   * Parametr usuwamy z adresu, żeby odświeżenie strony nie powtarzało tego bez końca.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('platnosc') !== 'payu') return;

    qc.invalidateQueries({ queryKey: ['vehicle-lookup-credits'] });
    qc.invalidateQueries({ queryKey: ['sms-credits'] });

    params.delete('platnosc');
    const reszta = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (reszta ? `?${reszta}` : ''));
  }, [qc]);

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);

  const { data: vehicleCredits } = useQuery({
    queryKey: ['vehicle-lookup-credits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      // Ten sam helper co w `useVehicleLookup` — patrz `dostepneJednostki.ts`.
      // Wcześniej pasek miał własną kopię tego wyliczenia i przy zmianie
      // rozjeżdżał się z modalem dodawania pojazdu.
      return dostepneSprawdzeniaVin(user.id);
    },
  });

  const { data: smsCredits } = useQuery({
    queryKey: ['sms-credits'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;
      return dostepneSms(user.id);
    },
  });

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Vehicle lookup credits badge */}
        <button
          onClick={() => setShowVehicleModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors cursor-pointer"
          title="Zapytania o pojazdy"
        >
          <Car className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold text-destructive">{vehicleCredits ?? 0}</span>
        </button>

        {/* SMS credits badge */}
        <button
          onClick={() => setShowSmsModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors cursor-pointer border border-border"
          title="Pakiet SMS"
        >
          <MessageSquare className="h-4 w-4 text-foreground" />
          {/* `null` z `sms_dostepne` znaczy plan bez limitu — kreska zamiast
              zmyślonej liczby. `undefined` to jeszcze niewczytane. */}
          <span className="text-sm font-semibold text-foreground">
            {smsCredits === null ? '∞' : (smsCredits ?? 0)}
          </span>
        </button>
      </div>

      <VehicleLookupCreditsModal
        open={showVehicleModal}
        onOpenChange={setShowVehicleModal}
      />

      <SmsPurchaseModal
        open={showSmsModal}
        onOpenChange={setShowSmsModal}
      />
    </>
  );
}
