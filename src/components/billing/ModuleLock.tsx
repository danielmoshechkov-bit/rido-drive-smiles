import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';
import { czyWolnoWTrybieOdczytu } from '@/lib/trybOdczytu';
import { usePublicPricing } from '@/hooks/usePublicPricing';
import { useZakup } from '@/components/billing/ZakupProvider';
import type { PowodBlokady, LiniaProduktowa } from '@/hooks/useSubscriptionAccess';

/**
 * Nakładka blokująca moduł bez opłaconej subskrypcji.
 *
 * Dane ZOSTAJĄ widoczne pod spodem, przyciemnione. To nie jest ozdoba: warsztat
 * ma widzieć, co traci, i nie czuć, że zabraliśmy mu jego własność. Blokujemy
 * pracę, nie dostęp do informacji.
 *
 * DA SIĘ ODSŁONIĆ — świadomie. Nakładka odcina wskaźnik i klawiaturę (`inert`),
 * a pod spodem są przyciski eksportu (raporty, pokwitowania, PDF faktur), które
 * mają działać niezależnie od stanu płatności. Nakładka nie do zdjęcia zabrałaby
 * klientowi dostęp do jego własnych danych — a to jest dokładnie ta rzecz, której
 * obiecujemy nie robić. Po odsłonięciu zostaje pasek przypominający i przycisk
 * zakupu, więc powód blokady nie znika z ekranu.
 *
 * 🔴 PO ODSŁONIĘCIU ZAPIS MUSI BYĆ NAPRAWDĘ WYŁĄCZONY (13.09.2026).
 * Do dziś pasek mówił „zapis i edycja są wyłączone", a panel pod spodem był
 * w pełni używalny: dało się kliknąć „Dodaj zlecenie", wypełnić formularz
 * i dopiero wtedy dostać odmowę z bazy. Obietnica na pasku była nieprawdą,
 * a wyłączony przycisk jest uczciwszy niż formularz odrzucany na końcu.
 *
 * Teraz odsłonięte poddrzewo dostaje `StrazOdczytu`: przechwytuje kliknięcia
 * i wysyłki formularzy w fazie przechwytywania, przepuszcza wyłącznie to, co
 * `lib/trybOdczytu.ts` rozpoznaje jako czytanie, a resztę wygasza wizualnie.
 *
 * Odsłonięcie NIE jest luką: to warstwa wyglądu. Właściwym zabezpieczeniem jest
 * RLS i bramka w edge functions — zapis ma odbić się od bazy niezależnie od tego,
 * co widać na ekranie. Ktoś z narzędziami deweloperskimi i tak usunąłby ten div.
 */

/**
 * Straż trybu odczytu — jedno miejsce, w którym „tylko podgląd i eksport"
 * przestaje być napisem, a staje się zachowaniem.
 *
 * Decyzję podejmuje `czyWolnoWTrybieOdczytu`; tutaj jest tylko podpięcie jej
 * pod zdarzenia i oznaczenie zablokowanych elementów, żeby było je WIDAĆ,
 * a nie tylko czuć po kliknięciu.
 */
