import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Car, MessageSquare, Sparkles } from 'lucide-react';
import { VehicleLookupCreditsModal } from './vehicle/VehicleLookupCreditsModal';
import { SmsPurchaseModal } from './SmsPurchaseModal';
import { RidoAiCreditsModal } from './RidoAiCreditsModal';
import { useDostepneJednostki, useOdswiezJednostki } from '@/hooks/useDostepneJednostki';

export function TopBarCredits() {
  const odswiez = useOdswiezJednostki();

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

    // Bez argumentu = wszystkie jednostki. Nie wiemy, czego dotyczył zakup.
    odswiez();

    params.delete('platnosc');
    const reszta = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (reszta ? `?${reszta}` : ''));
  }, [odswiez]);

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // Oba liczniki przez wspólny hak — jeden klucz na jednostkę, wspólny
  // z modalami i kartą zlecenia. Patrz `useDostepneJednostki`.
  const { dostepne: vehicleCredits } = useDostepneJednostki('vehicle_lookup');
  const { dostepne: smsCredits } = useDostepneJednostki('sms');
  /**
   * Rido AI — JEDNA pula na wyceny i pomoc przy naprawie.
   *
   * Wcześniej były dwie osobne pozycje w cenniku, więc byłyby dwa liczniki
   * i dwa doładowania. Dla warsztatu to jedna rzecz: zapytał Rido AI. Oba
   * pytania idą przy tym na to samo konto u dostawcy modelu i kosztują tyle
   * samo, więc dzielenie ich utrudniało liczenie, nie ułatwiało niczego.
   */
  const { dostepne: ridoAi } = useDostepneJednostki('rido_ai');

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

        {/* Rido AI — wyceny i pomoc przy naprawie z jednej puli */}
        <button
          onClick={() => setShowAiModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors cursor-pointer border border-primary/20"
          title="Rido AI — wyceny i pomoc przy naprawie"
        >
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-primary">
            {ridoAi === null ? '∞' : (ridoAi ?? 0)}
          </span>
        </button>
      </div>

      <RidoAiCreditsModal
        open={showAiModal}
        onOpenChange={setShowAiModal}
        dostepne={ridoAi}
      />

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
