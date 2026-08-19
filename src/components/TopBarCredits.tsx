import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Car, MessageSquare } from 'lucide-react';
import { VehicleLookupCreditsModal } from './vehicle/VehicleLookupCreditsModal';
import { SmsPurchaseModal } from './SmsPurchaseModal';
import { useDostepneJednostki, useOdswiezJednostki } from '@/hooks/useDostepneJednostki';
import {
  czekajNaWydanie, nasluchujDoladowan, odczytajZamowienie,
  LIMIT_POWROTU_MS, LIMIT_KARTY_ZAKUPU_MS,
} from '@/lib/doladowanie';

export function TopBarCredits() {
  const odswiez = useOdswiezJednostki();

  /**
   * Powrót z bramki płatności.
   *
   * 🔴 NAPRAWIONE 18.08.2026: po zakupie kredyty pojawiały się dopiero po
   * wylogowaniu. `billing-payu-order` odsyła klienta na `?platnosc=payu`, ale
   * NIKT tego parametru nie czytał.
   *
   * 🔴 POPRAWIONE 19.08.2026: samo unieważnienie było za mało. PayU odsyła
   * klienta niezależnie od tego, czy jego powiadomienie zdążyło do nas dojść,
   * więc jeden odczyt trafiony sekundę za wcześnie pokazywał starą liczbę
   * i nic już nie próbowało ponownie. Teraz czekamy na WYDANIE paczki
   * (`billing_orders.wydane_at`), z twardym końcem i komunikatem — patrz
   * `lib/doladowanie`.
   *
   * Parametr usuwamy z adresu od razu, żeby odświeżenie strony nie zaczynało
   * czuwania od nowa.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('platnosc') !== 'payu') return;

    params.delete('platnosc');
    const reszta = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (reszta ? `?${reszta}` : ''));

    void czekajNaWydanie({
      // Identyfikator z zapisu, gdy jest; inaczej najnowsze własne zamówienie —
      // adres powrotu jest stały i nic w nim nie niesie.
      orderId: odczytajZamowienie(),
      limitMs: LIMIT_POWROTU_MS,
      // Bez argumentu = wszystkie jednostki. Adres powrotu jest stały, więc
      // nie wiemy, czego dotyczył zakup, a odświeżenie obu nic nie kosztuje.
      gdyWydane: () => { void odswiez(); },
    }).then((wynik) => {
      if (wynik === 'wydane') {
        toast.success('Doładowanie gotowe.');
      } else if (wynik === 'oplacone') {
        // Pieniądze przyszły, paczki jeszcze nie wydano. Mówimy to wprost,
        // zamiast zostawiać klienta ze starym licznikiem i bez wyjaśnienia.
        toast.info('Płatność potwierdzona, kredyty pojawią się za chwilę.');
      } else if (wynik === 'odrzucone') {
        toast.error('Płatność nie została zrealizowana. Kredyty nie zostały dodane.');
      } else if (wynik === 'oczekuje') {
        // Świadomie NIE piszemy „płatność potwierdzona" — potwierdzenia nie ma.
        toast.info('Czekamy na potwierdzenie z PayU. Kredyty pojawią się, gdy dojdzie.');
      }
      // 'brak' — nie znaleźliśmy zamówienia (np. powrót w innej przeglądarce).
      // Milczymy: licznik i tak wczytał się świeżo przy wejściu na stronę.
    });
  }, [odswiez]);

  /**
   * Podjęcie nadzoru nad zamówieniem w toku.
   *
   * Scenariusz, który to obsługuje: klient klika doładowanie w panelu, płaci
   * w karcie PayU, ZAMYKA ją i wraca do panelu. Powrót `?platnosc=payu` poszedł
   * do zamkniętej karty, więc nigdy go tu nie zobaczymy. Nadzór z chwili zakupu
   * działa — dopóki karta panelu nie została odświeżona. Ten efekt przywraca go
   * także po odświeżeniu, po wznowieniu karty przez przeglądarkę i po powrocie
   * do panelu z innego miejsca.
   *
   * Cicho, bez komunikatów: klient nie klikał nic, na co miałby dostać odpowiedź.
   * Ma tylko zobaczyć, że licznik sam się poprawił.
   */
  useEffect(() => {
    const zamowienie = odczytajZamowienie();
    if (!zamowienie) return;
    void czekajNaWydanie({
      orderId: zamowienie,
      limitMs: LIMIT_KARTY_ZAKUPU_MS,
      gdyWydane: () => { void odswiez(); },
    });
  }, [odswiez]);

  /**
   * Zakup mógł się rozstrzygnąć w DRUGIEJ karcie — modal otwiera PayU przez
   * `window.open`. Ta karta nigdy się nie przeładuje, a `refetchOnWindowFocus`
   * jest w projekcie wyłączony, więc bez tego nasłuchu jej licznik zostałby
   * nieświeży aż do wylogowania.
   */
  useEffect(() => nasluchujDoladowan(() => { void odswiez(); }), [odswiez]);

  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);

  // Oba liczniki przez wspólny hak — jeden klucz na jednostkę, wspólny
  // z modalami i kartą zlecenia. Patrz `useDostepneJednostki`.
  const { dostepne: vehicleCredits } = useDostepneJednostki('vehicle_lookup');
  const { dostepne: smsCredits } = useDostepneJednostki('sms');

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
