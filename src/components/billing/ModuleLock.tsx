import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';
import { useCheckout } from '@/hooks/useCheckout';
import { usePublicPricing } from '@/hooks/usePublicPricing';
import type { PowodBlokady } from '@/hooks/useSubscriptionAccess';

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
 * Odsłonięcie NIE jest luką: to warstwa wyglądu. Właściwym zabezpieczeniem jest
 * RLS i bramka w edge functions — zapis ma odbić się od bazy niezależnie od tego,
 * co widać na ekranie. Ktoś z narzędziami deweloperskimi i tak usunąłby ten div.
 */
const TRESC = {
  platnosc: {
    naglowek: 'Nie udało się pobrać płatności',
    opis: 'Zaktualizuj kartę albo opłać abonament, aby odblokować dostęp.',
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
    opis: 'Wybierz plan, aby wrócić do pracy. Wszystko, co wprowadziłeś przez ostatnie tygodnie, czeka na Ciebie.',
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
  children,
}: {
  zablokowane: boolean;
  powod: PowodBlokady;
  children: ReactNode;
}) {
  const { kup, pending } = useCheckout();
  const { plans } = usePublicPricing();
  const [odsloniete, setOdsloniete] = useState(false);

  if (!zablokowane) return <>{children}</>;

  // Do odblokowania proponujemy najtańszy płatny plan warsztatowy — klient
  // i tak zmieni go w checkoucie, a wybór „od czegoś" jest lepszy niż lista.
  const plan = plans
    .filter((p) => p.product_line === 'warsztat' && !p.is_custom && Number(p.price_net) > 0)
    .sort((a, b) => Number(a.price_net) - Number(b.price_net))[0];

  // Cztery sytuacje, nie dwie. Najczęstsza na starcie to koniec okresu próbnego
  // u kogoś, kto NIGDY nie kupił — i to jest moment, w którym staje się klientem
  // albo odchodzi. Ten ekran ma sprzedawać, nie informować o awarii.
  const tresc = TRESC[powod ?? 'brak'];
  const kupPlan = plan ? (
    <Button className="shrink-0" disabled={!!pending} onClick={() => kup(plan.code)}>
      {pending === plan.code ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
      {tresc.cta}
    </Button>
  ) : null;

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
        {children}
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
        <div className="max-w-md w-full rounded-xl border bg-background/95 backdrop-blur shadow-xl p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>

          <h3 className="text-lg font-bold mb-2">{tresc.naglowek}</h3>

          <p className="text-sm text-muted-foreground mb-5">
            {tresc.opis} Twoje dane są bezpieczne — nic nie zostało usunięte.
          </p>

          {plan && (
            <Button className="w-full" disabled={!!pending} onClick={() => kup(plan.code)}>
              {pending === plan.code ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {powod === 'platnosc' ? tresc.cta : `${tresc.cta} — od ${Number(plan.price_net)} zł netto`}
            </Button>
          )}

          {/* Po zakończeniu triala klient nie wie jeszcze, CZEGO chce — jeden
              przycisk „kup najtańszy" to za mało. Link do cennika daje mu wybór,
              zamiast decydować za niego. */}
          {(powod === 'trial' || powod === 'brak') && (
            <a
              href="/cennik"
              className="mt-3 inline-block text-sm text-primary underline underline-offset-4"
            >
              Porównaj wszystkie plany
            </a>
          )}

          <button
            type="button"
            onClick={() => setOdsloniete(true)}
            className="mt-4 block w-full text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Przeglądaj i eksportuj swoje dane
          </button>
        </div>
      </div>
    </div>
  );
}
