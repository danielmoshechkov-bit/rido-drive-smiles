/**
 * POZYCJA FAKTURY ZA DOŁADOWANIE — ILOŚĆ I CENA JEDNOSTKOWA, NIE „1 × całość".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO BYŁO ŹLE (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Na fakturze stało „Minuty rozmów agenta", ilość 1, cena 42,44 zł. Klient nie
 * wie, ile minut kupił; księgowa też nie. Art. 106e ust. 1 pkt 8 ustawy o VAT
 * wymaga podania MIARY I ILOŚCI albo zakresu usługi, a pkt 9 — CENY
 * JEDNOSTKOWEJ netto. Jedno i drugie było fikcją: „1 sztuka po 42,44".
 *
 * Gorzej: przy `vehicle_lookup` sprzedawanym po 10 sztuk ktoś kupił 30 i na
 * dokumencie nie było po tym żadnego śladu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO NIE „PO PROSTU ILOŚĆ = LICZBA JEDNOSTEK"
 * ═══════════════════════════════════════════════════════════════════════════
 * Bo `rido_ai` kosztuje 0,3450 zł za pytanie, a Dyrektor KIS (interpretacje
 * z 12.2025 i 08.2026) rozstrzygnął, że **cena jednostkowa netto w złotych
 * z dokładnością większą niż dwa miejsca po przecinku jest niedopuszczalna** —
 * złoty nie ma nominału mniejszego niż grosz. Schemat FA(3) przyjmie osiem
 * miejsc (`P_9A` to `TKwotowy2`), faktura dostanie numer KSeF i będzie
 * merytorycznie wadliwa. **KSeF sprawdza XML, nie prawo podatkowe.**
 *
 * Zaokrąglenie 0,3450 → 0,35 też nie wchodzi: 200 × 0,35 = 70,00 zł przy
 * pobranych 69,00 zł netto. Dokument przestałby się zgadzać z przelewem.
 *
 * Wskazane przez KIS wyjście to ZMIANA JEDNOSTKI MIARY — sprzedaż w paczkach.
 * Dlatego reguła jest jedna i wynika z danych, nie z listy wyjątków:
 *
 *   cena za jednostkę mieści się w groszach  → ilość = liczba jednostek
 *   nie mieści się                           → ilość = 1, jednostka = paczka
 *
 * Dziś daje to:
 *   voice_minutes  30 min × 1,15 zł      (0,3450 to jedyny wyjątek)
 *   sms           100 szt. × 0,20 zł
 *   vehicle_lookup 30 szt. × 1,70 zł
 *   rido_ai        1 × „pakiet (200 pytań)" × 69,00 zł
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KWOTA POBRANA JEST ŚWIĘTA
 * ═══════════════════════════════════════════════════════════════════════════
 * Rozbicie na ilość i cenę liczy się od kwoty, którą operator NAPRAWDĘ pobrał,
 * i na końcu SPRAWDZA, czy suma wraca do tej samej złotówki. Gdy nie wraca —
 * schodzimy na jedną pozycję z ceną brutto, czyli zachowanie sprzed tej zmiany.
 * Nieczytelna faktura jest zła; faktura na inną kwotę niż przelew jest gorsza.
 */

/** Jednostki miary per produkt. Domyślnie `szt.`, ale patrz test kompletności. */
export const JEDNOSTKI: Record<string, { jednostka: string; wPaczce: string }> = {
  voice_minutes: { jednostka: "min", wPaczce: "minut" },
  sms: { jednostka: "szt.", wPaczce: "SMS-ów" },
  vehicle_lookup: { jednostka: "szt.", wPaczce: "sprawdzeń" },
  rido_ai: { jednostka: "pyt.", wPaczce: "pytań" },
};

export const JEDNOSTKA_DOMYSLNA = { jednostka: "szt.", wPaczce: "szt." };

export interface PozycjaFaktury {
  name: string;
  quantity: number;
  unit: string;
  vat_rate: number;
  unit_net_price?: number;
  unit_gross_price?: number;
}

const zaokr = (v: number) => Math.round(v * 100) / 100;

/**
 * Nazwa produktu bez doklejonej liczby.
 *
 * `rido_ai` nazywa się „Pakiet Rido AI — 200 pytań", bo tak brzmi w cenniku.
 * Na fakturze liczba stoi już w kolumnie ilości albo w jednostce, więc
 * zostawienie jej w nazwie dawałoby „…200 pytań | pakiet (200 pytań) | 1".
 * Ucinamy WYŁĄCZNIE końcówkę „— <liczba> <słowo>" — reszty nazwy nie ruszamy.
 */
export function nazwaBezLiczby(nazwa: string): string {
  return nazwa.replace(/\s*[—–-]\s*\d+\s+\p{L}+\s*$/u, "").trim() || nazwa.trim();
}

/**
 * Rozbicie doładowania na pozycję faktury.
 *
 * @param kod          kod produktu (`billing_addon_products.code`)
 * @param nazwa        nazwa produktu z cennika
 * @param jednostek    ile jednostek kupiono (`billing_orders.units`)
 * @param bruttoPobrane kwota, którą operator faktycznie pobrał
 * @param stawkaVat    stawka w procentach
 */
export function pozycjaDoladowania(
  kod: string | null | undefined,
  nazwa: string,
  jednostek: number | null | undefined,
  bruttoPobrane: number,
  stawkaVat = 23,
): PozycjaFaktury {
  const nazwaCzysta = nazwaBezLiczby(nazwa);
  const opis = JEDNOSTKI[String(kod ?? "")] ?? JEDNOSTKA_DOMYSLNA;
  const sztuk = Math.floor(Number(jednostek ?? 0));

  // Jedna pozycja z ceną brutto — zachowanie zapasowe. Zawsze zgadza się
  // z kwotą pobraną, bo bierze ją wprost.
  const zapasowa: PozycjaFaktury = {
    name: sztuk > 0 ? `${nazwaCzysta} — ${sztuk} ${opis.wPaczce}` : nazwaCzysta,
    quantity: 1,
    unit: sztuk > 0 ? `pakiet (${sztuk} ${opis.wPaczce})` : "szt.",
    unit_gross_price: bruttoPobrane,
    vat_rate: stawkaVat,
  };

  if (sztuk <= 0 || !(bruttoPobrane > 0)) return zapasowa;

  // Netto „w stu" z kwoty pobranej — tak samo liczy `billing-invoice-issue`.
  const nettoRazem = zaokr(bruttoPobrane / (1 + stawkaVat / 100));
  const cenaJednostkowa = zaokr(nettoRazem / sztuk);

  // Czy rozbicie wraca do tej samej kwoty CO DO GROSZA — i netto, i brutto.
  const nettoZRozbicia = zaokr(sztuk * cenaJednostkowa);
  const vatZRozbicia = zaokr(nettoZRozbicia * stawkaVat / 100);
  const bruttoZRozbicia = zaokr(nettoZRozbicia + vatZRozbicia);

  if (nettoZRozbicia !== nettoRazem || bruttoZRozbicia !== zaokr(bruttoPobrane)) {
    return zapasowa;
  }

  return {
    name: nazwaCzysta,
    quantity: sztuk,
    unit: opis.jednostka,
    unit_net_price: cenaJednostkowa,
    vat_rate: stawkaVat,
  };
}