function StrazOdczytu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const ostatniKomunikat = useRef(0);

  const zatrzymaj = useCallback((e: Event) => {
    if (czyWolnoWTrybieOdczytu(e.target as Element | null)) return;
    e.preventDefault();
    e.stopPropagation();
    // Bez zdania klient widzi tylko przycisk, który „nie działa", i klika dalej.
    // Jeden komunikat na dwie sekundy — inaczej seria kliknięć zasypuje ekran.
    if (Date.now() - ostatniKomunikat.current > 2000) {
      ostatniKomunikat.current = Date.now();
      toast.info('Tryb odczytu — zapis i edycja wrócą po opłaceniu abonamentu.');
    }
  }, []);

  /**
   * Oznaczenie tego, co zablokowane, TĄ SAMĄ regułą co blokada. Gdyby wygląd
   * miał własny warunek, po pierwszej zmianie reguły jedno mówiłoby co innego
   * niż drugie — a klient patrzyłby na aktywny przycisk, który nic nie robi.
   */
  useEffect(() => {
    const korzen = ref.current;
    if (!korzen) return;
    const oznacz = () => {
      korzen.querySelectorAll('button, [role="button"], input, select, textarea').forEach((el) => {
        const wolno = czyWolnoWTrybieOdczytu(el);
        if (wolno) el.removeAttribute('data-zablokowane-odczytem');
        else el.setAttribute('data-zablokowane-odczytem', '');
      });
    };
    oznacz();
    // Panel dociąga dane i przerysowuje listy — bez obserwatora nowe przyciski
    // wyglądałyby na czynne.
    const obserwator = new MutationObserver(oznacz);
    obserwator.observe(korzen, { childList: true, subtree: true });
    return () => obserwator.disconnect();
  }, [children]);

  return (
    <div
      ref={ref}
      data-tryb-odczytu=""
      onClickCapture={(e) => zatrzymaj(e.nativeEvent)}
      // Klawiatura nie potrzebuje osobnej obsługi: Enter i spacja na przycisku
      // wywołują `click` (łapie `onClickCapture`), a Enter w polu formularza
      // wywołuje `submit` (łapie `onSubmitCapture`).
      onSubmitCapture={(e) => zatrzymaj(e.nativeEvent)}
    >
      {children}
    </div>
  );
}
const TRESC = {
  platnosc: {
    naglowek: 'Nie udało się pobrać płatności',
    opis: 'Twoje dane są bezpieczne i wrócą od razu po opłaceniu. Księgowość i faktury '
      + 'działają bez przerwy. Zaktualizuj kartę albo opłać abonament, aby odblokować resztę.',
    cta: 'Opłać abonament',
    pasek: 'Płatność nie przeszła — moduł działa w trybie odczytu.',
  },
  wygasla: {
    naglowek: 'Subskrypcja wygasła',
    opis: 'Odnów plan, aby wrócić do pracy.',
    cta: 'Odnów plan',
    pasek: 'Subskrypcja wygasła — moduł działa w trybie odczytu.',
  },
  trial: {
    naglowek: 'Okres próbny dobiegł końca',
    // Klient, który myśli, że stracił kartotekę, nie wraca. Dlatego zdanie
    // o danych jest tu pierwsze, a dopiero potem prośba o zakup — i mówi
    // wprost, co NADAL działa, zamiast zostawiać go z domysłem.
    opis: 'Twoje dane są bezpieczne — zlecenia, kartoteka klientów i pojazdów czekają w całości '
      + 'i wrócą od razu po opłaceniu. Księgowość i faktury działają bez przerwy, także teraz.',
    cta: 'Wybierz plan',
    pasek: 'Okres próbny się skończył — moduł działa w trybie odczytu.',
  },
  brak: {
    naglowek: 'Wybierz plan, aby zacząć',
    opis: 'Ten moduł wymaga aktywnego planu.',
    cta: 'Zobacz plany',
    pasek: 'Brak aktywnego planu — moduł działa w trybie odczytu.',
  },
} as const;

