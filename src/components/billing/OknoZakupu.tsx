import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, CreditCard, Smartphone, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOdswiezJednostki } from '@/hooks/useDostepneJednostki';
import { usePublicPricing, type PublicPlan } from '@/hooks/usePublicPricing';
import { useCenaOkresu, zl, type Okres } from '@/hooks/useCenaOkresu';
import { zapamietajZamowienie, czekajNaWydanie, LIMIT_KARTY_ZAKUPU_MS } from '@/lib/doladowanie';

/**
 * Jedno okno dla wszystkich dróg zakupu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO JEDNO, A NIE PIĘĆ ŚCIEŻEK
 * ═══════════════════════════════════════════════════════════════════════════
 * Do zakupu prowadzi pięć miejsc: plakietka przy nazwie firmy, pasek trybu
 * dokończenia, ekran po twardym bloku, kafelek na cenniku i baner na pulpicie.
 * Każde z nich miało własną drogę — a przy pierwszej poprawce w płatnościach
 * rozjechałyby się między sobą i naprawialibyśmy to pięć razy.
 *
 * Tu jest jedna droga i cztery kroki: plan, okres, metoda, podsumowanie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CENA JEST TU TYLKO POKAZANA
 * ═══════════════════════════════════════════════════════════════════════════
 * Liczy ją baza (`billing_cena_okresu`), bo zależy od gwarancji ceny tego
 * warsztatu. Zakup liczy ją PONOWNIE po stronie serwera — okno nie wysyła
 * kwoty, tylko kod planu i okres. Inaczej dałoby się kupić rok za kwotę
 * z żądania.
 */

export interface ZadanieZakupu {
  /** Plan zaznaczony na wejściu — z kafelka cennika albo z planu klienta. */
  planCode?: string | null;
  okres?: Okres;
  providerId?: string | null;
}

type Krok = 'plan' | 'okres' | 'metoda' | 'podsumowanie';

const KUPOWALNE = ['warsztat_standard', 'warsztat_pro'];

/**
 * „22 września" zamiast „2026-09-22". Klient czyta zdanie, nie znacznik czasu,
 * a data w formacie bazy w środku zdania wygląda jak wyciek z systemu.
 */
function dniaSlownie(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'przy najbliższym odnowieniu';
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
}

