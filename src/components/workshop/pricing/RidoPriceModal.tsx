import { useState, useEffect, useRef } from 'react';
import { toAutoDemo, wycenaDemo } from '@/lib/autoDemo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetRidoAI } from '@/hooks/useGetRidoAI';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sprawdzRidoAi, pobierzRidoAi, CECHA_RIDO_AI } from '@/lib/ridoAi';
import { useOdswiezJednostki } from '@/hooks/useDostepneJednostki';
import { matchPrices, serviceKeywords, isJunkService, priceCacheKey, cacheBuckets, type PriceRecord } from '@/lib/pricingSuggestions';

interface ServiceItem {
  name: string;
  currentPrice: number;
}

interface Suggestion {
  name: string;
  min: number;
  max: number;
  note: string | null;
  /** Skad wzielismy zakres — pokazujemy to warsztatowi wprost. */
  source?: 'history' | 'ai';
  /** Ile wycen zlozylo sie na zakres z historii. */
  count?: number;
  /** Konkretna stawka proponowana przez asystenta. */
  recommended?: number | null;
  /** Ocena ceny wpisanej przez warsztat: za nisko / w rynku / za wysoko. */
  verdict?: 'low' | 'ok' | 'high' | null;
  /** Zakres z historii jest echem jednej stawki — nie nadaje sie na podpowiedz. */
  degenerate?: boolean;
  own?: number;
  scope?: 'exact' | 'model' | 'brand' | 'any';
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  services: ServiceItem[];
  vehicle: { plate?: string; brand?: string; model?: string; year?: number; engine_capacity_cm3?: number; fuel_type?: string } | null;
  city?: string;
  voivodeship?: string;
  industry?: string;
  providerId?: string | null;
  priceMode: 'net' | 'gross';
  onApplySuggestions: (prices: { index: number; price: number }[]) => void;
  missingVehicleData?: boolean;
  onCompleteVehicleData?: () => void;
}

const VAT_RATE = 1.23;

const PL_PATTERNS = /(?:P\+L|P\/L|przód\s*\+\s*tył|lewy\s*\+\s*prawy|obie\s*strony|x2|2\s*strony|dwie\s*strony|L\+P)/i;

