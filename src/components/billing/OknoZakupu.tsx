import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, CreditCard, Smartphone, ArrowLeft } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOdswiezJednostki } from '@/hooks/useDostepneJednostki';
import { useSubscriptionDetails } from '@/hooks/useSubscriptionDetails';
import { Checkbox } from '@/components/ui/checkbox';
import { DaneDoFaktury } from './DaneDoFaktury';
import { usePublicPricing, type PublicPlan } from '@/hooks/usePublicPricing';
import { useCenaOkresu, zl, type Okres } from '@/hooks/useCenaOkresu';
import { zapamietajZamowienie, czekajNaWydanie, LIMIT_KARTY_ZAKUPU_MS } from '@/lib/doladowanie';
import { KOD_BRAK_DANYCH_NABYWCY, odczytajOdmowe } from '@/lib/odmowaZakupu';
import { zglos } from '@/lib/zdarzenia';
import { ciasteczkaDoZamowienia } from '@/lib/ciasteczkaMeta';

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
  /**
   * Krok, od którego okno ma się otworzyć. Używa tego odmowa
   * `BRAK_DANYCH_NABYWCY`: klient wraca prosto do formularza, którego mu
   * zabrakło, a nie na początek wyboru planu, który już przeszedł.
   */
  zacznijOd?: Krok;
}

/**
 * Kolejność kroków. „dane" stoi PRZED zapłatą świadomie: faktury z pustym
 * nabywcą nie da się poprawić edycją, a moment przed zapłatą jest najtańszy
 * w całym procesie na zapytanie o dane. Ale pokazujemy ten krok WYŁĄCZNIE
 * wtedy, gdy czegoś brakuje — patrz `krokPoDanych`.
 *
 * OSOBNY KROK „METODA" ZNIKNĄŁ (13.09.2026). Był ekranem z dwoma kafelkami,
 * z których KAŻDY prowadził w to samo miejsce — prawdziwy wybór i tak dział
 * się niżej, na przyciskach „Zapłać BLIK-iem" / „Zapłać kartą". Klikaliśmy
 * więc tę samą decyzję dwa razy. Zostało: wybór pakietu → ekran z kwotą
 * i dwoma przyciskami → bramka.
 */
