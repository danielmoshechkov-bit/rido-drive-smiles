import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Phone, Check, Loader2, Clock, CalendarCheck, MessageSquare,
  FileText, UserCheck, Headphones,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePublicPricing, usePubliczneDoladowania, type PublicPlan } from '@/hooks/usePublicPricing';
import { usePlanAction } from '@/hooks/usePlanAction';
import { odczytajBladFunkcji } from '@/utils/bladFunkcji';
import { formatMoneyPLN } from '@/utils/formatters';
import { toast } from 'sonner';

/**
 * Strona sprzedażowa wirtualnej asystentki — JEDNA treść, dwa wejścia.
 *
 * Publicznie stoi pod `/ai-agent`, a w panelu jest widokiem zakładki
 * „Asystent głosowy" dla warsztatu bez pakietu. Jeden komponent, bo dwie kopie
 * tej samej oferty rozjechałyby się przy pierwszej zmianie ceny.
 *
 * ZASADA JĘZYKA: piszemy o „wirtualnej asystentce" i „recepcji", nigdy
 * o „agencie głosowym". Klient ma rozumieć od razu, co kupuje, bez tłumaczenia
 * nazwy technicznej.
 *
 * Ceny i zawartość pakietów idą Z CENNIKA W BAZIE — z tego samego miejsca co
 * /warsztat-info i okno zakupu. Żadnej liczby wpisanej w kod.
 */

const CO_POTRAFI = [
  { ikona: Clock, tytul: 'Odbiera całą dobę', opis: 'Także w nocy, w weekend i wtedy, gdy jesteś pod autem albo przy kliencie.' },
  { ikona: UserCheck, tytul: 'Poznaje dzwoniącego', opis: 'Stały klient nie musi się przedstawiać — asystentka wie, czym jeździ i co było ostatnio.' },
  { ikona: CalendarCheck, tytul: 'Umawia w Twoim terminarzu', opis: 'Proponuje wolne godziny z Twojego kalendarza, nie wymyśla terminów.' },
  { ikona: FileText, tytul: 'Zakłada zlecenie', opis: 'Po rozmowie zlecenie czeka gotowe: klient, auto, opis usterki.' },
  { ikona: MessageSquare, tytul: 'Wysyła SMS z potwierdzeniem', opis: 'Klient dostaje termin na piśmie, a Ty mniej telefonów z pytaniem „o której?".' },
  { ikona: Headphones, tytul: 'Oddaje całą rozmowę', opis: 'Nagranie i transkrypcja przy zleceniu — wiesz, co dokładnie zostało ustalone.' },
];

const JAK_DZIALA = [
  { krok: '1', tytul: 'Wybierasz pakiet', opis: 'Płacisz kartą albo BLIK-iem. Numer techniczny dostajesz od ręki.' },
  { krok: '2', tytul: 'Ustawiasz przekierowanie', opis: 'U swojego operatora, jedną komendą. NIE ZMIENIASZ numeru firmowego — klienci dzwonią tam, gdzie zawsze.' },
  { krok: '3', tytul: 'Asystentka odbiera', opis: 'Od razu, po dwóch sygnałach. Rozmawia po polsku, angielsku, rosyjsku i ukraińsku.' },
  { krok: '4', tytul: 'Ty robisz swoje', opis: 'Wizyty lądują w terminarzu, zlecenia w panelu, a Ty nie odkładasz narzędzi.' },
];

const DLA_KOGO = [
  { tytul: 'Gdy masz ręce w robocie', opis: 'Warsztat, wulkanizacja, myjnia — telefon dzwoni dokładnie wtedy, gdy nie możesz go odebrać.' },
  { tytul: 'Gdy jesteś przy kliencie', opis: 'Gabinet, salon, zakład — przerwanie wizyty kosztuje więcej niż nieodebrany telefon.' },
  { tytul: 'Gdy jesteś w terenie', opis: 'Serwis, ekipa, wyjazd — asystentka umówi wizytę, zanim wrócisz do auta.' },
];

const PYTANIA = [
  { p: 'Czy muszę zmieniać numer firmowy?', o: 'Nie. Zostawiasz swój numer i ustawiasz na nim przekierowanie — asystentka odbiera pod numerem technicznym, którego klient nigdy nie widzi.' },
  { p: 'Co, gdy skończą się minuty?', o: 'Dokupujesz paczkę w panelu, bez zmiany abonamentu. Rozliczamy po stawce podanej przy pakiecie.' },
  { p: 'Czy klient pozna, że to nie człowiek?', o: 'Asystentka przedstawia się jako asystentka i mówi, że rozmowa jest rejestrowana. Nie udajemy człowieka — to wymóg prawa i zwykła uczciwość.' },
  { p: 'Co z nagrywaniem i RODO?', o: 'Rozmowa jest zapowiedziana na wstępie. Nagranie i transkrypcja są dostępne wyłącznie dla Ciebie, przy zleceniu, i kasują się razem z nim.' },
  { p: 'Jak szybko to uruchomię?', o: 'Numer dostajesz zaraz po opłaceniu. Cała reszta to ustawienie przekierowania u operatora — kwadrans.' },
];

