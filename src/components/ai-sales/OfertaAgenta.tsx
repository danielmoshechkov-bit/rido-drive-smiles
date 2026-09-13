import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Phone, Loader2, Volume2 } from 'lucide-react';
import { usePublicPricing, usePubliczneDoladowania, type PublicPlan } from '@/hooks/usePublicPricing';
import { usePlanAction } from '@/hooks/usePlanAction';
import { formatMoneyPLN } from '@/utils/formatters';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Zakładka „Asystent głosowy" dla warsztatu BEZ PAKIETU — widok sprzedażowy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO OFERTA, A NIE ZABLOKOWANE POLA
 * ═══════════════════════════════════════════════════════════════════════════
 * Zablokowane pole mówi „nie możesz". Oferta mówi „oto co dostaniesz". To jest
 * pierwsza rzecz, jaką warsztat widzi po wejściu w tę zakładkę — i albo kupi,
 * albo zamknie. Ma zobaczyć produkt i cenę, nie zamknięte drzwi.
 *
 * Ceny, zawartość pakietów i wielkości doładowań idą Z CENNIKA W BAZIE — z tego
 * samego miejsca, co strona /warsztat-info i okno zakupu. Zmiana ceny w panelu
 * administratora wchodzi tu bez wdrożenia i nie ma jak się rozjechać z kasą.
 */

/** Próbka rozmowy — plik statyczny, nie synteza na żywo. */
const PROBKA = '/probka-agenta.mp3';

function KartaPakietu({ plan, wyrozniony, onKup }: {
  plan: PublicPlan;
  wyrozniony: boolean;
  onKup: (p: PublicPlan) => void;
}) {
  return (
    <Card className={wyrozniony ? 'border-primary shadow-lg relative' : 'relative'}>
      {wyrozniony && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Najczęściej wybierany</Badge>
      )}
      <CardContent className="pt-6 flex flex-col h-full">
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
        <Button className="w-full mt-5" variant={wyrozniony ? 'default' : 'outline'} onClick={() => onKup(plan)}>
          Kup {plan.name}
        </Button>
      </CardContent>
    </Card>
  );
}

export function OfertaAgenta() {
  const { plans, loading } = usePublicPricing();
  const { doladowanie } = usePubliczneDoladowania();
  const minuty = doladowanie('voice_minutes');
  const [gra, setGra] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Niezalogowanego tu nie ma — zakładka żyje wewnątrz panelu warsztatu.
  const { klik } = usePlanAction(() => {
    toast.error('Zaloguj się, żeby kupić pakiet.');
  });

  const pakiety = plans.filter((p) => p.product_line === 'agent' && !p.is_custom);

  const posluchaj = () => {
    if (!audioRef.current) audioRef.current = new Audio(PROBKA);
    setGra(true);
    audioRef.current.onended = () => setGra(false);
    audioRef.current.onerror = () => {
      setGra(false);
      toast.error('Próbka jest jeszcze nagrywana — odezwiemy się, gdy będzie gotowa.');
    };
    void audioRef.current.play().catch(() => setGra(false));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
          Agent odbiera połączenia 24 godziny na dobę, rozmawia z klientem po ludzku,
          umawia wizytę w Twoim terminarzu i zakłada zlecenie. Nie musisz zmieniać numeru
          ani niczego instalować — ustawiasz przekierowanie u swojego operatora i tyle.
        </p>
        <Button variant="outline" className="mt-5 gap-2" onClick={posluchaj} disabled={gra}>
          {gra ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
          Posłuchaj, jak brzmi
        </Button>
      </div>

      {pakiety.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {pakiety.map((p) => (
            <KartaPakietu key={p.code} plan={p} wyrozniony={p.code === 'agent'} onKup={klik} />
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Nie udało się wczytać cennika. Odśwież stronę albo napisz do nas — podamy ceny od ręki.
        </p>
      )}

      {minuty && (
        <div className="max-w-3xl mx-auto rounded-2xl border bg-card p-6">
          <h3 className="text-lg font-bold text-center mb-1">Gdy pakiet się skończy</h3>
          <p className="text-center text-sm text-muted-foreground mb-5">
            Agent nie przestaje odbierać z dnia na dzień — minuty dokupujesz w panelu,
            bez zmiany abonamentu.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[1, 2, 3].map((n) => {
              const ile = minuty.step * n;
              return (
                <div key={n} className="rounded-xl border bg-background px-4 py-4 text-center">
                  <div className="text-2xl font-extrabold">{ile} min</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {formatMoneyPLN(ile * Number(minuty.unit_price_net))} netto
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Po wykorzystaniu pakietu:{' '}
            <span className="font-semibold text-foreground">
              {formatMoneyPLN(Number(minuty.unit_price_net))} netto za minutę
            </span>.
          </p>
        </div>
      )}
    </div>
  );
}