type Krok = 'plan' | 'okres' | 'dane' | 'podsumowanie';

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
  const [pytamOFree, setPytamOFree] = useState(false);
  const [rozumiemFree, setRozumiemFree] = useState(false);

  // Warsztat rozwiązujemy sami, gdy wołający go nie podał — plakietka otwiera
  // okno bez niego, a bez warsztatu nie wiemy, jaki plan klient MA, więc nie
  // umielibyśmy ani podświetlić jego kafelka, ani powiedzieć, co traci.
  const { data: mojWarsztat } = useQuery({
    queryKey: ['warsztat-do-zakupu'],
    enabled: otwarte && !zadanie.providerId,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return null;
      const { data } = await supabase
        .from('service_providers').select('id').eq('user_id', u.user.id)
        .order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data?.id ?? null;
    },
  });
  const providerId = zadanie.providerId ?? mojWarsztat ?? null;
  const { data: szczegoly } = useSubscriptionDetails(providerId);
  const obecnyKod = szczegoly?.kodPlanu ?? null;

  /**
   * FORMULARZ FAKTURY POKAZUJEMY TYLKO WTEDY, GDY CZEGOŚ BRAKUJE.
   *
   * Warsztat z wypełnioną kartoteką (nazwa, NIP, adres) i tak musiał
   * przeklikać ekran „Dane do faktury" i potwierdzić „To się zgadza".
   * Ekran, który przy poprawnych danych nie ma o co zapytać, jest przeszkodą,
   * nie zabezpieczeniem — a w ścieżce zakupu każda przeszkoda kosztuje.
   *
   * Pytamy tę samą funkcję, która strzeże zakupu po stronie serwera
   * (`billing_dane_nabywcy_kompletne`), więc pominięcie kroku nie może
   * rozminąć się z tym, co zaraz sprawdzi `billing-checkout`. Gdy odpowiedź
   * jeszcze nie doszła albo brzmi „nie", pokazujemy formularz.
   */
  const { data: daneKompletne } = useQuery({
    queryKey: ['dane-nabywcy-kompletne', providerId],
    enabled: otwarte && !!providerId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('billing_dane_nabywcy_kompletne', { p_provider_id: providerId });
      if (error) return false;
      return data === true;
    },
  });

  /** Dokąd po wyborze planu i okresu: do formularza czy prosto do zapłaty. */
  const krokPoDanych = (): Krok => (daneKompletne === true ? 'podsumowanie' : 'dane');

  /**
   * Odpowiedź o kompletność danych bywa wolniejsza niż otwarcie okna. Gdy
   * przyjdzie już po tym, jak stanęliśmy na formularzu, i mówi „komplet" —
   * przechodzimy dalej sami. Formularz przy kompletnych danych i tak nie ma
   * o co zapytać; jego jedyną treścią byłby przycisk „To się zgadza".
   */
  useEffect(() => {
    if (krok === 'dane' && daneKompletne === true) setKrok('podsumowanie');
  }, [krok, daneKompletne]);

  // Wejście z kafelka cennika ma pominąć krok, który klient już wykonał.
  useEffect(() => {
    if (!otwarte) return;
    setPlan(zadanie.planCode ?? null);

    /**
     * PLAN BEZ CENY ROCZNEJ NIE MA O CO PYTAĆ.
     *
     * Pakiety agenta są wyłącznie miesięczne. Pytanie „na jak długo" przy
     * jednej możliwej odpowiedzi to ekran do przeklikania, a domyślny „rok"
     * kazałby serwerowi szukać ceny rocznej, której w Stripe nie ma.
     *
     * Reguła z DANYCH, nie z nazwy linii — następny produkt bez abonamentu
     * rocznego zadziała bez zmiany w kodzie.
     */
    const planWejscia = zadanie.planCode
      ? plans.find((p) => p.code === zadanie.planCode)
      : undefined;
    const rocznyMozliwy = planWejscia?.ma_cene_roczna !== false;

    setOkres(zadanie.okres ?? (rocznyMozliwy ? 'rok' : 'miesiac'));
    // `zacznijOd` wygrywa, ale tylko gdy plan jest znany — inaczej okno stanęłoby
    // na formularzu faktury dla zakupu, o którym jeszcze nie wiadomo, czego dotyczy.
    setKrok(
      zadanie.zacznijOd && zadanie.planCode ? zadanie.zacznijOd
        : zadanie.planCode ? (rocznyMozliwy ? 'okres' : krokPoDanych())
        : 'plan',
    );
    setWysylka(null);
    // `plans` w zależnościach: przy pierwszym otwarciu cennik bywa jeszcze
    // w locie, a od niego zależy, czy pytamy o okres.
  }, [otwarte, zadanie.planCode, zadanie.okres, zadanie.zacznijOd, plans]);

  /**
   * 🔴 OKNO ZNAŁO TYLKO JEDNĄ LINIĘ PRODUKTOWĄ (naprawione 13.09.2026).
   *
   * Stało tu `filter(p => p.product_line === 'warsztat')`, a `wybranyPlan`
   * szukał w tej liście. Dla pakietu Agent wychodziło `undefined`: okno
   * otwierało się na kroku „okres", rysowało nagłówek „Na jak długo" i ANI
   * JEDNEJ opcji pod nim, bo cała zawartość kroku stoi pod `wybranyPlan &&`.
   * Ślepa uliczka — do `billing-checkout` nie docierało nic, bez błędu
   * w konsoli i bez komunikatu.
   *
   * Lista do wyboru (krok „plan") pokazuje linię warsztatową, bo to jest
   * cennik, z którego klient wybiera. Ale gdy plan JEST ZNANY z wejścia,
   * szukamy go wśród wszystkich — inaczej każda nowa linia trafi na tę samą
   * ścianę.
   */
  const doKupienia = plans
    .filter((p) => p.product_line === 'warsztat')
    .sort((a, b) => a.sort_order - b.sort_order);

  const { cena, ladowanie, blad: bladCeny } = useCenaOkresu(plan, zadanie.providerId, okres);

  /**
   * ODMOWA W JEDNYM MIEJSCU DLA OBU METOD PŁATNOŚCI.
   *
   * BLIK idzie przez `billing-payu-order`, karta przez `billing-checkout`,
   * a obie odmawiają tak samo, kodem 409. Rozdzielona obsługa znaczyłaby, że
   * następna poprawka trafia do jednej z nich — i klient płacący drugą drogą
   * dalej widzi surowy błąd.
   *
   * `BRAK_DANYCH_NABYWCY` nie jest tu spodziewany, bo krok „Dane do faktury"
   * stoi przed metodą płatności. Jeżeli mimo to przyjdzie, znaczy to, że dane
   * przestały być kompletne między krokiem a zapłatą (druga karta, zmiana
   * w ustawieniach) — wtedy cofamy do formularza, zamiast zostawiać klienta
   * na podsumowaniu z komunikatem, którego nie ma jak spełnić.
   */
  const pokazOdmowe = async (error: unknown, data: any) => {
    const odmowa = await odczytajOdmowe(error, data);
    if (odmowa.kod === KOD_BRAK_DANYCH_NABYWCY) {
      toast.error('Uzupełnij dane do faktury, żeby dokończyć zakup.');
      setKrok('dane');
      return;
    }
    toast.error(odmowa.komunikat);
  };

  const zaplacBlik = async () => {
    if (!plan || wysylka) return;
    const karta = window.open('', '_blank');
    setWysylka('blik');
    try {
      const { data, error } = await supabase.functions.invoke('billing-payu-order', {
        // Ciasteczka piksela lecą RAZEM z zamówieniem, bo przy wydaniu paczki
        // przeglądarki może już nie być — a wtedy Conversions API nie miałoby
        // czego dopasować. Puste = nie było zgody marketingowej (patrz
        // supabase/functions/meta-capi/index.ts).
        body: { plan_code: plan, okres, ...ciasteczkaDoZamowienia() },
      });
      if (error || data?.error) { karta?.close(); await pokazOdmowe(error, data); return; }
      if (!data?.url) throw new Error('Nie udało się rozpocząć płatności.');
      // Wejście na bramkę operatora — dopiero TU, po potwierdzeniu adresu.
      // Samo otwarcie okna zakupu to jeszcze nie zamiar zapłaty.
      zglos('start_zakupu', { nazwa: `${plan} · ${okres}` });
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

  /**
   * Odpowiedź bez adresu bramki. Cztery możliwe zdania, bo klient ma się
   * dowiedzieć, CO się właśnie stało — a nie „zapisano zmiany".
   */
  const pokazZmiane = (data: any) => {
    const nazwa = data.nazwa_planu ?? data.plan;
    if (data.zmiana === 'natychmiast') {
      toast.success(`Plan zmieniony na ${nazwa}. Działa od teraz.`);
    } else if (data.zmiana === 'wycofana') {
      toast.success(`Zostajesz na planie ${nazwa}. Zaplanowana zmiana została odwołana i nic nie płacisz.`);
    } else if (data.zmiana === 'anulowana') {
      toast.success(
        data.obowiazuje_od
          ? `Subskrypcja anulowana. Działasz na obecnym planie do ${dniaSlownie(data.obowiazuje_od)}, potem przechodzisz na plan darmowy.`
          : 'Subskrypcja anulowana. Działasz na obecnym planie do końca opłaconego okresu.',
      );
    } else {
      toast.success(
        data.obowiazuje_od
          ? `Plan zmieni się na ${nazwa} ${dniaSlownie(data.obowiazuje_od)}. Do tego czasu działasz na obecnym — masz go opłacony.`
          : `Plan zmieni się na ${nazwa} przy najbliższym odnowieniu.`,
      );
    }
    // Plakietka przy nazwie firmy czyta subskrypcję osobnym zapytaniem —
    // bez unieważnienia pokazywałaby stary plan aż do odświeżenia strony.
    qc.invalidateQueries({ queryKey: ['subscription-details'] });
    odswiezJednostki();
    onOpenChange(false);
  };

  /** Wybór planu darmowego — po potwierdzeniu w okienku ostrzegawczym. */
  const przejdzNaFree = async () => {
    if (wysylka) return;
    setWysylka('karta');
    try {
      const { data, error } = await supabase.functions.invoke('billing-checkout', {
        body: { plan_code: 'warsztat_free', okres: 'miesiac' },
      });
      if (error || data?.error) { await pokazOdmowe(error, data); return; }
      setPytamOFree(false);
      setRozumiemFree(false);
      pokazZmiane(data ?? { zmiana: 'anulowana', plan: 'warsztat_free' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się anulować subskrypcji.');
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
      if (error || data?.error) { karta?.close(); await pokazOdmowe(error, data); return; }

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
        pokazZmiane(data);
        return;
      }

      if (!data?.url) throw new Error('Nie udało się rozpocząć płatności.');
      // Wejście na bramkę operatora — dopiero TU, po potwierdzeniu adresu.
      // Samo otwarcie okna zakupu to jeszcze nie zamiar zapłaty.
      zglos('start_zakupu', { nazwa: `${plan} · ${okres}` });
      if (karta) karta.location.href = data.url; else window.location.href = data.url;
      onOpenChange(false);
    } catch (e) {
      karta?.close();
      toast.error(e instanceof Error ? e.message : 'Nie udało się rozpocząć płatności.');
    } finally {
      setWysylka(null);
    }
  };

  const wybranyPlan: PublicPlan | undefined =
    plans.find((p) => p.code === plan) ?? doKupienia.find((p) => p.code === plan);

  // Co dokładnie znika po przejściu na plan darmowy. Liczone z macierzy funkcji,
  // nie wypisane w kodzie — lista wypisana zestarzałaby się przy pierwszej
  // zmianie zakresu planu, a klient dostałby ostrzeżenie mijające się z prawdą.
  /**
   * Czego ten plan NIE MA względem najbogatszego planu w tej samej linii.
   *
   * ═══════════════════════════════════════════════════════════════════════
   * PO CO — KLIENT W OKRESIE PRÓBNYM PRACUJE NA PRO
   * ═══════════════════════════════════════════════════════════════════════
   * `trial_warsztat` ma dokładnie te same cechy co Pro. Warsztat testuje więc
   * pełny zakres, kupuje Standard i dowiaduje się o brakujących funkcjach
   * DOPIERO PO ZAKUPIE — w chwili, gdy któraś przestaje działać. To jest
   * najgorszy możliwy moment na tę wiadomość.
   *
   * Porównujemy z NAJBOGATSZYM planem linii, nie z planem klienta. Dwa powody:
   * plan próbny jest nieaktywny, więc RLS w ogóle nie wpuszcza go do `plans`
   * (nie da się z nim porównać), a „czego nie ma względem Pro" jest zdaniem
   * prawdziwym dla każdego — i dla testującego, i dla kupującego pierwszy raz.
   *
   * Zbiór cech idzie z bazy przez `usePublicPricing`, więc lista zmienia się
   * razem z cennikiem. Nic tu nie jest wypisane z ręki.
   */
  const czegoBrakuje = (p: PublicPlan): string[] => {
    const najbogatszy = doKupienia
      .filter((k) => !k.is_custom)
      .reduce<PublicPlan | null>((a, b) => (!a || b.features.length > a.features.length ? b : a), null);
    if (!najbogatszy || najbogatszy.code === p.code) return [];
    const ma = new Set(p.features);
    return najbogatszy.features.filter((f) => !ma.has(f));
  };

  const traconeFunkcje: string[] = (() => {
    const obecny = plans.find((p) => p.code === obecnyKod);
    const free = plans.find((p) => Number(p.price_net) === 0 && !p.is_custom);
    if (!obecny || !free) return [];
    const wFree = new Set(free.features);
    return obecny.features.filter((f) => !wFree.has(f));
  })();

  return (
    <>
    <Dialog open={otwarte} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {krok === 'plan' && 'Wybierz plan'}
            {krok === 'okres' && 'Na jak długo'}
            {krok === 'dane' && 'Dane do faktury'}
            {krok === 'podsumowanie' && 'Sprawdź i zapłać'}
          </DialogTitle>
          <DialogDescription>
            {krok === 'plan' && 'Możesz zmienić plan później, w każdej chwili.'}
            {krok === 'okres' && 'Przy roku dwa miesiące są gratis.'}
            {krok === 'dane' && 'Wystawimy na nie fakturę — poprawienie jej później wymaga korekty.'}
            {krok === 'podsumowanie' && 'Kwotę wylicza serwer w chwili zakupu.'}
          </DialogDescription>
        </DialogHeader>

        {krok === 'dane' && (
          <DaneDoFaktury
            providerId={providerId}
            onGotowe={() => setKrok('podsumowanie')}
            onWstecz={() => setKrok(wybranyPlan?.ma_cene_roczna === false ? 'plan' : 'okres')}
          />
        )}

        {/* ── KROK 1: PLAN ─────────────────────────────────────────── */}
        {krok === 'plan' && (
          <div className="space-y-3">
            {/*
              PRZEŁĄCZNIK OKRESU NAD KAFELKAMI, nie na osobnym ekranie.
              Klient po wygaśnięciu ma w jednym miejscu zobaczyć, co może kupić
              i ile to kosztuje przy roku — to jest moment, w którym rabat roczny
              w ogóle ma szansę zadziałać. Pokazujemy go tylko wtedy, gdy jest
              z czego wybierać (pakiety agenta są wyłącznie miesięczne).

              Kwoty rocznej NIE liczymy tutaj. Rabat („dwa miesiące gratis")
              mieszka w `billing_cena_okresu` po stronie bazy i ma tam zostać
              jeden — przemnożenie ceny przez dziesięć w kafelku byłoby drugą
              kopią tej reguły. Dokładną kwotę wylicza serwer i pokazuje ją
              ekran „Sprawdź i zapłać".
            */}
            {doKupienia.some((p) => p.ma_cene_roczna !== false) && (
              <div className="flex items-center justify-center gap-1 rounded-lg border bg-muted/40 p-1">
                {(['miesiac', 'rok'] as Okres[]).map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOkres(o)}
                    className={
                      'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ' +
                      (okres === o ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')
                    }
                  >
                    {o === 'rok' ? 'Rok' : 'Miesiąc'}
                    {o === 'rok' && <span className="ml-2 text-xs font-normal text-primary">2 miesiące gratis</span>}
                  </button>
                ))}
              </div>
            )}
          <div className="grid gap-3 sm:grid-cols-2">
            {doKupienia.map((p) => {
              const darmowy = Number(p.price_net) === 0 && !p.is_custom;
              // Plan darmowy JEST wybieralny — po drodze staje okienko
              // z ostrzeżeniem. Wcześniej był wyszarzony z podpisem
              // „Nie wymaga płatności", co dla klienta po wygaśnięciu
              // wyglądało jak podpowiedź, żeby tam uciec.
              const kupowalny = KUPOWALNE.includes(p.code) || darmowy;
              const toTwoj = obecnyKod === p.code;
              return (
                <button
                  key={p.code}
                  type="button"
                  disabled={!kupowalny}
                  onClick={() => {
                    if (darmowy) { setRozumiemFree(false); setPytamOFree(true); return; }
                    setPlan(p.code);
                    /**
                     * Okres jest już wybrany przełącznikiem nad kafelkami, więc
                     * osobny ekran „Na jak długo" nie ma o co pytać. Plan bez
                     * ceny rocznej wymusza miesiąc — inaczej serwer szukałby
                     * w Stripe ceny, której tam nie ma.
                     */
                    if (p.ma_cene_roczna === false) setOkres('miesiac');
                    setKrok(krokPoDanych());
                  }}
                  className={
                    'rounded-xl border p-4 text-left transition ' +
                    (kupowalny ? 'hover:border-primary hover:bg-primary/5' : 'opacity-60') +
                    (plan === p.code || toTwoj ? ' border-primary bg-primary/5' : ' border-border')
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{p.name}</span>
                    {toTwoj
                      ? <Badge variant="secondary">Twój plan</Badge>
                      : plan === p.code && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
                  <CenaNaKafelku plan={p} okres={okres} providerId={zadanie.providerId} />
                  {(() => {
                    const brakuje = czegoBrakuje(p);
                    if (!brakuje.length) return null;
                    // Trzy nazwy i liczba reszty. Pełna lista czeka na ekranie
                    // zapłaty — osiem pozycji na kafelku zamieniłoby wybór planu
                    // w czytanie listy strat.
                    const widoczne = brakuje.slice(0, 3).join(', ');
                    const reszta = brakuje.length - 3;
                    return (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Bez: {widoczne}{reszta > 0 ? ` i ${reszta} innych` : ''}
                      </p>
                    );
                  })()}
                  {!kupowalny && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Napisz do nas — dobierzemy zakres.
                    </p>
                  )}
                  {darmowy && !toTwoj && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Wybranie anuluje Twój abonament.
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          </div>
        )}

        {/* ── KROK 2: OKRES ─── zostaje dla wejść z `zacznijOd` ────── */}
        {krok === 'okres' && wybranyPlan && (
          <div className="space-y-3">
            {(['rok', 'miesiac'] as Okres[]).map((o) => (
              <WyborOkresu
                key={o}
                okres={o}
                planCode={wybranyPlan.code}
                providerId={zadanie.providerId}
                zaznaczony={okres === o}
                onWybierz={() => { setOkres(o); setKrok(krokPoDanych()); }}
              />
            ))}
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

            {/* BEZ CENY NIE MA PRZYCISKÓW — jest ZDANIE.
                Dwa wyszarzone przyciski wyglądają jak gotowy ekran i nie mówią
                nic. Tak właśnie pękł zakup agenta: baza przestała wyceniać
                pakiet, okno wyłączyło płatność i zamilkło. */}
            {!ladowanie && !cena && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {bladCeny?.message
                  ?? 'Nie udało się wyliczyć ceny tego pakietu. To nasza usterka — napisz do nas, a poprawimy.'}
              </p>
            )}

            {/* Pełna lista braków TU, a nie na kafelku: to jest ostatni ekran
                przed pieniędzmi i jedyne miejsce, w którym jest na nią miejsce.
                Klient w okresie próbnym pracuje na Pro — ma się dowiedzieć
                PRZED zapłatą, nie po pierwszym „ta funkcja wymaga planu Pro". */}
            {/* ═══════════════════════════════════════════════════════════════
                TYLKO W LINII WARSZTATOWEJ (14.09.2026)
                ═══════════════════════════════════════════════════════════════
                Lista braków porównuje plan z najwyższym planem WARSZTATOWYM.
                W ścieżce agenta znaczyło to piętnaście pozycji o bazie klientów,
                zleceniach, fakturach, KSeF i magazynie — czyli o module, którego
                klient w ogóle nie kupuje. Zamiast powiedzieć mu, co dostaje,
                ekran przed zapłatą wyliczał, czego NIE dostaje, i to z zupełnie
                innego produktu.

                Porównanie ma sens wyłącznie wewnątrz jednej linii: Standard
                kontra Pro. Między liniami nie ma czego porównywać. */}
            {wybranyPlan?.product_line === 'warsztat' && czegoBrakuje(wybranyPlan).length > 0 && (
              <details className="rounded-lg border border-border bg-muted/40 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Czego nie ma w tym planie ({czegoBrakuje(wybranyPlan).length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {czegoBrakuje(wybranyPlan).map((f) => <li key={f}>• {f}</li>)}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Te funkcje są w wyższym planie. Plan zmienisz w każdej chwili.
                </p>
              </details>
            )}

            {/* RÓŻNICA MIĘDZY METODAMI STOI PRZY PRZYCISKACH, nie na osobnym
                ekranie. Klient czyta ją w chwili wyboru, a nie krok wcześniej. */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Button className="w-full" onClick={zaplacBlik} disabled={!!wysylka || !cena}>
                  {wysylka === 'blik'
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Smartphone className="mr-2 h-4 w-4" />}
                  Zapłać BLIK-iem
                </Button>
                <p className="text-xs text-muted-foreground">
                  Płacisz raz. Przed końcem okresu przypomnimy o kolejnej płatności.
                </p>
              </div>
              <div className="space-y-1.5">
                <Button className="w-full" variant="outline" onClick={zaplacKarta} disabled={!!wysylka || !cena}>
                  {wysylka === 'karta'
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <CreditCard className="mr-2 h-4 w-4" />}
                  Zapłać kartą
                </Button>
                <p className="text-xs text-muted-foreground">
                  Odnawiamy automatycznie. Możesz anulować w każdej chwili.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Krok „dane" ma własny przycisk wstecz w środku formularza —
            drugi na dole prowadziłby do tego samego, ale wyglądał na inny. */}
        {krok !== 'plan' && krok !== 'dane' && (
          <button
            type="button"
            onClick={() => setKrok(
              krok === 'podsumowanie'&&daneKompletne !== true ? 'dane' : wybranyPlan?.ma_cene_roczna === false ? 'plan' : 'okres',
            )}
            className="mt-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Wstecz
          </button>
        )}
      </DialogContent>
    </Dialog>

    {/* ── OSTRZEŻENIE PRZED PLANEM DARMOWYM ─────────────────────────
        Osobne okno, nie kolejny krok tego samego. To nie jest zakup —
        to rezygnacja, i ma wyglądać inaczej niż wybór planu.            */}
    <Dialog open={pytamOFree} onOpenChange={(o) => { setPytamOFree(o); if (!o) setRozumiemFree(false); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Anulujesz subskrypcję</DialogTitle>
          <DialogDescription>
            {szczegoly?.odnowienie
              ? `Do ${dniaSlownie(szczegoly.odnowienie)} wszystko działa jak dotąd — masz ten okres opłacony.`
              : 'Do końca opłaconego okresu wszystko działa jak dotąd.'}
          </DialogDescription>
        </DialogHeader>

        {traconeFunkcje.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              {szczegoly?.odnowienie ? `Od ${dniaSlownie(szczegoly.odnowienie)} stracisz:` : 'Potem stracisz:'}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {traconeFunkcje.map((f) => <li key={f}>• {f}</li>)}
            </ul>
          </div>
        )}

        {/* Klient ma wiedzieć TERAZ, że powrót nie będzie jednym kliknięciem.
            Dowiedzenie się o tym dopiero przy powrocie jest zaskoczeniem,
            które wygląda na sztuczkę. */}
        <p className="text-sm text-muted-foreground">
          Powrót na plan płatny będzie wymagał podania karty od nowa — anulowanej
          subskrypcji nie da się wznowić.
        </p>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={rozumiemFree}
            onCheckedChange={(v) => setRozumiemFree(v === true)}
            className="mt-0.5"
          />
          <span>Potwierdzam, że chcę anulować subskrypcję</span>
        </label>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setPytamOFree(false)}>
            Zostaję
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={!rozumiemFree || !!wysylka}
            onClick={przejdzNaFree}
          >
            {wysylka && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Anuluj subskrypcję
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
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
/**
 * Cena na kafelku planu — Z BAZY, dla wybranego okresu.
 *
 * 🔴 RABAT ROCZNY LICZY `billing_cena_okresu`, NIE TEN PLIK. Kuszące byłoby
 * pomnożyć cenę miesięczną przez dziesięć — i wtedy reguła „dwa miesiące
 * gratis" istniałaby w trzecim miejscu (baza, cennik, okno zakupu), a przy
 * pierwszej zmianie promocji dwa z nich pokazywałyby co innego niż kasa.
 *
 * Dlatego to jest OSOBNY komponent: `useCenaOkresu` to hak, a haka nie wolno
 * wywołać w pętli `map`. Ten sam wzorzec co `PlanCard` na `/cennik` — i to
 * jest powód, dla którego nie dokładam ceny rocznej do `usePublicPricing`:
 * mechanizm już istnieje i jest jeden.
 */
function CenaNaKafelku({ plan, okres, providerId }: {
  plan: PublicPlan;
  okres: Okres;
  providerId?: string | null;
}) {
  // Plan bez ceny rocznej wyceniamy miesięcznie, choćby przełącznik stał na roku.
  const okresPlanu: Okres = plan.ma_cene_roczna === false ? 'miesiac' : okres;
  const { cena } = useCenaOkresu(plan.is_custom ? null : plan.code, providerId ?? null, okresPlanu);
  const rok = okresPlanu === 'rok';

  if (plan.is_custom) return <p className="mt-2 text-sm font-medium">Wycena indywidualna</p>;
  if (Number(plan.price_net) === 0) return <p className="mt-2 text-sm font-medium">Za darmo</p>;

  // Dopóki baza nie odpowie, pokazujemy cenę miesięczną z cennika — pusty
  // kafelek wygląda jak plan bez ceny, czyli jak usterka.
  if (!cena) {
    return <p className="mt-2 text-sm font-medium">od {zl(Number(plan.price_net))} netto / mies.</p>;
  }

  return (
    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
      <span>{zl(cena.netto)}</span>
      <span className="text-muted-foreground">{rok ? 'netto / rok' : 'netto / mies.'}</span>
      {rok && cena.bezRabatuNetto > cena.netto && (
        <span className="text-muted-foreground line-through">{zl(cena.bezRabatuNetto)}</span>
      )}
      {plan.ma_cene_roczna === false && okres === 'rok' && (
        <span className="text-xs text-muted-foreground">(tylko miesięcznie)</span>
      )}
    </p>
  );
}

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