export function RidoPriceModal({
  open,
  onOpenChange,
  services,
  vehicle,
  city,
  voivodeship,
  industry = 'warsztat',
  providerId,
  priceMode: initialMode,
  onApplySuggestions,
  missingVehicleData = false,
  onCompleteVehicleData,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'net' | 'gross'>(initialMode);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [priceInputs, setPriceInputs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  // Widelki z historii sa natychmiast, opis od asystenta dochodzi chwile pozniej —
  // zamiast „Brak uwag" pokazujemy wtedy, ze jeszcze pracuje.
  const [opisWDrodze, setOpisWDrodze] = useState(false);
  // Wyniki z historii trzymamy w ref, bo korzysta z nich zapytanie do asystenta,
  // ktore startuje rownolegle — stan Reacta moglby jeszcze nie byc widoczny.
  const historiaRef = useRef<Record<number, { min: number; max: number; median: number; count: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const { execute } = useGetRidoAI();
  const odswiezJednostki = useOdswiezJednostki();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (!open) return;
    setPriceInputs(services.map(service => service.currentPrice > 0 ? String(service.currentPrice) : ''));
  }, [open, services]);

  const [hasFetched, setHasFetched] = useState(false);

  useEffect(() => {
    if (!open) {
      setHasFetched(false);
      return;
    }
    if (open && services.length > 0 && !hasFetched) {
      setHasFetched(true);
      fetchSuggestions();
    }
  }, [open, services]);

  // Re-fetch only when mode changes while open
  useEffect(() => {
    if (open && hasFetched && services.length > 0) {
      fetchSuggestions();
    }
  }, [mode]);

  /**
   * Kolejnosc ma znaczenie: NAJPIERW historia (wlasna + portalu), bo odpowiada
   * w ulamku sekundy i opiera sie na realnych cenach; AI leci ROWNOLEGLE i
   * uzupelnia to, czego w historii nie ma. Wczesniej bylo odwrotnie — okno
   * czekalo na model AI, stad "bardzo dlugo mysli".
   */
  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);

    // ZLECENIE POKAZOWE — widelki od reki.
    //
    // Prawdziwa wycena pyta historie i model AI: kilkanascie sekund czekania
    // i realny koszt. We wprowadzeniu chodzi o to, ZEBY ZOBACZYC, jak to
    // wyglada, wiec dla auta pokazowego podajemy zapisane liczby natychmiast.
    if (toAutoDemo(vehicle?.plate)) {
      const gotowe = services.map((s) => {
        const w = wycenaDemo(s.name);
        return w ? { name: s.name, min: w.min, max: w.max, note: w.note } : { name: s.name, min: 0, max: 0, note: null };
      });
      if (gotowe.some((g) => g.min > 0)) {
        setSuggestions(gotowe);
        setLoading(false);
        setOpisWDrodze(false);
        return;
      }
    }

    const historia = fetchHistorySuggestions()
      .then(wynik => {
        if (wynik.some(Boolean)) {
          setSuggestions(prev => scal(prev, wynik, services));
          setLoading(false);   // uzytkownik ma juz widelki, reszte dosyla AI
        }
        return wynik;
      })
      .catch(() => services.map(() => null));

    setOpisWDrodze(true);
    // Najpierw zapamietane odpowiedzi — sa natychmiast i za darmo. Do modelu
    // idzie potem tylko to, czego w pamieci nie bylo.
    const zPamieci = await fetchCachedSuggestions().catch(() => new Set<number>());
    const ai = fetchAISuggestions(zPamieci)
      .then(ok => ok)
      .catch(() => false)
      .finally(() => setOpisWDrodze(false));

    const [zHistorii, aiOk] = await Promise.all([historia, ai]);
    setLoading(false);

    if (!aiOk && !zHistorii.some(Boolean)) {
      setError(t('workshop.pricing.priceModal.suggestionUnavailable'));
    }
  };

  /** Scala nowe wyniki z juz pokazanymi — historia nie kasuje odpowiedzi AI i odwrotnie. */
  const scal = (poprzednie: Suggestion[], nowe: (Suggestion | null)[], lista: ServiceItem[]): Suggestion[] =>
    lista.map((s, i) => nowe[i] || poprzednie[i] || { name: s.name, min: 0, max: 0, note: null });

  /**
   * Zapamietane odpowiedzi asystenta dla tej samej uslugi i tego samego auta.
   * Zwraca indeksy pozycji, ktorych NIE trzeba juz pytac modelu.
   */
  const fetchCachedSuggestions = async (): Promise<Set<number>> => {
    const opisAuta = {
      brand: vehicle?.brand,
      model: vehicle?.model,
      engineCapacity: vehicle?.engine_capacity_cm3,
      year: vehicle?.year,
    };
    const klucze = services.map(s2 => priceCacheKey(s2.name, opisAuta, mode));
    if (klucze.length === 0) return new Set();

    const swiezosc = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
    const { data } = await (supabase as any)
      .from('ai_price_cache')
      .select('cache_key, min_price, max_price, recommended_price, note')
      .in('cache_key', klucze)
      .gte('created_at', swiezosc);

    const poKluczu = new Map<string, any>((data || []).map((r: any) => [r.cache_key, r]));
    const trafione = new Set<number>();

    setSuggestions(prev => services.map((s2, i) => {
      const wpis = poKluczu.get(klucze[i]);
      if (!wpis) return prev[i] || { name: s2.name, min: 0, max: 0, note: null };
      trafione.add(i);
      const zHistorii = prev[i];
      // Widelki z realnej historii zostaja; z pamieci bierzemy wtedy sam opis.
      if (zHistorii && zHistorii.source === 'history' && zHistorii.max > 0) {
        return { ...zHistorii, note: wpis.note || zHistorii.note };
      }
      // Oceny ceny NIE bierzemy z pamieci: zapamietany zakres jest wspolny dla
      // wszystkich warsztatow, a „za nisko / za wysoko" zalezy od tego, ile
      // bierze TEN warsztat. Liczymy ja tutaj, na miejscu.
      const minC = Number(wpis.min_price) || 0;
      const maxC = Number(wpis.max_price) || 0;
      const moja = Number(s2.currentPrice) || 0;
      const ocena: 'low' | 'ok' | 'high' | null = !moja || !maxC
        ? null
        : moja < minC * 0.9 ? 'low'
        : moja > maxC * 1.1 ? 'high'
        : 'ok';
      return {
        name: s2.name,
        min: minC,
        max: maxC,
        recommended: Number(wpis.recommended_price) || null,
        note: wpis.note || null,
        source: 'ai' as const,
        verdict: ocena,
      };
    }));

    return trafione;
  };

  /** Widelki z wlasnej historii warsztatu + wspolnej bazy portalu. */
  const fetchHistorySuggestions = async (): Promise<(Suggestion | null)[]> => {
    const doWyceny = services.filter(s => !isJunkService(s.name));
    if (doWyceny.length === 0) return services.map(() => null);

    // Pobieramy kandydatow po slowach kluczowych (a nie po calej nazwie) —
    // "wymiana rozrzadu" ma trafic tez w "rozrzad wymiana kompletna".
    const slowa = Array.from(new Set(doWyceny.flatMap(s => serviceKeywords(s.name)))).slice(0, 12);
    if (slowa.length === 0) return services.map(() => null);
    const filtr = slowa.map(w => `service_name_normalized.ilike.%${w}%`).join(',');

    // ZAPYTANIE O service_price_history USUNIĘTE (16.08).
    //
    // Dwa powody naraz. Po pierwsze jego wynik i tak nie był używany: odkąd
    // obowiązuje zasada „wycena bez auta się nie liczy", ta tabela nie może
    // zasilać widełek, bo nie trzyma pojazdu (patrz komentarz niżej).
    // Po drugie pytało o kolumny `price_net`/`price_gross`, których tam nie ma —
    // są `last_price_net`/`last_price_gross`. Czyli przy każdym otwarciu wyceny
    // leciało zapytanie, które zwracało błąd, a wynik i tak trafiał do kosza.
    const [globalne, zeZlecen] = await Promise.all([
      (supabase as any)
        .from('anonymous_service_prices')
        .select('service_name_normalized, price_net, price_gross, vehicle_brand, vehicle_model, engine_capacity, vehicle_year, fuel_type, city')
        .or(filtr)
        .limit(2000),
      // NAJWAZNIEJSZE ZRODLO: realne pozycje z wczesniejszych zlecen TEGO
      // warsztatu, razem z autem, na ktorym robota byla wykonana. To jest
      // odpowiedz na pytanie "ile bralem za to samo, przy podobnym aucie".
      providerId
        ? (supabase as any)
            .from('workshop_order_items')
            .select('name, unit_price_net, unit_price_gross, order:workshop_orders!inner(provider_id, vehicle:workshop_vehicles(brand, model, year, fuel_type, engine_capacity_cm3))')
            .eq('order.provider_id', providerId)
            .in('item_type', ['service', 'task'])
            .gt('unit_price_gross', 0)
            .or(slowa.map(w => `name.ilike.%${w}%`).join(','))
            .limit(1000)
        : Promise.resolve({ data: [] }),
    ]);

    // UWAGA: service_price_history nie trzyma pojazdu, wiec po wprowadzeniu
    // zasady „wycena bez auta sie nie liczy" nie moze juz zasilac widelek.
    // Zostaje jako zrodlo podpowiedzi nazw uslug przy pisaniu.
    const wlasneRekordy: PriceRecord[] = [];
    // Pozycje z wlasnych zlecen — z marka i modelem auta, wiec dzialaja
    // w zawezaniu "ten sam model → ta sama marka".
    const zeZlecenRekordy: PriceRecord[] = (zeZlecen?.data || [])
      // Ta sama zasada co przy wspolnej bazie: pozycja bez auta nie wchodzi.
      .filter((r: any) => r.order?.vehicle?.brand && r.order?.vehicle?.model)
      .map((r: any) => ({
      service_name_normalized: r.name,
      price_net: r.unit_price_net,
      price_gross: r.unit_price_gross,
      vehicle_brand: r.order?.vehicle?.brand ?? null,
      vehicle_model: r.order?.vehicle?.model ?? null,
      engine_capacity: r.order?.vehicle?.engine_capacity_cm3 ?? null,
      vehicle_year: r.order?.vehicle?.year ?? null,
      fuel_type: r.order?.vehicle?.fuel_type ?? null,
    }));

    const wlasneWszystkie = [...wlasneRekordy, ...zeZlecenRekordy];
    const wlasneKlucze = new Set(wlasneWszystkie.map(r => `${r.service_name_normalized}|${r.price_gross}`));
    // Wlasne ceny licza sie podwojnie — to stawki tego zakladu, nie srednia z rynku.
    const wszystkie: PriceRecord[] = [
      ...wlasneWszystkie, ...wlasneWszystkie,
      ...((globalne?.data as PriceRecord[]) || []),
    ];

    return services.map(s => {
      const dopasowanie = matchPrices(s.name, wszystkie, wlasneKlucze, {
        brand: vehicle?.brand,
        model: vehicle?.model,
        engineCapacity: vehicle?.engine_capacity_cm3,
        year: vehicle?.year,
        fuelType: vehicle?.fuel_type,
      }, mode);
      if (!dopasowanie) return null;
      // Zakres zlozony z jednej powtarzanej stawki to NIE widelki, tylko echo
      // wlasnej ceny warsztatu ("od 150 do 150"). Lepiej pokazac kreske i poczekac
      // na propozycje asystenta, niz udawac, ze to podpowiedz rynkowa.
      if (dopasowanie.degenerate) return null;
      // Zapamietujemy zakres z historii dla zapytania do asystenta — nawet gdy
      // jest to echo jednej stawki, bo dla modelu to nadal informacja o tym,
      // ile warsztat brał do tej pory.
      historiaRef.current[services.indexOf(s)] = {
        min: dopasowanie.min, max: dopasowanie.max,
        median: dopasowanie.median, count: dopasowanie.count,
      };

      // W kolumnie uwag NIE pokazujemy, ile bylo wycen ani czyje one byly.
      // Warsztat nie ma prawa wiedziec, ze „3 wyceny pochodza od innych" —
      // to informacja o cudzych danych. Liczby z historii siedza w widelkach
      // OD-DO, a w uwagach ma byc rzeczowy opis, co ta cena obejmuje —
      // dopisze go asystent, gdy tylko odpowie.
      return {
        name: s.name,
        min: dopasowanie.min,
        max: dopasowanie.max,
        source: 'history' as const,
        count: dopasowanie.count,
        own: dopasowanie.own,
        scope: dopasowanie.scope,
        degenerate: dopasowanie.degenerate,
        note: null,
      };
    });
  };

  /**
   * Sugestie od asystenta — w ROWNOLEGLYCH PACZKACH po kilka uslug.
   *
   * Wczesniej szlo jedno zapytanie z cala lista: model musial napisac kilkanascie
   * opisow po kolei, wiec czas rosl liniowo z liczba pozycji (jedna usluga ~5 s,
   * dwanascie — pol minuty). Teraz paczki lecą naraz, a kazda wraca osobno i od
   * razu ląduje w tabeli, wiec pierwsze uwagi widac po kilku sekundach.
   */
  const ROZMIAR_PACZKI = 3;

  const fetchAISuggestions = async (pomin: Set<number> = new Set()): Promise<boolean> => {
    /**
     * LIMIT SPRAWDZANY PRZED PYTANIEM, POBRANIE PO ODPOWIEDZI.
     *
     * Jedno uruchomienie Rido Wyceny to JEDNO pytanie — niezaleznie od tego,
     * ile pozycji jest w kosztorysie. Wewnatrz ida one rownoleglymi paczkami,
     * ale to nasza optymalizacja, nie sprawa warsztatu: policzenie mu czterech
     * pytan za jeden kosztorys byloby liczeniem wlasnej implementacji.
     *
     * Fail-closed: gdy nie wiadomo, czy jest pokrycie, nie pytamy.
     */
    const stan = await sprawdzRidoAi(providerId);
    if (!stan.wolno) {
      toast.error('Wykorzystales limit pytan do Rido AI w tym miesiacu.', {
        description: 'Przejdz na wyzszy plan albo poczekaj na odnowienie limitu razem z abonamentem.',
        duration: 8000,
      });
      return false;
    }

    const vehicleDesc = vehicle
      ? `${vehicle.brand || ''} ${vehicle.model || ''} rok ${vehicle.year || ''} silnik ${vehicle.engine_capacity_cm3 || ''}cm3 ${vehicle.fuel_type || ''}`.trim()
      : 'nieznany pojazd';

    // Pytamy TYLKO o pozycje, ktorych nie bylo w pamieci.
    const doZapytania = services
      .map((item, indeks) => ({ indeks, item }))
      .filter(({ indeks }) => !pomin.has(indeks));
    if (doZapytania.length === 0) return true;

    const paczki: { indeks: number; item: ServiceItem }[][] = [];
    doZapytania.forEach((wpis, i) => {
      const nr = Math.floor(i / ROZMIAR_PACZKI);
      (paczki[nr] ||= []).push(wpis);
    });

    const wyniki = await Promise.all(paczki.map(async (paczka) => {
      const lista = paczka
        .map((p, i) => {
          // Do modelu idzie tez to, co warsztat bral do tej pory za te usluge.
          // NIE jako gotowa odpowiedz — cena z historii nie znaczy, ze byla dobra —
          // tylko jako material do weryfikacji: model ma ocenic, czy te stawki
          // trzymaja poziom rynku dla TEGO auta i TEJ lokalizacji.
          const h = historiaRef.current[p.indeks];
          const kontekst = h && h.max > 0
            ? ` | dotychczasowe stawki tego warsztatu: ${h.min}-${h.max} zl (mediana ${h.median}, ${h.count} wycen)`
            : '';
          return `${i + 1}. ${p.item.name} | aktualna cena: ${p.item.currentPrice || 0} zl (${mode})${kontekst}`;
        })
        .join('\n');

      const systemPrompt = `Jestes ekspertem od wyceny uslug motoryzacyjnych w Polsce.

WYCENIASZ WYLACZNIE ROBOCIZNE — sama prace mechanika.
Czesci, oleje, filtry i materialy eksploatacyjne warsztat wycenia OSOBNO,
w oddzielnej tabeli kosztorysu. NIE WLICZAJ ich do ceny.
Przyklad: "serwis olejowy" to koszt WYMIANY oleju i filtrow (praca), a nie
koszt oleju i filtrow. Jesli chcesz uprzedzic o cenie czesci, napisz to
w polu note jako informacje dodatkowa — nigdy w kwotach min/max/recommended.

Pojazd: ${vehicleDesc}
Lokalizacja: ${city || 'nieznane'}, ${voivodeship || 'nieznane'}
Ceny podawaj w: ${mode === 'gross' ? 'brutto' : 'netto'}

Uslugi do wyceny (podaj cene ROBOCIZNY):
${lista}

Jesli podano dotychczasowe stawki warsztatu, POTRAKTUJ JE JAKO MATERIAL DO
WERYFIKACJI, a nie jako prawde. To, ze warsztat tyle brał, nie znaczy, ze liczyl
dobrze — mogl zanizac albo zawyzac przez lata. Sprawdz je wzgledem realiow rynku
dla TEJ marki, modelu, rocznika, silnika i TEJ lokalizacji, a nastepnie podaj
wlasny, uczciwy zakres. Jesli stawki warsztatu sa sensowne, zakres bedzie do nich
zblizony; jesli odbiegaja — skoryguj i napisz o tym w note.

Dla KAZDEJ uslugi:
1. podaj realistyczny zakres rynkowy OD-DO ROBOCIZNY dla tego konkretnego auta
   (marka, model, rocznik, silnik, paliwo) i tej lokalizacji — bez czesci,
2. ZAPROPONUJ konkretna stawke robocizny ("recommended"), ktora sam bys
   zastosowal — nie srodek zakresu na sile, tylko cena uczciwa dla klienta
   i oplacalna dla warsztatu przy tym nakladzie pracy (czas + trudnosc),
3. OCEN cene, ktora warsztat ma teraz ("verdict"): "low" gdy zanizona,
   "high" gdy zawyzona, "ok" gdy w rynku. Gdy warsztat nie ma jeszcze ceny
   (0 zl), ustaw verdict na null,
4. w polu note napisz zwiezle (2-3 zdania), co cena obejmuje, od czego zalezy
   i na co uwazac — np. ile czasu zajmuje, lancuch vs pasek, P+L, konieczna
   geometria po wymianie. Koszt czesci mozesz podac orientacyjnie jako
   informacje dodatkowa. Jesli STAWKA ROBOCIZNY warsztatu odbiega od rynku,
   napisz to wprost i uzasadnij.

Odpowiedz TYLKO tablica JSON, w tej samej kolejnosci co lista:
[{ "name": "nazwa", "min": liczba, "max": liczba, "recommended": liczba,
   "verdict": "low"|"ok"|"high"|null, "note": "opis" }]`;

      const result = await execute({
        feature: 'rido_price',
        taskType: 'pricing_suggestion',
        query: `Wycena uslug: ${lista}`,
        systemPrompt,
        mode: 'pro',
        contextHints: { vehicle: vehicleDesc, city, voivodeship, industry, priceUnit: mode },
      });

      if (!result || result.error) return false;
      try {
        const text = result.result || '';
        const dopasowanie = text.match(/\[[\s\S]*\]/);
        if (!dopasowanie) return false;
        const parsed = JSON.parse(dopasowanie[0]);

        // Kazda paczka wpada do tabeli OSOBNO — nie czekamy na pozostale.
        setSuggestions(prev => {
          const kopia = services.map((s2, i) => prev[i] || { name: s2.name, min: 0, max: 0, note: null });
          paczka.forEach((p, i) => {
            const ai = parsed[i] || {};
            if (!ai.min && !ai.max && !ai.note) return;
            const hasPL = PL_PATTERNS.test(p.item.name);
            const note = ai.note || (hasPL ? t('workshop.pricing.priceModal.plNote') : null);
            const zHistorii = prev[p.indeks];
            const rekomendacja = Number(ai.recommended) || null;
            const ocena = ['low', 'ok', 'high'].includes(ai.verdict) ? ai.verdict : null;
            // Zakres pokazuje ASYSTENT, bo to on zweryfikowal stawki wzgledem
            // rynku dla tej marki, modelu, rocznika, silnika i lokalizacji.
            // Historia poszla do niego jako material — sama w sobie nie dowodzi,
            // ze warsztat liczyl dobrze. Zakres z historii zostaje tylko wtedy,
            // gdy asystent nie podal wlasnego.
            const maZakresAI = (ai.min || 0) > 0 || (ai.max || 0) > 0;
            kopia[p.indeks] = {
              name: p.item.name,
              min: maZakresAI ? (ai.min || 0) : (zHistorii?.min || 0),
              max: maZakresAI ? (ai.max || 0) : (zHistorii?.max || 0),
              note: note || zHistorii?.note || null,
              source: maZakresAI ? ('ai' as const) : (zHistorii?.source ?? ('ai' as const)),
              recommended: rekomendacja,
              verdict: ocena,
            };
          });
          return kopia;
        });
        // Zapamietujemy odpowiedz, zeby nastepnym razem byla natychmiast.
        // Blad zapisu nie moze przeszkodzic w pokazaniu wyceny — to tylko pamiec.
        try {
          const opisAuta = {
            brand: vehicle?.brand,
            model: vehicle?.model,
            engineCapacity: vehicle?.engine_capacity_cm3,
            year: vehicle?.year,
          };
          const kubelki = cacheBuckets(opisAuta);
          const doZapisu = paczka
            .map((p, i) => ({ p, ai: parsed[i] || {} }))
            .filter(({ ai }) => ai.min || ai.max || ai.note)
            .map(({ p, ai }) => ({
              cache_key: priceCacheKey(p.item.name, opisAuta, mode),
              service_name: p.item.name,
              vehicle_brand: vehicle?.brand || null,
              vehicle_model: vehicle?.model || null,
              engine_bucket: kubelki.engine_bucket,
              year_bucket: kubelki.year_bucket,
              price_mode: mode,
              min_price: ai.min || null,
              max_price: ai.max || null,
              recommended_price: Number(ai.recommended) || null,
              note: ai.note || null,
              updated_at: new Date().toISOString(),
            }));
          if (doZapisu.length) {
            void (supabase as any).from('ai_price_cache').upsert(doZapisu, { onConflict: 'cache_key' });
          }
        } catch { /* pamiec jest opcjonalna */ }

        setError(null);
        return true;
      } catch {
        return false;
      }
    }));

    const udaloSie = wyniki.some(Boolean);

    /**
     * POBRANIE DOPIERO PO ODPOWIEDZI.
     *
     * Gdy model nie odpowiedzial na zadna paczke, warsztat nie ma za co placic —
     * i licznik zostaje nietkniety. Odswiezamy go od razu, zeby liczba w pasku
     * zeszla w tej samej chwili, bez przeladowania strony.
     */
    if (udaloSie) {
      const pobrane = await pobierzRidoAi(providerId);
      if (!pobrane) {
        // Nie ukrywamy tego: pytanie poszlo, a licznik nie zszedl. Lepiej, zeby
        // warsztat o tym wiedzial, niz zeby saldo cicho sie rozjezdzalo.
        console.error('[Rido Wycena] odpowiedz przyszla, ale pobranie jednostki sie nie udalo');
      }
      odswiezJednostki(CECHA_RIDO_AI);
    }

    return udaloSie;
  };

  const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const getSuggestedPrice = (index: number) => {
    const typed = Number((priceInputs[index] || '').replace(',', '.'));
    if (Number.isFinite(typed) && typed > 0) return typed;
    const suggestion = suggestions[index];
    if (!suggestion) return services[index]?.currentPrice || 0;
    return Math.round(((suggestion.min + suggestion.max) / 2) * 100) / 100;
  };

  const handlePriceChange = (index: number, value: string) => {
    setPriceInputs(prev => prev.map((item, idx) => idx === index ? value : item));
  };

  const handlePriceCommit = (index: number) => {
    const price = getSuggestedPrice(index);
    if (price > 0) {
      onApplySuggestions([{ index, price }]);
    }
  };

  const handleApplyAll = () => {
    const prices = services
      .map((_, index) => ({ index, price: getSuggestedPrice(index) }))
      .filter(item => item.price > 0);

    onApplySuggestions(prices);
    onOpenChange(false);
  };

  const vehicleLabel = vehicle
    ? `${vehicle.brand || ''} ${vehicle.model || ''} ${vehicle.engine_capacity_cm3 ? vehicle.engine_capacity_cm3 + ' cm3' : ''}`.trim()
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" data-tour="rido-okno">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            {t('workshop.pricing.priceModal.title')}
            {vehicleLabel && <span className="text-muted-foreground font-normal">— {vehicleLabel}</span>}
            {city && <span className="text-muted-foreground font-normal">| {city}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {t('workshop.pricing.priceModal.introPart1')}{' '}
          <span className="font-medium text-foreground">{t('workshop.pricing.priceModal.introHighlight')}</span>{' '}
          {t('workshop.pricing.priceModal.introPart2')}
        </div>

        {missingVehicleData ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-foreground">{t('workshop.pricing.priceModal.missingVehicleTitle')}</p>
                  <p className="text-muted-foreground">{t('workshop.pricing.priceModal.missingVehicleBody')}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={onCompleteVehicleData} className="gap-2">{t('workshop.pricing.priceModal.completeVehicleData')}</Button>
                  <Button variant="outline" onClick={() => onOpenChange(false)}>{t('workshop.pricing.close')}</Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 w-fit">
              <Button
                variant={mode === 'net' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setMode('net')}
              >
                {t('workshop.pricing.priceModal.net')}
              </Button>
              <Button
                variant={mode === 'gross' ? 'default' : 'ghost'}
                size="sm"
                className="text-xs h-7"
                onClick={() => setMode('gross')}
              >
                {t('workshop.pricing.priceModal.gross')}
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
                <span className="text-sm text-muted-foreground">{t('workshop.pricing.priceModal.loadingSuggestions')}</span>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchSuggestions}>
                  {t('workshop.pricing.tryAgain')}
                </Button>
              </div>
            ) : suggestions.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="p-2 text-left font-medium text-muted-foreground">{t('workshop.pricing.priceModal.colService')}</th>
                      <th className="p-2 text-right font-medium text-muted-foreground w-36">{t('workshop.pricing.priceModal.colYourPrice')}</th>
                      <th className="p-2 text-right font-medium text-muted-foreground w-28">{t('workshop.pricing.priceModal.colFrom')}</th>
                      <th className="p-2 text-right font-medium text-muted-foreground w-28">{t('workshop.pricing.priceModal.colTo')}</th>
                      <th className="p-2 text-left font-medium text-muted-foreground min-w-[320px]">{t('workshop.pricing.priceModal.colNotes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s, i) => (
                      <tr key={i} className="border-b align-top hover:bg-accent/20 transition-colors">
                        <td className="p-3 font-medium">
                          <div className="line-clamp-2">{s.name}</div>
                        </td>
                        <td className="p-3">
                          <Input
                            onFocus={e => e.currentTarget.select()}
                            value={priceInputs[i] ?? ''}
                            onChange={(e) => handlePriceChange(i, e.target.value)}
                            onBlur={() => handlePriceCommit(i)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur();
                            }}
                            inputMode="decimal"
                            className="h-10 text-right tabular-nums"
                            placeholder={s.recommended ? fmt(s.recommended) : (s.min && s.max ? fmt(Math.round((s.min + s.max) / 2)) : '0')}
                          />
                          {/* Konkretna propozycja asystenta — jedno klikniecie wstawia ja
                              do pola. Sama informacja „od-do" zostawiala decyzje w prozni. */}
                          {!!s.recommended && (
                            <button
                              type="button"
                              onClick={() => { handlePriceChange(i, String(s.recommended)); handlePriceCommit(i); }}
                              className="mt-1 w-full text-xs text-primary hover:underline underline-offset-2 text-right"
                            >
                              {t('workshop.pricing.priceModal.useSuggested', { price: fmt(s.recommended), defaultValue: `Zastosuj ${fmt(s.recommended)} zł` })}
                            </button>
                          )}
                          {s.verdict === 'low' && (
                            <p className="mt-1 text-[11px] text-amber-600 text-right">
                              {t('workshop.pricing.priceModal.priceLow', 'Poniżej rynku')}
                            </p>
                          )}
                          {s.verdict === 'high' && (
                            <p className="mt-1 text-[11px] text-amber-600 text-right">
                              {t('workshop.pricing.priceModal.priceHigh', 'Powyżej rynku')}
                            </p>
                          )}
                        </td>
                        {/* „0 zl" wygladalo jak wycena na zero. Dopoki nie ma danych,
                            pokazujemy kreske — brak wyniku to nie jest cena. */}
                        <td className="p-2 text-right tabular-nums">
                          {s.max > 0 ? `${fmt(s.min)} zł` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {s.max > 0 ? `${fmt(s.max)} zł` : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3">
                          {s.note ? (
                            <p className="text-sm leading-6 text-foreground/80">{s.note}</p>
                          ) : opisWDrodze ? (
                            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {t('workshop.pricing.priceModal.notePending', 'Asystent dopisuje uwagi…')}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">{t('workshop.pricing.priceModal.noExtraNotes')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground text-sm">{t('workshop.pricing.priceModal.noData')}</p>
            )}
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('workshop.pricing.close')}</Button>
          {!missingVehicleData && suggestions.length > 0 && (
            <Button data-tour="zastosuj-ceny" onClick={handleApplyAll} className="gap-2">
              <Sparkles className="h-4 w-4" />
              {t('workshop.pricing.priceModal.applyPrices')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