export function OknoZakupu({
  otwarte, onOpenChange, zadanie,
}: {
  otwarte: boolean;
  onOpenChange: (o: boolean) => void;
  zadanie: ZadanieZakupu;
}) {
  const { plans } = usePublicPricing();
  const [krok, setKrok] = useState<Krok>('plan');
  const [plan, setPlan] = useState<string | null>(null);
  const [okres, setOkres] = useState<Okres>('rok');
  const [wysylka, setWysylka] = useState<'blik' | 'karta' | null>(null);
  const qc = useQueryClient();
  const odswiezJednostki = useOdswiezJednostki();

  // Wejście z kafelka cennika ma pominąć krok, który klient już wykonał.
  useEffect(() => {
    if (!otwarte) return;
    setPlan(zadanie.planCode ?? null);
    setOkres(zadanie.okres ?? 'rok');
    setKrok(zadanie.planCode ? 'okres' : 'plan');
    setWysylka(null);
  }, [otwarte, zadanie.planCode, zadanie.okres]);

  const doKupienia = plans
    .filter((p) => p.product_line === 'warsztat')
    .sort((a, b) => a.sort_order - b.sort_order);

  const { cena, ladowanie } = useCenaOkresu(plan, zadanie.providerId, okres);

  const zaplacBlik = async () => {
    if (!plan || wysylka) return;
    const karta = window.open('', '_blank');
    setWysylka('blik');
    try {
      const { data, error } = await supabase.functions.invoke('billing-payu-order', {
        body: { plan_code: plan, okres },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error('Nie udało się rozpocząć płatności.');
      if (karta) karta.location.href = data.url; else window.location.href = data.url;

      zapamietajZamowienie(data.order_id);
      void czekajNaWydanie({
        orderId: data.order_id,
        limitMs: LIMIT_KARTY_ZAKUPU_MS,
        // Po opłaceniu wraca pełny dostęp — panel musi to zobaczyć bez
        // przeładowania ręcznego, inaczej klient patrzy na blokadę, za którą
        // przed chwilą zapłacił.
        gdyWydane: () => window.location.reload(),
      });
      onOpenChange(false);
    } catch (e) {
      karta?.close();
      toast.error(e instanceof Error ? e.message : 'Nie udało się rozpocząć płatności.');
    } finally {
      setWysylka(null);
    }
  };

  const zaplacKarta = async () => {
    if (!plan || wysylka) return;
    const karta = window.open('', '_blank');
    setWysylka('karta');
    try {
      const { data, error } = await supabase.functions.invoke('billing-checkout', {
        body: { plan_code: plan, okres },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      /**
       * ZMIANA PLANU NIE PROWADZI DO BRAMKI.
       *
       * Warsztat z subskrypcją odnawianą kartą nie kupuje drugiej — podmienia
       * pozycję u operatora. Wejście w górę idzie od razu (operator pobiera
       * różnicę), zejście od następnego okresu. W obu przypadkach nie ma
       * dokąd przekierować, więc otwarta na zapas karta ma się zamknąć.
       */
      if (data?.zmiana) {
        karta?.close();
        if (data.zmiana === 'natychmiast') {
          toast.success(`Plan zmieniony na ${data.nazwa_planu ?? data.plan}. Działa od teraz.`);
        } else {
          toast.success(
            data.obowiazuje_od
              ? `Plan zmieni się na ${data.nazwa_planu ?? data.plan} ${dniaSlownie(data.obowiazuje_od)}. Do tego czasu działasz na obecnym — masz go opłacony.`
              : `Plan zmieni się na ${data.nazwa_planu ?? data.plan} przy najbliższym odnowieniu.`,
          );
        }
        // Plakietka przy nazwie firmy czyta subskrypcję osobnym zapytaniem —
        // bez unieważnienia pokazywałaby stary plan aż do odświeżenia strony.
        qc.invalidateQueries({ queryKey: ['subscription-details'] });
        odswiezJednostki();
        onOpenChange(false);
        return;
      }

      if (!data?.url) throw new Error('Nie udało się rozpocząć płatności.');
      if (karta) karta.location.href = data.url; else window.location.href = data.url;
      onOpenChange(false);
    } catch (e) {
      karta?.close();
      toast.error(e instanceof Error ? e.message : 'Nie udało się rozpocząć płatności.');
    } finally {
      setWysylka(null);
    }
  };

  const wybranyPlan: PublicPlan | undefined = doKupienia.find((p) => p.code === plan);

  return (
    <Dialog open={otwarte} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {krok === 'plan' && 'Wybierz plan'}
            {krok === 'okres' && 'Na jak długo'}
            {krok === 'metoda' && 'Jak chcesz zapłacić'}
            {krok === 'podsumowanie' && 'Sprawdź i zapłać'}
          </DialogTitle>
          <DialogDescription>
            {krok === 'plan' && 'Możesz zmienić plan później, w każdej chwili.'}
            {krok === 'okres' && 'Przy roku dwa miesiące są gratis.'}
            {krok === 'metoda' && 'Obie drogi są równorzędne — wybierz, co Ci wygodniej.'}
            {krok === 'podsumowanie' && 'Kwotę wylicza serwer w chwili zakupu.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── KROK 1: PLAN ─────────────────────────────────────────── */}
        {krok === 'plan' && (
          <div className="grid gap-3 sm:grid-cols-2">
            {doKupienia.map((p) => {
              const kupowalny = KUPOWALNE.includes(p.code);
              return (
                <button
                  key={p.code}
                  type="button"
                  disabled={!kupowalny}
                  onClick={() => { setPlan(p.code); setKrok('okres'); }}
                  className={
                    'rounded-xl border p-4 text-left transition ' +
                    (kupowalny ? 'hover:border-primary hover:bg-primary/5' : 'opacity-60') +
                    (plan === p.code ? ' border-primary bg-primary/5' : ' border-border')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.name}</span>
                    {plan === p.code && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <p className="mt-2 text-sm font-medium">
                    {/* Plan indywidualny i darmowy mówią, co dalej — zamiast
                        pokazywać przycisk płatności, który by odmówił. */}
                    {p.is_custom ? 'Wycena indywidualna' :
                      Number(p.price_net) === 0 ? 'Za darmo' :
                      `od ${zl(Number(p.price_net))} netto / mies.`}
                  </p>
                  {!kupowalny && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {p.is_custom ? 'Napisz do nas — dobierzemy zakres.' : 'Nie wymaga płatności.'}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── KROK 2: OKRES ────────────────────────────────────────── */}
        {krok === 'okres' && wybranyPlan && (
          <div className="space-y-3">
            {(['rok', 'miesiac'] as Okres[]).map((o) => (
              <WyborOkresu
                key={o}
                okres={o}
                planCode={wybranyPlan.code}
                providerId={zadanie.providerId}
                zaznaczony={okres === o}
                onWybierz={() => { setOkres(o); setKrok('metoda'); }}
              />
            ))}
          </div>
        )}

        {/* ── KROK 3: METODA ───────────────────────────────────────── */}
        {krok === 'metoda' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setKrok('podsumowanie')}
              className="rounded-xl border border-border p-4 text-left hover:border-primary hover:bg-primary/5"
            >
              <div className="flex items-center gap-2 font-semibold">
                <Smartphone className="h-4 w-4" /> BLIK
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Płacisz raz. Przed końcem okresu przypomnimy o kolejnej płatności.
              </p>
            </button>
            <button
              type="button"
              onClick={() => { setWysylka(null); setKrok('podsumowanie'); }}
              className="rounded-xl border border-border p-4 text-left hover:border-primary hover:bg-primary/5"
            >
              <div className="flex items-center gap-2 font-semibold">
                <CreditCard className="h-4 w-4" /> Karta
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Odnawiamy automatycznie. Możesz anulować w każdej chwili.
              </p>
            </button>
          </div>
        )}

        {/* ── KROK 4: PODSUMOWANIE ─────────────────────────────────── */}
        {krok === 'podsumowanie' && (
          <div className="space-y-4">
            {ladowanie && <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />}
            {cena && (
              <div className="rounded-xl border border-border p-4 text-sm">
                <Wiersz etykieta="Plan" wartosc={cena.nazwa} />
                <Wiersz etykieta="Okres" wartosc={cena.okres === 'rok' ? '12 miesięcy' : '1 miesiąc'} />
                <Wiersz etykieta="Netto" wartosc={zl(cena.netto)} />
                <Wiersz etykieta={`VAT ${cena.vat}%`} wartosc={zl(cena.brutto - cena.netto)} />
                <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Do zapłaty</span><span>{zl(cena.brutto)}</span>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Dostęp działa do{' '}
                  {new Date(Date.now() + cena.miesiecy * 30 * 86_400_000)
                    .toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' '}(orientacyjnie — dokładną datę wyliczymy po zaksięgowaniu wpłaty).
                </p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={zaplacBlik} disabled={!!wysylka || !cena}>
                {wysylka === 'blik' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Zapłać BLIK-iem
              </Button>
              <Button variant="outline" onClick={zaplacKarta} disabled={!!wysylka || !cena}>
                {wysylka === 'karta' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Zapłać kartą
              </Button>
            </div>
          </div>
        )}

        {krok !== 'plan' && (
          <button
            type="button"
            onClick={() => setKrok(krok === 'podsumowanie' ? 'metoda' : krok === 'metoda' ? 'okres' : 'plan')}
            className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Wstecz
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Wiersz({ etykieta, wartosc }: { etykieta: string; wartosc: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted-foreground">{etykieta}</span>
      <span>{wartosc}</span>
    </div>
  );
}

/** Karta okresu z ceną z bazy — także tu kwota nie jest liczona w przeglądarce. */
function WyborOkresu({
  okres, planCode, providerId, zaznaczony, onWybierz,
}: {
  okres: Okres; planCode: string; providerId: string | null | undefined;
  zaznaczony: boolean; onWybierz: () => void;
}) {
  const { cena } = useCenaOkresu(planCode, providerId, okres);
  const rok = okres === 'rok';

  return (
    <button
      type="button"
      onClick={onWybierz}
      className={
        'flex w-full items-center justify-between rounded-xl border p-4 text-left transition hover:border-primary hover:bg-primary/5 ' +
        (zaznaczony ? 'border-primary bg-primary/5' : 'border-border')
      }
    >
      <div>
        <div className="flex items-center gap-2 font-semibold">
          {rok ? 'Rok' : 'Miesiąc'}
          {rok && <Badge variant="secondary">2 miesiące gratis</Badge>}
        </div>
        {cena && (
          <p className="mt-1 text-sm text-muted-foreground">
            {rok && (
              <span className="mr-2 line-through">{zl(cena.bezRabatuNetto)}</span>
            )}
            <span className="font-medium text-foreground">{zl(cena.netto)}</span> netto
            {rok ? ' / rok' : ' / mies.'}
          </p>
        )}
      </div>
      {cena && <span className="text-sm text-muted-foreground">{zl(cena.brutto)} brutto</span>}
    </button>
  );
}