/** Formularz kontaktu, po którym pokazuje się numer demonstracyjny. */
function Demo() {
  const [imie, setImie] = useState('');
  const [telefon, setTelefon] = useState('');
  const [zgodaDane, setZgodaDane] = useState(false);
  const [zgodaTelefon, setZgodaTelefon] = useState(false);
  const [wysylka, setWysylka] = useState(false);
  const [numer, setNumer] = useState<string | null>(null);

  const wyslij = async () => {
    setWysylka(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-demo-lead', {
        body: { imie, telefon, zgoda_dane: zgodaDane, zgoda_telefon: zgodaTelefon },
      });
      /**
       * 🔴 ZDANIE Z SERWERA NIE DOCHODZIŁO DO EKRANU (naprawione 13.09.2026).
       *
       * Stało tu `data?.message`, a `functions.invoke` przy KAŻDEJ odpowiedzi
       * spoza 2xx zostawia `data === null` — więc przy odmowie czytaliśmy pole
       * z pustki. `agent-demo-lead` odmawia gotową polszczyzną („Podaj numer
       * telefonu — dziewięć cyfr.", „Demo jest chwilowo niedostępne."), a
       * człowiek i tak widział jedno zdanie o niczym: „Sprawdź dane".
       *
       * Czyta to `odczytajBladFunkcji` — ta sama warstwa, co w całej aplikacji.
       * NIE `odczytajOdmowe`: tamta jest nadbudową dla ścieżki PŁATNOŚCI i jej
       * ostatecznym zdaniem jest „Nie udało się rozpocząć płatności", a tu nikt
       * niczego nie kupuje.
       */
      if (error || !data?.numer) {
        toast.error((await odczytajBladFunkcji(error)).komunikat);
        return;
      }
      setNumer(String(data.numer));
    } finally {
      setWysylka(false);
    }
  };

  if (numer) {
    return (
      <div className="rounded-2xl border-2 border-primary bg-primary/5 p-8 text-center">
        <p className="text-sm text-muted-foreground mb-2">Dzwoń — odbierze po dwóch sygnałach</p>
        <a href={`tel:+${numer}`} className="text-3xl md:text-4xl font-extrabold tracking-tight text-primary hover:underline">
          +{numer.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4')}
        </a>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          Umów wizytę tak, jak zrobiłby to Twój klient. Dostaniesz SMS z potwierdzeniem —
          dokładnie taki, jaki dostawaliby dzwoniący do Ciebie.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card p-6 md:p-8">
      <h3 className="text-xl font-bold text-center">Chcesz posłuchać, jak rozmawia?</h3>
      <p className="text-sm text-muted-foreground text-center mt-1 mb-6">
        Zostaw kontakt i zadzwoń pod numer demonstracyjny.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="demo-imie">Imię</Label>
          <Input id="demo-imie" value={imie} onChange={(e) => setImie(e.target.value)} placeholder="Jan" />
        </div>
        <div>
          <Label htmlFor="demo-tel">Telefon</Label>
          <Input id="demo-tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="600 100 200" inputMode="tel" />
        </div>
      </div>

      <p className="mt-5 text-xs text-muted-foreground leading-relaxed">
        Administratorem Twoich danych jest GETRIDO sp. z o.o., NIP 5223377431. Podajesz imię
        i numer telefonu, żebyśmy mogli skontaktować się z Tobą w sprawie wirtualnej asystentki AI.
        Dane przechowujemy przez 12 miesięcy od ostatniego kontaktu, a potem je usuwamy. Masz prawo
        dostępu do swoich danych, ich poprawienia i usunięcia, a zgodę możesz wycofać w każdej chwili,
        pisząc na kontakt@getrido.pl — wycofanie nie wpływa na to, co zrobiliśmy wcześniej.
      </p>

      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <Checkbox checked={zgodaDane} onCheckedChange={(v) => setZgodaDane(v === true)} className="mt-0.5" />
          <span>
            Zgadzam się, żeby GETRIDO sp. z o.o. przetwarzała moje imię i numer telefonu
            w celu kontaktu w sprawie wirtualnej asystentki AI.
          </span>
        </label>
        {/* OSOBNA zgoda — bez niej nie wolno oddzwonić. Zapisujemy ją razem
            z kontaktem, żeby nikt nie zadzwonił do kogoś, kto się nie zgodził. */}
        <label className="flex items-start gap-3 text-sm cursor-pointer">
          <Checkbox checked={zgodaTelefon} onCheckedChange={(v) => setZgodaTelefon(v === true)} className="mt-0.5" />
          <span>
            Zgadzam się na kontakt telefoniczny pod podanym numerem w sprawie oferty GETRIDO.
            Wiem, że mogę tę zgodę wycofać w każdej chwili.
          </span>
        </label>
      </div>

      <Button
        className="w-full mt-5"
        size="lg"
        disabled={wysylka || !zgodaDane || imie.trim().length < 2 || telefon.replace(/\D/g, '').length < 9}
        onClick={wyslij}
      >
        {wysylka ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Phone className="h-4 w-4 mr-2" />}
        Pokaż numer i zadzwoń
      </Button>
    </div>
  );
}

function KartaPakietu({ plan, wyrozniony, stawka, onKup }: {
  plan: PublicPlan; wyrozniony: boolean; stawka: number | null; onKup: (p: PublicPlan) => void;
}) {
  return (
    <Card className={`relative flex flex-col ${wyrozniony ? 'border-primary shadow-lg' : ''}`}>
      {wyrozniony && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Najczęściej wybierany</Badge>}
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
        {stawka != null && (
          <p className="mt-4 text-xs text-muted-foreground border-t pt-3">
            Po wykorzystaniu pakietu — {formatMoneyPLN(stawka)} netto za minutę.
          </p>
        )}
        <Button className="w-full mt-4" variant={wyrozniony ? 'default' : 'outline'} onClick={() => onKup(plan)}>
          Wybierz pakiet
        </Button>
      </CardContent>
    </Card>
  );
}

export function StronaAgenta({ wPanelu = false, onKup }: {
  wPanelu?: boolean;
  /** Panel przechwytuje zakup, żeby pokazać stan „przetwarzamy płatność". */
  onKup?: (p: PublicPlan) => void;
}) {
  const { plans, loading } = usePublicPricing();
  const { doladowanie } = usePubliczneDoladowania();
  const stawka = doladowanie('voice_minutes')?.unit_price_net ?? null;
  const pakiety = useMemo(() => plans.filter((p) => p.product_line === 'agent' && !p.is_custom), [plans]);
  const { klik } = usePlanAction(() => toast.error('Zaloguj się, żeby kupić pakiet.'));
  const kup = onKup ?? klik;

  return (
    <div className={wPanelu ? 'space-y-14' : 'space-y-20 pb-20'}>
      {/* HERO */}
      <section className={wPanelu ? '' : 'bg-gradient-to-br from-primary/5 via-purple-500/5 to-background pt-14 pb-12'}>
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <Badge variant="secondary" className="mb-4">Wirtualna asystentka</Badge>
          <h1 className={`font-extrabold tracking-tight ${wPanelu ? 'text-3xl' : 'text-4xl md:text-5xl'}`}>
            Wirtualna recepcja dla firm usługowych
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
            Odbiera telefon, gdy Ty pracujesz. Umawia wizytę w Twoim terminarzu, zakłada zlecenie
            i wysyła klientowi SMS z potwierdzeniem. Nie zmieniasz numeru i niczego nie instalujesz.
          </p>
        </div>
      </section>

      {/* DEMO — wysoko, bo to najmocniejszy argument */}
      <section className="container mx-auto px-4 max-w-2xl">
        <Demo />
      </section>

      {/* CO POTRAFI */}
      <section className="container mx-auto px-4">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-3">Co potrafi</Badge>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Rozmawia i robi, nie tylko notuje</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {CO_POTRAFI.map((f) => (
            <Card key={f.tytul}><CardContent className="pt-6">
              <f.ikona className="h-6 w-6 text-primary mb-3" />
              <div className="font-semibold mb-1">{f.tytul}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.opis}</p>
            </CardContent></Card>
          ))}
        </div>
      </section>

      {/* JAK TO DZIAŁA */}
      <section className={wPanelu ? '' : 'bg-muted/30 py-16'}>
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3">Jak to działa</Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Cztery kroki, kwadrans roboty</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 max-w-5xl mx-auto">
            {JAK_DZIALA.map((k) => (
              <div key={k.krok} className="text-center">
                <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold">
                  {k.krok}
                </div>
                <div className="font-semibold mb-1">{k.tytul}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{k.opis}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DLA KOGO */}
      <section className="container mx-auto px-4">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-3">Dla kogo</Badge>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Wszędzie, gdzie telefon dzwoni w czasie pracy</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {DLA_KOGO.map((d) => (
            <Card key={d.tytul}><CardContent className="pt-6">
              <div className="font-semibold mb-1">{d.tytul}</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{d.opis}</p>
            </CardContent></Card>
          ))}
        </div>
      </section>

      {/* PAKIETY */}
      <section className="container mx-auto px-4">
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-3">Cennik</Badge>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Dwa pakiety, bez ukrytych kosztów</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : pakiety.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {pakiety.map((p) => (
              <KartaPakietu
                key={p.code} plan={p} wyrozniony={p.code === 'agent'}
                stawka={stawka != null ? Number(stawka) : null} onKup={kup}
              />
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Nie udało się wczytać cennika. Odśwież stronę albo napisz do nas — podamy ceny od ręki.
          </p>
        )}
      </section>

      {/* FAQ */}
      <section className={wPanelu ? '' : 'bg-muted/30 py-16'}>
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-8">
            <Badge variant="secondary" className="mb-3">FAQ</Badge>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">Pytania, które padają najczęściej</h2>
          </div>
          <div className="space-y-3">
            {PYTANIA.map((q) => (
              <Card key={q.p}><CardContent className="pt-5">
                <div className="font-semibold mb-1">{q.p}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{q.o}</p>
              </CardContent></Card>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
