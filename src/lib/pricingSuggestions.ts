/**
 * Dopasowanie cen z historii — fundament „Rido Wyceny".
 *
 * Skąd biorą się widełki:
 *  1. własna historia warsztatu (service_price_history) — najmocniejszy sygnał,
 *     bo to ceny, które ten warsztat realnie brał,
 *  2. wspólna baza portalu (anonymous_service_prices) — wyceny innych zakładów,
 *     z marką, modelem i miastem, dzięki czemu da się szukać „takie samo auto".
 *
 * Dwa problemy, które ten plik rozwiązuje:
 *
 * ROZDROBNIENIE NAZW. Wyceny wpisuje człowiek, więc „wymiana rozrządu",
 * „rozrząd - wymiana" i „wymiana rozrzadu kompletna" trafiały do bazy jako trzy
 * różne usługi. Przy 490 wycenach dawało to 305 różnych nazw i tylko 28 usług
 * z co najmniej trzema cenami — baza nie miała szans się nauczyć. Dlatego
 * dopasowujemy po SŁOWACH KLUCZOWYCH, a nie po całym napisie.
 *
 * WARTOŚCI SKRAJNE. Jedna pomyłkowa cena (0 zł albo 10× za dużo) rozwalała
 * widełki liczone jako min–max. Liczymy więc kwartyle (25%–75%), czyli zakres,
 * w którym mieści się środkowa połowa realnych wycen.
 */

export interface PriceRecord {
  service_name_normalized: string;
  price_net: number;
  price_gross: number;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  engine_capacity?: number | null;
  vehicle_year?: number | null;
  fuel_type?: string | null;
  city?: string | null;
}

export interface RangeResult {
  min: number;
  max: number;
  median: number;
  /** Ile wycen złożyło się na ten zakres. */
  count: number;
  /** Jak blisko było dopasowanie auta — pokazujemy to użytkownikowi. */
  scope: 'exact' | 'model' | 'brand' | 'any';
  /** Ile z tych wycen pochodzi z własnej historii warsztatu. */
  own: number;
}

/** Słowa, które nic nie znaczą przy dopasowaniu (są w co drugiej nazwie). */
const STOP = new Set([
  'wymiana', 'wymienic', 'naprawa', 'naprawic', 'serwis', 'kompletna', 'komplet',
  'szt', 'sztuk', 'usluga', 'robocizna', 'oraz', 'przy', 'dla', 'plus', 'strona',
]);

/** Oczywiste śmieci z testów — nie mogą wpływać na wycenę dla klienta. */
const SMIECI = /^(asd|qwe|zxc|test|aaa|xxx|abc|123)+$/i;

export const normalizeServiceName = (name: string) =>
  String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Znaczące słowa nazwy usługi — po nich szukamy podobnych wycen. */
export const serviceKeywords = (name: string): string[] => {
  const slowa = normalizeServiceName(name).split(' ').filter(Boolean);
  const znaczace = slowa.filter(w => w.length >= 4 && !STOP.has(w));
  // Gdy zostanie pustka (np. sama „wymiana"), bierzemy cokolwiek sensownego.
  return znaczace.length ? znaczace : slowa.filter(w => w.length >= 3);
};

/**
 * Rdzeń słowa — ucina polskie końcówki, żeby „rozrządu", „rozrzad" i „rozrzadem"
 * były tym samym pojęciem. Nie robimy pełnej odmiany: wystarczy, że warianty
 * tego samego słowa spotkają się na wspólnym rdzeniu.
 */
const rdzen = (w: string) => {
  let x = w;
  for (const k of ['ami', 'ach', 'owi', 'em', 'ow', 'ie', 'ia', 'ych', 'ym', 'y', 'i', 'a', 'e', 'u', 'ę', 'ą']) {
    if (x.length - k.length >= 4 && x.endsWith(k)) { x = x.slice(0, x.length - k.length); break; }
  }
  return x;
};

/**
 * Odległość edycyjna z limitem — tanio wykrywa literówki. Obsługuje też
 * PRZESTAWIONE litery („klcoki" zamiast „klocki"), bo przy szybkim pisaniu to
 * najczęstsza pomyłka, a zwykłe liczenie różnic uznawało ją za dwa błędy.
 */
const bliskoLiterowo = (a: string, b: string, limit = 1) => {
  if (Math.abs(a.length - b.length) > limit) return false;
  let i = 0, j = 0, roznice = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++roznice > limit) return false;
    // przestawione sasiednie znaki liczymy jako JEDNA pomylke
    if (a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; continue; }
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return roznice + (a.length - i) + (b.length - j) <= limit;
};

