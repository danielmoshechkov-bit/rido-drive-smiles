/**
 * POZYCJA FAKTURY ZA DOŁADOWANIE — ZAWSZE JEDEN PAKIET.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CO BYŁO ŹLE (13.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Na fakturze stało „Minuty rozmów agenta", ilość 1, cena 42,44 zł — bez
 * liczby minut. Klient nie wiedział, za co zapłacił; księgowa też nie.
 * Art. 106e ust. 1 pkt 8 ustawy o VAT wymaga podania miary i ilości albo
 * ZAKRESU wykonanych usług.
 *
 * Gorzej: `vehicle_lookup` nie ma `max_units`, więc ktoś kupił trzydzieści
 * sprawdzeń i na dokumencie nie było po tym żadnego śladu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO PAKIET, A NIE SZTUKI
 * ═══════════════════════════════════════════════════════════════════════════
 * Bo tak wygląda sprzedaż. Klient nie może dokupić jednego SMS-a ani jednego
 * sprawdzenia — bierze cały pakiet albo nic (`min_units` = `step`). Faktura ma
 * odzwierciedlać to, co się faktycznie sprzedało, a sprzedał się pakiet.
 *
 * Zakres usługi z pkt 8 niesie NAZWA: „Pakiet SMS — 100 wiadomości" mówi
 * dokładnie, co klient dostał.
 *
 * Zaletą uboczną jest to, że znika cała klasa błędów z groszami. Gdyby liczyć
 * po sztuce, `rido_ai` kosztuje 0,3450 zł za pytanie — a Dyrektor KIS
 * (interpretacje 12.2025 i 08.2026) rozstrzygnął, że cena jednostkowa netto
 * w złotych z dokładnością większą niż dwa miejsca po przecinku jest
 * NIEDOPUSZCZALNA, bo złoty nie ma nominału mniejszego niż grosz. Zaokrąglenie
 * do 0,35 dałoby 200 × 0,35 = 70,00 zł przy pobranych 69,00 — dokument
 * niezgodny z przelewem.
 *
 * Przy jednym pakiecie cena pakietu JEST kwotą pobraną, więc żadne mnożenie
 * nie ma jak się rozjechać.
 *
 * ⚠️ To nie znaczy, że schemat by tego nie przyjął. `P_9A` w FA(3) ma typ
 * `TKwotowy2` z ośmioma miejscami po przecinku — wadliwa faktura dostałaby
 * numer KSeF i UPO. **KSeF sprawdza XML, nie prawo podatkowe.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POLA KSEF PRZY TYM PODEJŚCIU
 * ═══════════════════════════════════════════════════════════════════════════
 * Nic ponad to, co już wysyłamy, i wszystko zgodne:
 *   P_7  nazwa      → „Pakiet SMS — 100 wiadomości" (zakres usługi)
 *   P_8A miara      → „pakiet"
 *   P_8B ilość      → 1
 *   P_9A cena netto → cena pakietu, dwa miejsca po przecinku
 *   P_11 wartość    → ta sama kwota; 1 × cena zawsze się zgadza
 */

/**
 * Nazwa pakietu i słowo opisujące jednostkę — per produkt.
 *
 * Nazwy z cennika („Wiadomości SMS") zostają nietknięte: tam sprzedają,
 * tutaj opisują dokument. To dwie różne role tego samego produktu.
 */
export const PAKIETY: Record<string, { nazwa: string; jednostka: string }> = {
  voice_minutes: { nazwa: "Pakiet minut agenta", jednostka: "minut" },
  sms: { nazwa: "Pakiet SMS", jednostka: "wiadomości" },
  vehicle_lookup: { nazwa: "Pakiet sprawdzeń pojazdu", jednostka: "VIN" },
  rido_ai: { nazwa: "Pakiet Rido AI", jednostka: "pytań" },
};

export interface PozycjaFaktury {
  name: string;
  quantity: number;
  unit: string;
  vat_rate: number;
  unit_gross_price: number;
}

/**
 * Nazwa produktu bez doklejonej liczby — dla kodów spoza `PAKIETY`.
 *
 * `rido_ai` nazywa się w cenniku „Pakiet Rido AI — 200 pytań". Gdyby taka
 * nazwa trafiła na fakturę razem z doklejaną tu liczbą, wyszłoby
 * „…— 200 pytań — 200 pytań". Ucinamy WYŁĄCZNIE końcówkę „— <liczba> <słowo>".
 */
export function nazwaBezLiczby(nazwa: string): string {
  return nazwa.replace(/\s*[—–-]\s*\d+\s+\p{L}+\s*$/u, "").trim() || nazwa.trim();
}

/**
 * Rozbicie doładowania na pozycję faktury.
 *
 * @param kod           kod produktu (`billing_addon_products.code`)
 * @param nazwa         nazwa produktu z cennika (użyta, gdy kod nieznany)
 * @param jednostek     ile jednostek kupiono (`billing_orders.units`)
 * @param bruttoPobrane kwota, którą operator faktycznie pobrał
 * @param stawkaVat     stawka w procentach
 */
export function pozycjaDoladowania(
  kod: string | null | undefined,
  nazwa: string,
  jednostek: number | null | undefined,
  bruttoPobrane: number,
  stawkaVat = 23,
): PozycjaFaktury {
  const pakiet = PAKIETY[String(kod ?? "")];
  const podstawa = pakiet?.nazwa ?? nazwaBezLiczby(nazwa);
  const sztuk = Math.floor(Number(jednostek ?? 0));

  return {
    // Liczba w nazwie, bo to ona niesie ZAKRES USŁUGI. Bez znanej liczby
    // jednostek nie zmyślamy jej — zostaje sama nazwa.
    name: sztuk > 0 ? `${podstawa} — ${sztuk} ${pakiet?.jednostka ?? "szt."}` : podstawa,
    quantity: 1,
    unit: "pakiet",
    // BRUTTO, nie netto: operator pobrał konkretną kwotę i to ona rozstrzyga.
    // `billing-invoice-issue` liczy „w stu", więc suma faktury zgadza się
    // z obciążeniem co do grosza.
    unit_gross_price: bruttoPobrane,
    vat_rate: stawkaVat,
  };
}
