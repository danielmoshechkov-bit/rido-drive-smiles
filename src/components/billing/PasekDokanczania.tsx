import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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

  if (dostep.stan !== 'dokanczanie') return null;

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

        {/* Prowadzi do cennika, nie kupuje od razu: wybór planu należy do
            klienta, a przycisk kupujący „coś" byłby pułapką. */}
        <Button
          size="sm"
          onClick={() => navigate('/cennik')}
          className="shrink-0 self-start sm:self-auto"
        >
          {t.cta}
        </Button>
      </div>
    </div>
  );
}