export function ModuleLock({
  zablokowane,
  powod,
  linia = 'warsztat',
  wariant = 'nakladka',
  children,
}: {
  zablokowane: boolean;
  powod: PowodBlokady;
  /** Która linia produktowa jest nieopłacona — decyduje, co proponujemy kupić. */
  linia?: LiniaProduktowa;
  /**
   * `nakladka` — przyciemnia treść pod spodem. Dla ekranów, na których się pracuje.
   * `baner` — karta NAD treścią, treść zostaje w pełni używalna. Dla ekranów,
   * które są nawigacją (siatka kafelków): przyciemnianie menu niczego nie chroni,
   * bo pod spodem nie ma czego zapisać, a odbiera jedyną drogę do reszty modułu.
   */
  wariant?: 'nakladka' | 'baner';
  children: ReactNode;
}) {
  const { otworzZakup } = useZakup();
  const { plans } = usePublicPricing();
  const [odsloniete, setOdsloniete] = useState(false);

  if (!zablokowane) return <>{children}</>;

  // Do odblokowania proponujemy najtańszy płatny plan z tej linii — klient
  // i tak zmieni go w checkoucie, a wybór „od czegoś" jest lepszy niż lista.
  const plan = plans
    .filter((p) => p.product_line === linia && !p.is_custom && Number(p.price_net) > 0)
    .sort((a, b) => Number(a.price_net) - Number(b.price_net))[0];

  // Cztery sytuacje, nie dwie. Najczęstsza na starcie to koniec okresu próbnego
  // u kogoś, kto NIGDY nie kupił — i to jest moment, w którym staje się klientem
  // albo odchodzi. Ten ekran ma sprzedawać, nie informować o awarii.
  const tresc = TRESC[powod ?? 'brak'];
  /**
   * 🔴 OTWIERAMY NA WYBORZE PLANU, NIE NA OKRESIE (poprawione 13.09.2026).
   *
   * Stało tu `planCode: plan?.code`, czyli kod NAJTAŃSZEGO planu — a okno
   * zakupu, dostając kod, pomija krok wyboru i staje od razu na „Na jak długo".
   * Klient po wygaśnięciu widział więc dwie ceny Standardu i nie miał jak
   * wybrać Pro ani zobaczyć, co który plan zawiera.
   *
   * To jest moment, w którym najłatwiej sprzedać wyższy plan, a pokazywaliśmy
   * wyłącznie ten, który klient już miał. `planCode: null` otwiera okno na
   * kafelkach planów — tak jak z cennika.
   *
   * Cena w napisie przycisku ZOSTAJE: „od 99 zł netto" to zachęta, nie wybór.
   */
  const kupPlan = (
    <Button className="shrink-0" onClick={() => otworzZakup({ planCode: null })}>
      {tresc.cta}
    </Button>
  );

  const kartaSprzedazowa = (
    <div className="max-w-md w-full rounded-xl border bg-background/95 backdrop-blur shadow-xl p-6 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Lock className="h-6 w-6 text-primary" />
      </div>

      <h3 className="text-lg font-bold mb-2">{tresc.naglowek}</h3>

      <p className="text-sm text-muted-foreground mb-5">
        {tresc.opis} Twoje dane są bezpieczne — nic nie zostało usunięte.
      </p>

      {/* Jedno okno: plan, okres i metoda płatności wybiera się w nim.
          Wcześniej stały tu dwa przyciski — karta i BLIK — a wybór okresu
          nie istniał w ogóle. */}
      <Button className="w-full" onClick={() => otworzZakup({ planCode: null })}>
        {plan && powod !== 'platnosc'
          ? `${tresc.cta} — od ${Number(plan.price_net)} zł netto`
          : tresc.cta}
      </Button>

      {/* Druga droga płatności, tej samej wielkości i bez nawiasów.
          Część warsztatów karty nie podepnie — dla nich abonament ze Stripe
          to nie jest wyjście, tylko ta sama ściana. Po miesiącu blokada wraca
          i klient płaci ponownie, świadomie. */}
      {/* Po zakończeniu triala klient nie wie jeszcze, CZEGO chce — jeden
          przycisk „kup najtańszy" to za mało. Link do cennika daje mu wybór,
          zamiast decydować za niego. */}
      {(powod === 'trial' || powod === 'brak') && (
        <a href="/cennik" className="mt-3 inline-block text-sm text-primary underline underline-offset-4">
          Porównaj wszystkie plany
        </a>
      )}
    </div>
  );

  if (wariant === 'baner') {
    return (
      <div className="space-y-6">
        <div className="flex justify-center">{kartaSprzedazowa}</div>
        {children}
      </div>
    );
  }

  if (odsloniete) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm">
            {tresc.pasek} Podgląd i eksport działają, zapis i edycja są wyłączone.
          </p>
          {kupPlan}
        </div>
        <StrazOdczytu>{children}</StrazOdczytu>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* `inert` wyłącza całe poddrzewo z interakcji i z nawigacji klawiaturą. */}
      <div className="pointer-events-none select-none blur-[2px] opacity-40" {...({ inert: '' } as any)}>
        {children}
      </div>

      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 px-4">
        <div className="max-w-md w-full">
          {kartaSprzedazowa}
          <button
            type="button"
            onClick={() => setOdsloniete(true)}
            className="mt-3 block w-full text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Przeglądaj i eksportuj swoje dane
          </button>
        </div>
      </div>
    </div>
  );
}