const teSameSlowo = (a: string, b: string) => {
  if (a === b) return true;
  const ra = rdzen(a), rb = rdzen(b);
  if (ra === rb) return true;
  if (ra.length >= 4 && rb.length >= 4 && (ra.startsWith(rb) || rb.startsWith(ra))) return true;
  return a.length >= 5 && b.length >= 5 && bliskoLiterowo(a, b);
};

/**
 * 0 = nic wspólnego, 1 = ta sama usługa.
 *
 * Celowo NIE wymagamy jednego, sztywnego nazewnictwa — mechanik pisze, jak mu
 * wygodnie („wymiana rozrządu", „rozrząd wymiana", „rozrzad + pompa wody”), a
 * dopasowanie ma to zrozumieć. Liczy się pokrycie słów znaczących, po rdzeniach
 * i z tolerancją na literówki.
 */
export const similarity = (a: string, b: string): number => {
  const ka = serviceKeywords(a);
  const kb = serviceKeywords(b);
  if (!ka.length || !kb.length) return 0;
  const wspolne = ka.filter(w => kb.some(x => teSameSlowo(w, x)));
  // Dzielimy przez KROTSZA liste: „rozrzad" ma pasowac do „wymiana rozrzadu
  // z pompa wody", bo to nadal ta sama robota, tylko opisana dokladniej.
  return wspolne.length / Math.min(ka.length, kb.length);
};

/** Slowa kluczowe sprowadzone do rdzenia — „rozrzadu" i „rozrzad" to jedno. */
export const serviceStems = (name: string) => serviceKeywords(name).map(rdzen).sort();

export const isJunkService = (name: string) => {
  const n = normalizeServiceName(name).replace(/\s/g, '');
  return n.length < 3 || SMIECI.test(n);
};

const percentyl = (posortowane: number[], p: number) => {
  if (posortowane.length === 0) return 0;
  if (posortowane.length === 1) return posortowane[0];
  const idx = (posortowane.length - 1) * p;
  const dol = Math.floor(idx);
  const gora = Math.ceil(idx);
  if (dol === gora) return posortowane[dol];
  return posortowane[dol] + (posortowane[gora] - posortowane[dol]) * (idx - dol);
};

/**
 * Widełki z listy cen. Przy 4+ wycenach obcinamy skrajne (kwartyle), przy
 * mniejszej liczbie pokazujemy pełny zakres — bo nie ma czego obcinać.
 */
export const computeRange = (ceny: number[]) => {
  const dodatnie = ceny.filter(c => Number.isFinite(c) && c > 0).sort((a, b) => a - b);
  if (dodatnie.length === 0) return null;
  const min = dodatnie.length >= 4 ? percentyl(dodatnie, 0.25) : dodatnie[0];
  const max = dodatnie.length >= 4 ? percentyl(dodatnie, 0.75) : dodatnie[dodatnie.length - 1];
  return {
    min: Math.round(min),
    max: Math.round(max),
    median: Math.round(percentyl(dodatnie, 0.5)),
    count: dodatnie.length,
  };
};

/**
 * Dobiera wyceny do jednej usługi, zawężając kolejno: to samo auto → ta sama
 * marka → dowolne auto. Bierzemy pierwszy poziom, na którym są co najmniej
 * dwie wyceny — lepiej podać zakres z trzech aut tej marki niż z jednej sztuki
 * dokładnie tego modelu.
 */
