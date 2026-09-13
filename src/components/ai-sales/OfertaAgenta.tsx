import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Phone, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePublicPricing, usePubliczneDoladowania, type PublicPlan } from '@/hooks/usePublicPricing';
import { usePlanAction } from '@/hooks/usePlanAction';
import { formatMoneyPLN } from '@/utils/formatters';
import { toast } from 'sonner';

/**
 * Zakładka „Asystent głosowy" dla warsztatu BEZ OPŁACONEGO PAKIETU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO OFERTA, A NIE ZABLOKOWANE POLA
 * ═══════════════════════════════════════════════════════════════════════════
 * Zablokowane pole mówi „nie możesz". Oferta mówi „oto co dostaniesz". To jest
 * pierwsza rzecz, jaką warsztat widzi po wejściu w tę zakładkę — i albo kupi,
 * albo zamknie. Ma zobaczyć produkt i cenę, nie zamknięte drzwi.
 *
 * Ten sam widok obsługuje WYGAŚNIĘTĄ subskrypcję: agent nie działa, ofertę
 * można kupić ponownie, a ustawienia i dane firmy czekają w bazie nietknięte.
 * Dochodzi wtedy jedna informacja, bez której warsztat nie wie, że ma czas:
 * ile dni jego numer jest jeszcze zarezerwowany.
 *
 * Ceny, zawartość pakietów i stawka po wyczerpaniu idą Z CENNIKA W BAZIE —
 * z tego samego miejsca co /warsztat-info i okno zakupu. Zmiana ceny w panelu
 * administratora wchodzi tu bez wdrożenia i nie ma jak rozjechać się z kasą.
 */

/**
 * Okno „płatność w toku".
 *
 * Webhook operatora potrafi dojechać kilkanaście sekund po powrocie klienta.
 * Bez tego okna warsztat wraca z bramki, widzi znowu cennik i klika „Kup"
 * drugi raz — płacąc dwa razy za to samo.
 */
const KLUCZ_OCZEKIWANIA = 'agent-zakup-oczekuje';
const OKNO_OCZEKIWANIA_MS = 10 * 60 * 1000;

const zapamietajZakup = () => {
  try { localStorage.setItem(KLUCZ_OCZEKIWANIA, String(Date.now())); } catch { /* tryb prywatny */ }
};
const czyOczekujemy = () => {
  try {
    const od = Number(localStorage.getItem(KLUCZ_OCZEKIWANIA) || 0);
    return od > 0 && Date.now() - od < OKNO_OCZEKIWANIA_MS;
  } catch { return false; }
};
const zapomnijZakup = () => {
  try { localStorage.removeItem(KLUCZ_OCZEKIWANIA); } catch { /* nic */ }
};

/** Numer i to, ile dni jeszcze jest trzymany dla tego warsztatu. */
function useZarezerwowanyNumer() {
  return useQuery({
    queryKey: ['numer-zarezerwowany'],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data: numer } = await (supabase as any)
        .from('voice_numbers')
        .select('phone_number, status')
        .in('status', ['aktywny', 'przypisywany'])
        .limit(1)
        .maybeSingle();
      if (!numer?.phone_number) return null;

      // Reguła: numer zostaje przypisany 30 dni po utracie prawa do niego.
      const { data: sub } = await (supabase as any)
        .from('billing_subscriptions')
        .select('current_period_end')
        .eq('product_line', 'agent')
        .order('current_period_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      let dni: number | null = null;
      if (sub?.current_period_end) {
        const koniec = new Date(sub.current_period_end).getTime() + 30 * 24 * 60 * 60 * 1000;
        dni = Math.max(0, Math.ceil((koniec - Date.now()) / (24 * 60 * 60 * 1000)));
      }
      return { numer: String(numer.phone_number), dni };
    },
  });
}

/** „48221015896" → „48 221 015 896" — numer do przeczytania, nie do sklejania. */
const czytelnyNumer = (n: string) => n.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4');

function KartaPakietu({ plan, wyrozniony, stawkaPoPakiecie, onKup }: {
  plan: PublicPlan;
  wyrozniony: boolean;
  stawkaPoPakiecie: number | null;
  onKup: (p: PublicPlan) => void;
}) {
  return (
    <Card className={`relative flex flex-col ${wyrozniony ? 'border-primary shadow-lg' : ''}`}>
      {wyrozniony && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Najczęściej wybierany</Badge>
      )}
      <CardContent className="pt-6 flex flex-col flex-1">
        <div className="text-lg font-bold">{plan.name}</div>
        <div className="mt-2 mb-4">
          <span className="text-3xl font-extrabold">{formatMoneyPLN(Number(plan.price_net ?? 0))}</span>
          <span className="text-sm text-muted-foreground"> netto / mies.</span>
        </div>
        <ul className="space-y-2 flex-1">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        {/* Pełny koszt na karcie, nie w osobnej sekcji — warsztat ma go zobaczyć
            razem z ceną, a nie znaleźć niżej. */}
        {stawkaPoPakiecie != null && (
          <p className="mt-4 text-xs text-muted-foreground border-t pt-3">
            Po wykorzystaniu pakietu — {formatMoneyPLN(stawkaPoPakiecie)} netto za minutę.
          </p>
        )}
        <Button className="w-full mt-4" variant={wyrozniony ? 'default' : 'outline'} onClick={() => onKup(plan)}>
          Kup {plan.name}
        </Button>
      </CardContent>
    </Card>
  );
}

