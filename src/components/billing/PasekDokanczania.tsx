import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { usePublicPricing } from '@/hooks/usePublicPricing';
import { KupMiesiacBlik } from '@/components/billing/KupMiesiacBlik';
import type { DostepWarsztatu } from '@/hooks/useSubscriptionAccess';

/**
 * Pasek trybu dokończenia — widoczny na każdym ekranie warsztatu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO LICZNIK DNI, A NIE SAMA DATA
 * ═══════════════════════════════════════════════════════════════════════════
 * „Do 27 sierpnia" wymaga od czytającego policzenia, ile to jest. „Zostały
 * 3 dni" nie wymaga niczego. Data zostaje obok, bo przy planowaniu pracy
 * potrzebna jest konkretna — ale pierwsza jest liczba.
 *
 * Pasek NIE JEST do zamknięcia. Nie z uporu: to jedyne miejsce, w którym
 * klient widzi, ile mu zostało. Zamknięty raz zniknąłby do końca okresu,
 * a wtedy blokada przyszłaby bez uprzedzenia — czyli dokładnie to, czemu
 * cały ten tryb ma zapobiegać.
 */

const TRESC = {
  trial: {
    tytul: 'Okres próbny zakończony',
    co: 'Możesz dokończyć rozpoczęte zlecenia. Nie założysz nowego ani nie zmienisz w istniejącym klienta i pojazdu.',
    cta: 'Wybierz plan',
  },
  platnosc: {
    tytul: 'Płatność nie przeszła',
    co: 'Możesz dokończyć rozpoczęte zlecenia. Nie założysz nowego ani nie zmienisz w istniejącym klienta i pojazdu.',
    cta: 'Opłać abonament',
  },
} as const;

function licznik(dni: number | null): string {
  if (dni === null) return '';
  if (dni <= 0) return 'To ostatnie godziny';
  if (dni === 1) return 'Został 1 dzień';
  if (dni < 5) return `Zostały ${dni} dni`;
  return `Zostało ${dni} dni`;
}

export function PasekDokanczania({ dostep }: { dostep: DostepWarsztatu }) {
  const navigate = useNavigate();
  const { plans } = usePublicPricing();

  if (dostep.stan !== 'dokanczanie') return null;

  // Najtańszy plan warsztatowy z ceną — do zapłaty jednorazowej. Wybór planu
  // zostaje przy kliencie (przycisk obok prowadzi do cennika); tu chodzi o to,
  // żeby ktoś bez karty miał czym zapłacić OD RAZU, nie po trzech ekranach.
  const plan = plans
    .filter((p) => p.product_line === 'warsztat' && !p.is_custom && Number(p.price_net) > 0)
    .sort((a, b) => Number(a.price_net) - Number(b.price_net))[0];

  const t = TRESC[dostep.powod === 'platnosc' ? 'platnosc' : 'trial'];
  const data = dostep.dokanczanieDo
    ? new Date(dostep.dokanczanieDo).toLocaleDateString('pl-PL', {
        day: 'numeric', month: 'long',
      })
    : null;

  return (
    <div className="w-full border-b border-destructive/30 bg-destructive/10">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">
              {t.tytul}. {licznik(dostep.dniDoBloku)}
              {data ? ` — do ${data}` : ''}.
            </p>
            <p className="text-muted-foreground">
              {t.co} Potem dostęp zostanie wstrzymany, a dane pozostaną nietknięte.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-auto">
          {/* Prowadzi do cennika, nie kupuje od razu: wybór planu należy do
              klienta, a przycisk kupujący „coś" byłby pułapką. */}
          <Button size="sm" onClick={() => navigate('/cennik')}>
            {t.cta}
          </Button>

          {/* Droga bez karty, obok — nie zamiast. */}
          {plan && (
            <KupMiesiacBlik
              planCode={plan.code}
              etykieta="BLIK-iem za miesiąc"
              wariant="secondary"
              klasa="h-9 px-3 text-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