export const matchPrices = (
  serviceName: string,
  rekordy: PriceRecord[],
  wlasneKlucze: Set<string>,
  vehicle: {
    brand?: string | null;
    model?: string | null;
    engineCapacity?: number | null;
    year?: number | null;
    fuelType?: string | null;
  } | null,
  mode: 'net' | 'gross',
  minPodobienstwo = 0.5,
): RangeResult | null => {
  if (isJunkService(serviceName)) return null;

  // ZASADA: wycena bez auta nie ma wartosci. Ta sama robota kosztuje inaczej
  // w Fabii 1.0 i w BMW 520d, wiec cena bez marki i modelu niczego nie mowi
  // i tylko rozmywa widelki. Takie wpisy pomijamy — nawet na poziomie
  // "caly rynek".
  const zAutem = rekordy.filter(r =>
    String(r.vehicle_brand || '').trim().length > 0
    && String(r.vehicle_model || '').trim().length > 0);

  const pasujace = zAutem.filter(r =>
    !isJunkService(r.service_name_normalized)
    && similarity(serviceName, r.service_name_normalized) >= minPodobienstwo);
  if (pasujace.length === 0) return null;

  const marka = (vehicle?.brand || '').toLowerCase().trim();
  const model = (vehicle?.model || '').toLowerCase().trim();
  const pojemnosc = vehicle?.engineCapacity || 0;
  const rok = vehicle?.year || 0;
  const paliwo = (vehicle?.fuelType || '').toLowerCase().trim();

  const tenModel = (r: PriceRecord) =>
    (r.vehicle_brand || '').toLowerCase().trim() === marka
    && (r.vehicle_model || '').toLowerCase().trim().startsWith(model.split(' ')[0]);

  // Silnik: 15% tolerancji (1.4 TSI ~ 1390-1400 cm3, roznie wpisywane).
  const tenSilnik = (r: PriceRecord) => {
    if (!pojemnosc || !r.engine_capacity) return false;
    return Math.abs(r.engine_capacity - pojemnosc) / pojemnosc <= 0.15;
  };
  // Rocznik: +/- 3 lata, czyli zwykle ta sama generacja i ten sam poziom cen.
  const tenRocznik = (r: PriceRecord) => {
    if (!rok || !r.vehicle_year) return false;
    return Math.abs(r.vehicle_year - rok) <= 3;
  };
  const toPaliwo = (r: PriceRecord) =>
    !paliwo || !r.fuel_type || r.fuel_type.toLowerCase().trim() === paliwo;

  const poziomy: { scope: RangeResult['scope']; lista: PriceRecord[] }[] = [
    {
      // Najtrafniejszy poziom: ten model, ten silnik/rocznik, to samo paliwo.
      scope: 'exact',
      lista: marka && model && (pojemnosc || rok)
        ? pasujace.filter(r => tenModel(r) && toPaliwo(r) && (tenSilnik(r) || tenRocznik(r)))
        : [],
    },
    {
      scope: 'model',
      lista: marka && model ? pasujace.filter(tenModel) : [],
    },
    {
      scope: 'brand',
      lista: marka ? pasujace.filter(r => (r.vehicle_brand || '').toLowerCase().trim() === marka) : [],
    },
    { scope: 'any', lista: pasujace },
  ];

  for (const { scope, lista } of poziomy) {
    if (lista.length < 2 && scope !== 'any') continue;
    const zakres = computeRange(lista.map(r => (mode === 'gross' ? r.price_gross : r.price_net)));
    if (!zakres) continue;
    const own = lista.filter(r => wlasneKlucze.has(`${r.service_name_normalized}|${r.price_gross}`)).length;
    return { ...zakres, scope, own };
  }
  return null;
};

/**
 * Klucz zapamietanej odpowiedzi asystenta.
 *
 * Zaokraglamy silnik do 100 cm3, a rocznik do 3 lat — Insignia 1598 cm3 z 2016
 * i 1600 cm3 z 2017 to dla wyceny to samo auto, wiec maja trafiac w ten sam
 * wpis. Bez tego prawie kazde zapytanie bylo "nowe" i pamiec nic by nie dawala.
 */
export const priceCacheKey = (
  serviceName: string,
  vehicle: { brand?: string | null; model?: string | null; engineCapacity?: number | null; year?: number | null } | null,
  mode: 'net' | 'gross',
) => {
  const usluga = serviceStems(serviceName).join('-') || normalizeServiceName(serviceName);
  const marka = normalizeServiceName(vehicle?.brand || 'brak');
  const model = normalizeServiceName(vehicle?.model || 'brak').split(' ')[0];
  const silnik = vehicle?.engineCapacity ? Math.round(vehicle.engineCapacity / 100) * 100 : 0;
  const rocznik = vehicle?.year ? Math.round(vehicle.year / 3) * 3 : 0;
  return [usluga, marka, model, silnik, rocznik, mode].join('|');
};

/** Zaokraglenia uzywane w kluczu — zapisujemy je razem z wpisem. */
export const cacheBuckets = (vehicle: { engineCapacity?: number | null; year?: number | null } | null) => ({
  engine_bucket: vehicle?.engineCapacity ? Math.round(vehicle.engineCapacity / 100) * 100 : null,
  year_bucket: vehicle?.year ? Math.round(vehicle.year / 3) * 3 : null,
});