export function OfertaAgenta() {
  const { plans, loading } = usePublicPricing();
  const { doladowanie } = usePubliczneDoladowania();
  const { data: rezerwacja } = useZarezerwowanyNumer();
  const qc = useQueryClient();
  const [oczekuje, setOczekuje] = useState(czyOczekujemy);

  const stawka = doladowanie('voice_minutes')?.unit_price_net ?? null;
  const pakiety = useMemo(
    () => plans.filter((p) => p.product_line === 'agent' && !p.is_custom),
    [plans],
  );

  // Niezalogowanego tu nie ma — zakładka żyje wewnątrz panelu warsztatu.
  const { klik } = usePlanAction(() => toast.error('Zaloguj się, żeby kupić pakiet.'));

  // Powrót z bramki płatności (Stripe `?platnosc=ok`, PayU `?platnosc=payu`).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('platnosc');
    if (p === 'ok' || p === 'payu') {
      zapamietajZakup();
      setOczekuje(true);
    }
  }, []);

  /**
   * Dopóki czekamy na potwierdzenie, dopytujemy o pakiet co pięć sekund.
   * Gdy przyjdzie, rodzic sam przełączy widok na ustawienia — ten komponent
   * zniknie razem z odpytywaniem.
   */
  useEffect(() => {
    if (!oczekuje) return;
    const t = window.setInterval(() => {
      if (!czyOczekujemy()) { setOczekuje(false); zapomnijZakup(); return; }
      void qc.invalidateQueries({ queryKey: ['pakiet-agenta'] });
    }, 5000);
    return () => window.clearInterval(t);
  }, [oczekuje, qc]);

  const kup = (p: PublicPlan) => { zapamietajZakup(); setOczekuje(true); klik(p); };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (oczekuje) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-5" />
        <h2 className="text-xl font-bold">Przetwarzamy płatność</h2>
        <p className="mt-2 text-muted-foreground leading-relaxed">
          To potrwa chwilę — potwierdzenie od operatora czasem idzie kilkanaście sekund.
          Nie płać drugi raz; gdy tylko dojdzie, zobaczysz tu ustawienia agenta.
        </p>
        <Button
          variant="ghost"
          className="mt-6"
          onClick={() => { zapomnijZakup(); setOczekuje(false); }}
        >
          Wróć do oferty
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary font-medium mb-3">
          <Phone className="h-4 w-4" /> Asystent głosowy
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight">Odbiera telefon, gdy Ty jesteś pod autem</h2>
        <p className="mt-3 text-muted-foreground leading-relaxed">
          Agent odbiera połączenia całą dobę, rozmawia z klientem po ludzku, umawia wizytę
          w Twoim terminarzu i zakłada zlecenie. Nie zmieniasz numeru ani niczego nie instalujesz —
          ustawiasz przekierowanie u swojego operatora i tyle.
        </p>
      </div>

      {/* Numer trzymany po wygaśnięciu — bez tego warsztat nie wie, że ma czas
          na odnowienie, zanim straci numer i wszystkie przekierowania. */}
      {rezerwacja && (
        <div className="max-w-2xl mx-auto rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100 text-center">
          Twój numer <strong>{czytelnyNumer(rezerwacja.numer)}</strong> jest zarezerwowany
          {rezerwacja.dni != null ? <> jeszcze przez <strong>{rezerwacja.dni} dni</strong></> : ' przez 30 dni od końca okresu'}.
          Odnów pakiet, żeby go zachować razem z ustawionymi przekierowaniami.
        </div>
      )}

      {pakiety.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {pakiety.map((p) => (
            <KartaPakietu
              key={p.code}
              plan={p}
              wyrozniony={p.code === 'agent'}
              stawkaPoPakiecie={stawka != null ? Number(stawka) : null}
              onKup={kup}
            />
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Nie udało się wczytać cennika. Odśwież stronę albo napisz do nas — podamy ceny od ręki.
        </p>
      )}
    </div>
  );
}
